import cv2
import mediapipe as mp
import numpy as np
import os
import time
import base64
from datetime import datetime
from io import BytesIO
import threading
from google import genai
from google.genai import types
from PIL import Image
import hashlib

from dotenv import load_dotenv

# Initialize MediaPipe Hand solution
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,  # Changed from 1 to 2 to detect both hands
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# Initialize drawing canvas
canvas = None
prev_points = {0: None, 1: None}  # Track previous points for both hands
drawing_colors = {
    0: (0, 0, 255),  # Red color for first hand
    1: (0, 255, 0)   # Green color for second hand
}
drawing_thickness = 5
eraser_thickness = 50  # Eraser is thicker than the pen

# Create output directory for saved images
save_dir = "saved_drawings"
os.makedirs(save_dir, exist_ok=True)

# Create directory for Gemini enhanced images
enhanced_dir = "enhanced_drawings"
os.makedirs(enhanced_dir, exist_ok=True)

# Gemini API settings
load_dotenv()
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")  # Load from environment variable if set
GEMINI_MODEL = "gemini-2.0-flash-exp-image-generation"  # Using the specified image generation model

# Initialize enhanced image placeholder
enhanced_image = None
is_processing = False

# Auto-enhancement variables
last_drawing_time = time.time()
debounce_delay = 3.0  # Wait for 3 seconds of no drawing before enhancing
auto_enhance_enabled = True
last_enhancement_time = 0
min_enhancement_interval = 10.0  # Minimum seconds between enhancements
last_enhanced_canvas = None  # Store the canvas that was last enhanced
enhancement_threshold = 0.98  # Similarity threshold to trigger new enhancement

# Initialize Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

# Function to calculate image similarity using embeddings/histograms
def calculate_image_similarity(img1, img2):
    if img1 is None or img2 is None:
        return 0.0
        
    # Convert to grayscale
    if len(img1.shape) == 3:
        img1_gray = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
    else:
        img1_gray = img1
        
    if len(img2.shape) == 3:
        img2_gray = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
    else:
        img2_gray = img2
    
    # Resize both images to same dimensions for comparison
    img1_resized = cv2.resize(img1_gray, (64, 64))
    img2_resized = cv2.resize(img2_gray, (64, 64))
    
    # Apply blur to reduce noise
    img1_blurred = cv2.GaussianBlur(img1_resized, (5, 5), 0)
    img2_blurred = cv2.GaussianBlur(img2_resized, (5, 5), 0)
    
    # Calculate histograms
    hist1 = cv2.calcHist([img1_blurred], [0], None, [64], [0, 256])
    hist2 = cv2.calcHist([img2_blurred], [0], None, [64], [0, 256])
    
    # Normalize histograms
    cv2.normalize(hist1, hist1, 0, 1, cv2.NORM_MINMAX)
    cv2.normalize(hist2, hist2, 0, 1, cv2.NORM_MINMAX)
    
    # Compare histograms (higher value means more similar)
    similarity = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
    
    # Also calculate structural similarity for additional measure
    try:
        ssim = cv2.matchTemplate(img1_blurred, img2_blurred, cv2.TM_CCOEFF_NORMED)[0][0]
        # Combine the two measures (weighted average)
        combined_similarity = (similarity * 0.6) + (max(0, ssim) * 0.4)
        return combined_similarity
    except:
        # If template matching fails, just return histogram similarity
        return similarity

# Function to enhance drawing with Gemini
def enhance_drawing_with_gemini(drawing, prompt=""):
    global enhanced_image, is_processing
    
    if not GEMINI_API_KEY:
        print("Error: Gemini API key is not set. Cannot enhance drawing.")
        error_img = np.zeros((drawing.shape[0], drawing.shape[1], 3), dtype=np.uint8)
        cv2.putText(error_img, "API KEY NOT SET", (error_img.shape[1]//4, error_img.shape[0]//2), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        enhanced_image = error_img
        is_processing = False
        return
    
    try:
        # Convert OpenCV image to PIL Image
        drawing_rgb = cv2.cvtColor(drawing, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(drawing_rgb)
        
        # Convert the image to bytes and then to base64
        buffered = BytesIO()
        pil_image.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        # Create a thread to handle the Gemini API call
        def process_with_gemini(prompt_text):
            global enhanced_image, is_processing
            try:
                # Default prompt if none provided
                if not prompt_text:
                    prompt_text = "Enhance this sketch into an image with more detail."
                
                # Prepare the prompt and image data
                contents = [
                    {"text": prompt_text},
                    {"inlineData": {
                        "mimeType": "image/jpeg",
                        "data": img_str
                    }}
                ]
                
                # Set the configuration
                config = types.GenerateContentConfig(response_modalities=['Text', 'Image'])
                
                # Generate the enhanced image
                response = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=contents,
                    config=config
                )
                
                print("RESPONSE: ", response)
                
                # Process the response
                for part in response.candidates[0].content.parts:
                    if part.text is not None:
                        print("Text response:", part.text)
                    elif part.inline_data is not None:
                        # Convert the generated image to OpenCV format
                        image = Image.open(BytesIO(part.inline_data.data))
                        img_array = np.array(image)
                        if len(img_array.shape) == 3 and img_array.shape[2] == 3:
                            img = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                        else:
                            img = img_array
                        
                        # Save the enhanced image
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        enhanced_path = f"{enhanced_dir}/enhanced_{timestamp}.png"
                        cv2.imwrite(enhanced_path, img)
                        print(f"Enhanced image saved to {enhanced_path}")
                        
                        # Update the global enhanced image
                        enhanced_image = img.copy()  # Ensure we make a copy
                        print("Enhanced image successfully set to display")
                        break
                
                # If no image was found in the response
                if enhanced_image is None:
                    print("No enhanced image found in Gemini response")
                    error_img = np.zeros((drawing.shape[0], drawing.shape[1], 3), dtype=np.uint8)
                    cv2.putText(error_img, "No image in response", (error_img.shape[1]//4, error_img.shape[0]//2), 
                                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    enhanced_image = error_img
            
            except Exception as e:
                print(f"Error enhancing drawing with Gemini: {str(e)}")
                error_img = np.zeros((drawing.shape[0], drawing.shape[1], 3), dtype=np.uint8)
                cv2.putText(error_img, f"ERROR: {str(e)[:30]}...", (10, error_img.shape[0]//2), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                enhanced_image = error_img
            
            finally:
                is_processing = False
        
        # Start the processing thread
        is_processing = True
        
        # Create a "Processing..." image while waiting
        processing_img = np.zeros((drawing.shape[0], drawing.shape[1], 3), dtype=np.uint8)
        cv2.putText(processing_img, "Processing with Gemini...", (processing_img.shape[1]//4, processing_img.shape[0]//2), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        enhanced_image = processing_img
        
        # Start processing in background
        threading.Thread(target=process_with_gemini, args=(prompt,)).start()
        
    except Exception as e:
        print(f"Error preparing drawing for Gemini: {str(e)}")
        is_processing = False

# Function to check for debounced drawing activity and trigger enhancement
def check_for_auto_enhancement(current_canvas):
    global last_drawing_time, is_processing, auto_enhance_enabled
    global last_enhancement_time, last_enhanced_canvas
    
    current_time = time.time()
    
    # Don't even check if processing is already happening
    if is_processing:
        return False
        
    # Don't check if auto-enhance is disabled
    if not auto_enhance_enabled:
        return False
        
    # Enforce minimum interval between enhancement requests
    if (current_time - last_enhancement_time) < min_enhancement_interval:
        return False
    
    # If enough time has passed since last drawing activity and canvas has content
    if (auto_enhance_enabled and 
        not is_processing and 
        (current_time - last_drawing_time) > debounce_delay):
        
        # Check if the canvas has meaningful content (not just a blank canvas)
        # Convert to grayscale and count non-zero pixels
        gray_canvas = cv2.cvtColor(current_canvas, cv2.COLOR_BGR2GRAY)
        non_zero = cv2.countNonZero(gray_canvas)
        
        # If canvas has meaningful content, check if it's different from last enhanced canvas
        if non_zero > 1000:  # Threshold for minimum drawing size
            
            # Compare with last enhanced canvas
            if last_enhanced_canvas is not None:
                similarity = calculate_image_similarity(current_canvas, last_enhanced_canvas)
                print(f"Canvas similarity with last enhanced: {similarity:.4f}")
                
                # If canvas is very similar to the last enhanced one, don't enhance again
                if similarity > enhancement_threshold:
                    return False
            
            # If we reach here, the canvas has changed enough to warrant a new enhancement
            print(f"Auto-enhancing drawing... (Time since last enhancement: {current_time - last_enhancement_time:.1f}s)")
            last_enhancement_time = current_time
            
            # Store current canvas as the one being enhanced
            last_enhanced_canvas = current_canvas.copy()
            
            # Trigger enhancement
            vibe_prompt = "Convert this rough sketch into an image of a low-poly 3D model. Include all the objects in the image, with nothing else."
            colorful_prompt = "Turn this sketch into a polished, colorful illustration with creative details."
            enhance_drawing_with_gemini(current_canvas, vibe_prompt)
            return True
    
    return False

# Function to determine hand gestures and mode
def determine_hand_mode(landmarks):
    # Calculate finger states - are they extended or not?
    fingers_extended = []
    
    # For thumb (using different method)
    thumb_tip = landmarks[4]
    wrist = landmarks[0]
    index_mcp = landmarks[5]  # Index finger MCP joint
    thumb_extended = thumb_tip[0] < landmarks[3][0] if wrist[0] < index_mcp[0] else thumb_tip[0] > landmarks[3][0]
    fingers_extended.append(thumb_extended)
    
    # For other fingers (compare y-coordinate of tip with PIP joint)
    fingers_extended.append(landmarks[8][1] < landmarks[6][1])   # Index
    fingers_extended.append(landmarks[12][1] < landmarks[10][1]) # Middle
    fingers_extended.append(landmarks[16][1] < landmarks[14][1]) # Ring
    fingers_extended.append(landmarks[20][1] < landmarks[18][1]) # Pinky
    
    # FEATURE 1: DRAWING MODE - Only index finger is extended
    if fingers_extended[1] and not fingers_extended[2] and not fingers_extended[3] and not fingers_extended[4]:
        return "Drawing", fingers_extended
    # FEATURE 2: ERASER MODE - Closed fist (no fingers extended)
    elif not any(fingers_extended):
        return "Erasing", fingers_extended
    # FEATURE 3: CLEAR ALL - Middle finger extended only
    elif not fingers_extended[0] and not fingers_extended[1] and fingers_extended[2] and not fingers_extended[3] and not fingers_extended[4]:
        return "Clear All", fingers_extended
    else:
        # Any other hand position
        return "None", fingers_extended

# Start webcam
cap = cv2.VideoCapture(0)  # Using camera index is subject to change
if not cap.isOpened():
    print("Cannot open camera")
    exit()

# Get initial frame to set canvas size
success, frame = cap.read()
if not success:
    print("Can't receive frame from camera")
    exit()
    
h, w, _ = frame.shape
canvas = np.zeros((h, w, 3), dtype=np.uint8)

# Create a window for the combined view (original + enhanced)
cv2.namedWindow('Hand Drawing', cv2.WINDOW_NORMAL)
cv2.resizeWindow('Hand Drawing', w*2, h)  # Double width to show both images side by side

# Status text variables
mode_text = {0: "No Hand", 1: "No Hand"}
color_text = {0: "Red", 1: "Green"}
auto_enhance_status = "AUTO-ENHANCE: ON"

# Initialize variables
last_enhancement_time = time.time()
last_enhanced_canvas = None

while True:
    # Read frame from webcam
    success, frame = cap.read()
    if not success:
        print("Can't receive frame")
        break
        
    # Flip the frame horizontally for a more intuitive mirror view
    frame = cv2.flip(frame, 1)
    
    # Convert BGR to RGB
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Process hand landmarks
    results = hands.process(rgb_frame)
    
    # Display canvas on frame
    combined_img = cv2.addWeighted(frame, 0.7, canvas, 0.3, 0)
    
    # Initialize tracking variables
    was_drawing = False
    hand_modes = {}
    hand_landmarks_dict = {}
    
    if results.multi_hand_landmarks:
        # Process all detected hands
        for hand_idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
            # Make sure we only process the first two hands (in case more are detected)
            if hand_idx > 1:
                break
                
            # Draw hand landmarks
            mp_drawing.draw_landmarks(
                combined_img, 
                hand_landmarks, 
                mp_hands.HAND_CONNECTIONS
            )
            
            # Get landmarks positions
            landmarks = []
            for lm in hand_landmarks.landmark:
                landmarks.append([int(lm.x * w), int(lm.y * h)])
            
            # Store landmarks for this hand
            hand_landmarks_dict[hand_idx] = landmarks
            
            # Determine the mode for this hand
            mode, fingers = determine_hand_mode(landmarks)
            hand_modes[hand_idx] = mode
            
            # Get current hand position (for drawing or erasing)
            current_point = tuple(landmarks[8])  # Using index finger tip for all modes
            
            # DRAWING MODE
            if mode == "Drawing":
                mode_text[hand_idx] = "Drawing Mode"
                was_drawing = True
                
                # Update last drawing time for debouncing
                last_drawing_time = time.time()
                
                # Draw circle at index finger tip position
                cv2.circle(combined_img, current_point, 10, drawing_colors[hand_idx], -1)
                
                # Draw line on canvas
                if prev_points[hand_idx]:
                    cv2.line(canvas, prev_points[hand_idx], current_point, drawing_colors[hand_idx], drawing_thickness)
                
                prev_points[hand_idx] = current_point
                
            # ERASER MODE
            elif mode == "Erasing":
                mode_text[hand_idx] = "Eraser Mode"
                was_drawing = True
                
                # Update last drawing time for debouncing
                last_drawing_time = time.time()
                
                # Draw eraser circle
                cv2.circle(combined_img, current_point, eraser_thickness, (255, 255, 255), -1)
                cv2.circle(combined_img, current_point, eraser_thickness, (0, 0, 0), 2)
                
                # Erase from canvas (draw black with thicker line)
                if prev_points[hand_idx]:
                    cv2.line(canvas, prev_points[hand_idx], current_point, (0, 0, 0), eraser_thickness)
                
                prev_points[hand_idx] = current_point
                
            # CLEAR ALL MODE
            elif mode == "Clear All":
                mode_text[hand_idx] = "Cleared Canvas"
                was_drawing = True
                
                # Update last drawing time for debouncing
                last_drawing_time = time.time()
                
                # Clear the entire canvas
                canvas = np.zeros((h, w, 3), dtype=np.uint8)
                prev_points = {0: None, 1: None}  # Reset all previous points
                
            else:
                # Any other hand position - stop drawing/erasing
                mode_text[hand_idx] = "Not Drawing"
                prev_points[hand_idx] = None
    
    # If no hands detected or fewer than 2 hands, update missing hand status
    for i in range(2):
        if i not in hand_modes:
            mode_text[i] = "No Hand Detected"
            prev_points[i] = None
    
    # If we were not actively drawing/erasing, check if we should auto-enhance (only check periodically)
    if not was_drawing and not is_processing and (int(time.time() * 5) % 5 == 0):
        check_for_auto_enhancement(canvas.copy())
    
    # Display status information on the frame
    cv2.putText(combined_img, f"Hand 1: {mode_text.get(0, 'No Hand')}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(combined_img, f"Hand 2: {mode_text.get(1, 'No Hand')}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(combined_img, f"Color 1: {color_text[0]}", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, drawing_colors[0], 2)
    cv2.putText(combined_img, f"Color 2: {color_text[1]}", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.7, drawing_colors[1], 2)
    cv2.putText(combined_img, auto_enhance_status, (10, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, 
                (0, 255, 0) if auto_enhance_enabled else (0, 0, 255), 2)
    
    # Show similarity debug info if there's a previous enhanced canvas
    if last_enhanced_canvas is not None and auto_enhance_enabled:
        similarity = calculate_image_similarity(canvas, last_enhanced_canvas)
        similarity_color = (0, 255, 0) if similarity < enhancement_threshold else (0, 0, 255)
        cv2.putText(combined_img, f"Similarity: {similarity:.2f}", (10, 180), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, similarity_color, 2)
    
    # Draw guidelines for gestures at the bottom of the screen
    help_y = h - 75
    cv2.putText(combined_img, "INDEX FINGER: Draw | FIST: Erase | MIDDLE FINGER: Clear All", 
                (10, help_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(combined_img, "Keyboard for Hand 1: r,g,b,y,p=Colors", 
                (10, help_y + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(combined_img, "Keyboard for Hand 2: 1,2,3,4,5=Colors", 
                (10, help_y + 50), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(combined_img, "G=Manual enhance | a=Toggle auto | s=Save | q=Quit", 
                (10, help_y + 75), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    
    # Create a combined image to display (original + enhanced)
    display_img = combined_img.copy()
    
    # If we have an enhanced image, add it to the right side
    if enhanced_image is not None:
        # Resize enhanced image to match the canvas height
        enhanced_resized = cv2.resize(enhanced_image, (w, h))
        
        # Create a side-by-side display image
        display_img = np.zeros((h, w*2, 3), dtype=np.uint8)
        display_img[:, :w] = combined_img
        display_img[:, w:] = enhanced_resized
        
        # Add a dividing line
        cv2.line(display_img, (w, 0), (w, h), (255, 255, 255), 2)
        
        # Add an "Enhanced" label on the right side
        cv2.putText(display_img, "Enhanced Drawing", (w + 10, 30), 
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    
    # Display the resulting frame
    cv2.imshow('Hand Drawing', display_img)
    
    # Controls
    key = cv2.waitKey(1) & 0xFF
    if key == 27 or key == ord('q'):  # Esc or q to quit
        break
    elif key == ord('c'):  # c to clear canvas
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
    elif key == ord('s'):  # s to save the current drawing
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{save_dir}/drawing_{timestamp}.png"
        
        # Save the canvas
        cv2.imwrite(filename, canvas)
        
        # Provide feedback on the screen
        print(f"Drawing saved to {filename}")
        
        # Show feedback on screen
        feedback_img = combined_img.copy()
        cv2.putText(feedback_img, "Drawing Saved!", (w//2 - 100, h//2), 
                cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.imshow('Hand Drawing', feedback_img)
        cv2.waitKey(1000)  # Show message for 1 second
        
        # Clear the canvas for a new drawing
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
    elif key == ord('G'):  # capital G to manually enhance with Gemini
        if not is_processing:
            print("Manually enhancing drawing with Gemini...")
            enhance_drawing_with_gemini(canvas, "Turn this sketch into a polished, colorful illustration with creative details.")
    elif key == ord('a'):  # a to toggle auto-enhancement
        auto_enhance_enabled = not auto_enhance_enabled
        auto_enhance_status = "AUTO-ENHANCE: ON" if auto_enhance_enabled else "AUTO-ENHANCE: OFF"
        print(f"Auto-enhancement: {'enabled' if auto_enhance_enabled else 'disabled'}")
    elif key == ord('t'):  # t to adjust enhancement threshold
        # Toggle between three sensitivity levels
        if enhancement_threshold > 0.95:
            enhancement_threshold = 0.85  # More sensitive (enhances with smaller changes)
            print("Enhancement sensitivity: HIGH (threshold: 0.85)")
        elif enhancement_threshold > 0.80:
            enhancement_threshold = 0.75  # Very sensitive
            print("Enhancement sensitivity: VERY HIGH (threshold: 0.75)")
        else:
            enhancement_threshold = 0.98  # Less sensitive (requires bigger changes)
            print("Enhancement sensitivity: LOW (threshold: 0.98)")
            
    # Colors for first hand
    elif key == ord('r'):  # r for red
        drawing_colors[0] = (0, 0, 255)
        color_text[0] = "Red"
    elif key == ord('g'):  # g for green
        drawing_colors[0] = (0, 255, 0)
        color_text[0] = "Green"
    elif key == ord('b'):  # b for blue
        drawing_colors[0] = (255, 0, 0)
        color_text[0] = "Blue"
    elif key == ord('y'):  # y for yellow
        drawing_colors[0] = (0, 255, 255)
        color_text[0] = "Yellow"
    elif key == ord('p'):  # p for purple
        drawing_colors[0] = (255, 0, 255)
        color_text[0] = "Purple"
        
    # Colors for second hand
    elif key == ord('1'):  # 1 for red (second hand)
        drawing_colors[1] = (0, 0, 255)
        color_text[1] = "Red"
    elif key == ord('2'):  # 2 for green (second hand)
        drawing_colors[1] = (0, 255, 0)
        color_text[1] = "Green"
    elif key == ord('3'):  # 3 for blue (second hand)
        drawing_colors[1] = (255, 0, 0)
        color_text[1] = "Blue"
    elif key == ord('4'):  # 4 for yellow (second hand)
        drawing_colors[1] = (0, 255, 255)
        color_text[1] = "Yellow"
    elif key == ord('5'):  # 5 for purple (second hand)
        drawing_colors[1] = (255, 0, 255)
        color_text[1] = "Purple"
        
    elif key == ord('+') or key == ord('='):  # + to increase thickness
        drawing_thickness = min(30, drawing_thickness + 1)
    elif key == ord('-'):  # - to decrease thickness
        drawing_thickness = max(1, drawing_thickness - 1)
    elif key == ord('e'):  # e to toggle eraser size
        eraser_thickness = 40 if eraser_thickness == 20 else 20

# Release resources
cap.release()
cv2.destroyAllWindows()
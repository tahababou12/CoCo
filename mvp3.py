import cv2
import mediapipe as mp
import numpy as np
import os
import time
from datetime import datetime

# Initialize MediaPipe Hand solution
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# Initialize drawing canvas
canvas = None
prev_point = None
drawing_color = (0, 0, 255)  # Red color by default
drawing_thickness = 5
eraser_thickness = 20  # Eraser is thicker than the pen

# Create output directory for saved images
save_dir = "saved_drawings"
os.makedirs(save_dir, exist_ok=True)

# Start webcam
cap = cv2.VideoCapture(1)  # Using camera index 1 as specified
if not cap.isOpened():
    print("Cannot open camera")
    exit()

# Get initial frame to set canvas size
success, frame = cap.read()
if not success:
    print("Can't receive frame")
    exit()
    
h, w, _ = frame.shape
canvas = np.zeros((h, w, 3), dtype=np.uint8)

# Status text variables
mode_text = "Drawing Mode"
color_text = "Red"

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
    
    # Initialize hand mode
    hand_mode = "None"
    
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
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
            
            # Get current hand position (for drawing or erasing)
            current_point = tuple(landmarks[8])  # Using index finger tip for all modes
            
            # FEATURE 1: DRAWING MODE - Only index finger is extended
            if fingers_extended[1] and not fingers_extended[2] and not fingers_extended[3] and not fingers_extended[4]:
                hand_mode = "Drawing"
                mode_text = "Drawing Mode"
                
                # Draw circle at index finger tip position
                cv2.circle(combined_img, current_point, 10, drawing_color, -1)
                
                # Draw line on canvas
                if prev_point:
                    cv2.line(canvas, prev_point, current_point, drawing_color, drawing_thickness)
                
                prev_point = current_point
                
            # FEATURE 2: ERASER MODE - Closed fist (no fingers extended)
            elif not any(fingers_extended):
                hand_mode = "Erasing"
                mode_text = "Eraser Mode"
                
                # Draw eraser circle
                cv2.circle(combined_img, current_point, eraser_thickness, (255, 255, 255), -1)
                cv2.circle(combined_img, current_point, eraser_thickness, (0, 0, 0), 2)
                
                # Erase from canvas (draw black with thicker line)
                if prev_point:
                    cv2.line(canvas, prev_point, current_point, (0, 0, 0), eraser_thickness)
                
                prev_point = current_point
                
            # FEATURE 3: CLEAR ALL - Middle finger extended only
            elif not fingers_extended[0] and not fingers_extended[1] and fingers_extended[2] and not fingers_extended[3] and not fingers_extended[4]:
                hand_mode = "Clear All"
                mode_text = "Cleared Canvas"
                
                # Clear the entire canvas
                canvas = np.zeros((h, w, 3), dtype=np.uint8)
                prev_point = None
                
            else:
                # Any other hand position - stop drawing/erasing
                hand_mode = "None"
                mode_text = "Not Drawing"
                prev_point = None
                
    else:
        # If no hand is detected, reset previous point
        prev_point = None
        hand_mode = "None"
        mode_text = "No Hand Detected"
    
    # Display status information on the frame
    cv2.putText(combined_img, mode_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
    cv2.putText(combined_img, f"Color: {color_text}", (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, drawing_color, 2)
    
    # Draw guidelines for gestures at the bottom of the screen
    help_y = h - 30
    cv2.putText(combined_img, "Index finger: Draw | Fist: Erase | Middle finger: Clear All", 
                (10, help_y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    cv2.putText(combined_img, "Keyboard: r,g,b,y,p=Colors | +/- = thickness | s=Save | q=Quit", 
                (10, help_y + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
    
    # Display the resulting frame
    cv2.imshow('Hand Drawing', combined_img)
    
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
        feedback_text = f"Saved to {filename}"
        
        # Show feedback on screen
        cv2.putText(combined_img, "Drawing Saved!", (w//2 - 100, h//2), 
                   cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
        cv2.imshow('Hand Drawing', combined_img)
        cv2.waitKey(1000)  # Show message for 1 second
        
        # Clear the canvas for a new drawing
        canvas = np.zeros((h, w, 3), dtype=np.uint8)
    elif key == ord('r'):  # r for red
        drawing_color = (0, 0, 255)
        color_text = "Red"
    elif key == ord('g'):  # g for green
        drawing_color = (0, 255, 0)
        color_text = "Green"
    elif key == ord('b'):  # b for blue
        drawing_color = (255, 0, 0)
        color_text = "Blue"
    elif key == ord('y'):  # y for yellow
        drawing_color = (0, 255, 255)
        color_text = "Yellow"
    elif key == ord('p'):  # p for purple
        drawing_color = (255, 0, 255)
        color_text = "Purple"
    elif key == ord('+') or key == ord('='):  # + to increase thickness
        drawing_thickness = min(30, drawing_thickness + 1)
    elif key == ord('-'):  # - to decrease thickness
        drawing_thickness = max(1, drawing_thickness - 1)
    elif key == ord('e'):  # e to toggle eraser size
        eraser_thickness = 40 if eraser_thickness == 20 else 20

# Release resources
cap.release()
cv2.destroyAllWindows()
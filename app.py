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

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize MediaPipe Hand solution
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
hands = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)

# Setup Google Generative AI
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GEMINI_API_KEY:
    raise EnvironmentError("GOOGLE_API_KEY not found in environment variables")

# Configure the Gemini client
client = genai.Client(api_key=GEMINI_API_KEY)

# Use Gemini 1.5 Pro since it has better image handling
GEMINI_MODEL = "gemini-2.0-flash-exp-image-generation"  # Using the specified image generation model

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Ensure directories exist
img_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
enhanced_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "enhanced_drawings")
os.makedirs(img_dir, exist_ok=True)
os.makedirs(enhanced_dir, exist_ok=True)

# Store processing state
processing_status = {}
is_processing = False

# Function to enhance drawing with Gemini - directly adapted from mvp2hands.py
def enhance_drawing_with_gemini(image_path, prompt="", request_id=None):
    global is_processing
    
    if not GEMINI_API_KEY:
        error_msg = "Error: Gemini API key is not set. Cannot enhance drawing."
        print(error_msg)
        processing_status[request_id] = {"status": "error", "message": error_msg}
        is_processing = False
        return None
    
    try:
        # Read the image
        drawing = cv2.imread(image_path)
        if drawing is None:
            error_msg = f"Error: Could not read image from {image_path}"
            print(error_msg)
            processing_status[request_id] = {"status": "error", "message": error_msg}
            is_processing = False
            return None
        
        # Convert OpenCV image to PIL Image
        drawing_rgb = cv2.cvtColor(drawing, cv2.COLOR_BGR2RGB)
        pil_image = Image.fromarray(drawing_rgb)
        
        # Get original image dimensions
        original_width, original_height = pil_image.size
        
        # Convert the image to bytes and then to base64
        buffered = BytesIO()
        pil_image.save(buffered, format="JPEG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
        
        # Create a thread to handle the Gemini API call
        def process_with_gemini(prompt_text):
            global is_processing
            try:
                # Default prompt if none provided
                if not prompt_text:
                    prompt_text = "Enhance this sketch into an image with more detail."
                
                print(f"Processing with prompt: {prompt_text}")
                
                # Prepare the prompt and image data
                contents = [
                    {"text": prompt_text},
                    {"inlineData": {
                        "mimeType": "image/jpeg",
                        "data": img_base64
                    }}
                ]
                
                # Set the configuration
                config = types.GenerateContentConfig(response_modalities=['Text', 'Image'])
                
                # Generate the enhanced image
                # client = genai.Client(api_key=GEMINI_API_KEY)
                response = client.models.generate_content(
                    model=GEMINI_MODEL,
                    contents=contents,
                    config=config
                )
                
                print("RESPONSE: ", response)
                
                # Process the response
                success = False
                
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'text') and part.text is not None:
                        print("Text response:", part.text)
                    elif hasattr(part, 'inline_data') and part.inline_data is not None:
                        try:
                            # Convert the generated image to OpenCV format
                            image_data = part.inline_data.data
                            
                            # Make sure we're working with bytes
                            if isinstance(image_data, str):
                                image_bytes = base64.b64decode(image_data)
                            else:
                                image_bytes = image_data
                                
                            # Open as PIL Image
                            image = Image.open(BytesIO(image_bytes))
                            img_array = np.array(image)
                            
                            if len(img_array.shape) == 3 and img_array.shape[2] == 3:
                                img = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                            else:
                                img = img_array
                            
                            # Get enhanced image dimensions
                            enhanced_width, enhanced_height = image.size
                            
                            # Save the enhanced image
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            enhanced_filename = f"enhanced_{timestamp}.png"
                            enhanced_path = os.path.join(enhanced_dir, enhanced_filename)
                            cv2.imwrite(enhanced_path, img)
                            print(f"Enhanced image saved to {enhanced_path}")
                            
                            # Create base64 image data for direct embedding in frontend
                            img_buffer = BytesIO()
                            image.save(img_buffer, format="PNG")
                            enhanced_base64 = base64.b64encode(img_buffer.getvalue()).decode("utf-8")
                            
                            # Update response status with additional data needed for interactive behavior
                            processing_status[request_id] = {
                                "status": "complete",
                                "result": {
                                    "filename": enhanced_filename,
                                    "path": f"/enhanced/{enhanced_filename}",
                                    "absolute_path": enhanced_path,
                                    "width": enhanced_width,
                                    "height": enhanced_height,
                                    "original_width": original_width,
                                    "original_height": original_height,
                                    "base64Data": enhanced_base64,
                                    "prompt": prompt_text
                                }
                            }
                            success = True
                            break
                        except Exception as img_error:
                            print(f"Error processing image data: {str(img_error)}")
                            processing_status[request_id] = {
                                "status": "error", 
                                "message": f"Error processing image data: {str(img_error)}"
                            }
                
                # If no image was found in the response
                if not success:
                    error_msg = "No enhanced image found in Gemini response"
                    print(error_msg)
                    processing_status[request_id] = {"status": "error", "message": error_msg}
            
            except Exception as e:
                error_msg = f"Error enhancing drawing with Gemini: {str(e)}"
                print(error_msg)
                processing_status[request_id] = {"status": "error", "message": error_msg}
            
            finally:
                is_processing = False
        
        # Start the processing thread
        processing_status[request_id] = {"status": "processing"}
        is_processing = True
        
        # Create a thread to handle the Gemini API call
        threading.Thread(target=process_with_gemini, args=(prompt,)).start()
        
        return None
        
    except Exception as e:
        error_msg = f"Error preparing drawing for Gemini: {str(e)}"
        print(error_msg)
        processing_status[request_id] = {"status": "error", "message": error_msg}
        is_processing = False
        return None

# Function to determine hand gestures and mode - from mvp2hands.py
# This is not used directly in the web API but kept for reference
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


# API endpoint to save canvas image
@app.route('/api/save-image', methods=['POST'])
def save_image():
    try:
        data = request.json
        image_data = data.get('imageData')
        
        if not image_data:
            return jsonify({"error": "No image data provided"}), 400
        
        # Extract the base64 data from the data URL
        base64_data = image_data.replace('data:image/png;base64,', '')
        
        # Generate a unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"canvas-drawing-{timestamp}.png"
        filepath = os.path.join(img_dir, filename)
        
        # Save the file
        with open(filepath, 'wb') as f:
            f.write(base64.b64decode(base64_data))
        
        print(f"Image saved to {filepath}")
        
        # Return the file path
        return jsonify({
            "success": True,
            "filename": filename,
            "path": f"/img/{filename}",
            "absolutePath": filepath
        })
    except Exception as e:
        print(f"Error saving image: {str(e)}")
        return jsonify({"error": "Failed to save image", "details": str(e)}), 500


# API endpoint to enhance an image
@app.route('/api/enhance-image', methods=['POST'])
def enhance_image():
    global is_processing
    
    try:
        data = request.json
        filename = data.get('filename')
        prompt = data.get('prompt', '')
        
        print(f"Received enhancement request for file: {filename}, with prompt: {prompt}")
        
        if not filename:
            return jsonify({"error": "No filename provided"}), 400
        
        # Check if another enhancement is already in progress
        if is_processing:
            print("Enhancement request rejected: Another enhancement is already in progress")
            return jsonify({
                "error": "Another enhancement is already in progress", 
                "status": "busy"
            }), 429  # Too Many Requests
        
        # Construct the path to the saved image
        filepath = os.path.join(img_dir, filename)
        
        if not os.path.exists(filepath):
            print(f"Enhancement request rejected: File {filename} not found at {filepath}")
            return jsonify({"error": f"Image file {filename} not found"}), 404
        
        # Check if file is a valid image
        try:
            img = Image.open(filepath)
            img_width, img_height = img.size
            print(f"Image validation successful. Dimensions: {img_width}x{img_height}")
        except Exception as img_error:
            print(f"Enhancement request rejected: Invalid image file - {str(img_error)}")
            return jsonify({"error": f"Invalid image file: {str(img_error)}"}), 400
        
        # Generate a unique request ID
        request_id = f"req_{datetime.now().timestamp()}"
        print(f"Starting enhancement with request ID: {request_id}")
        
        # Trigger the enhancement in a background thread
        enhance_drawing_with_gemini(filepath, prompt, request_id)
        
        # Return immediately with the request ID for status polling
        return jsonify({
            "success": True,
            "requestId": request_id,
            "message": "Enhancement started"
        })
    except Exception as e:
        error_msg = f"Error requesting image enhancement: {str(e)}"
        print(error_msg)
        # Log detailed error information for debugging
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Failed to process enhancement request", "details": str(e)}), 500


# API endpoint to check the status of an enhancement request
@app.route('/api/enhancement-status/<request_id>', methods=['GET'])
def check_enhancement_status(request_id):
    try:
        print(f"Checking status for request ID: {request_id}")
        
        if request_id not in processing_status:
            print(f"Request ID not found: {request_id}")
            return jsonify({"error": "Request ID not found"}), 404
        
        status = processing_status[request_id]
        print(f"Status for request {request_id}: {status.get('status', 'unknown')}")
        
        # If processing is complete, we can clean up the status entry
        if status.get("status") in ["complete", "error"]:
            # Keep the status for a while in case of multiple polls
            # In a production app, you might want to implement a cleanup strategy
            pass
        
        return jsonify(status)
    except Exception as e:
        error_msg = f"Error checking enhancement status: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return jsonify({"error": "Error checking status", "details": str(e)}), 500


# Serve static files from the img and enhanced directories
@app.route('/img/<path:filename>')
def serve_image(filename):
    return send_from_directory(img_dir, filename)

@app.route('/enhanced/<path:filename>')
def serve_enhanced_image(filename):
    return send_from_directory(enhanced_dir, filename)


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True) 
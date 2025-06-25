import cv2
import mediapipe as mp
import numpy as np
import os
import base64
from datetime import datetime
from io import BytesIO
import threading
from google import genai
from google.genai import types
from PIL import Image
import platform
import subprocess

from flask import Flask, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from dotenv import load_dotenv

from story_video_generator import StoryVideoGenerator

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
story_videos_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "story_videos")
gen_music_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gen_music")
os.makedirs(img_dir, exist_ok=True)
os.makedirs(enhanced_dir, exist_ok=True)
os.makedirs(story_videos_dir, exist_ok=True)
os.makedirs(gen_music_dir, exist_ok=True)

# Storyboard settings
storyboard_images = []  # List to store storyboard images (filenames only)
storyboard_image_data = []  # List to store storyboard image data for UI

# Initialize video generator
video_generator = StoryVideoGenerator(enhanced_dir=enhanced_dir, output_dir=story_videos_dir)
video_playing = False
current_video = None

# Store processing state
processing_status = {}
is_processing = False
video_processing_status = {}
is_video_processing = False

# Function to enhance drawing with Gemini - directly adapted from mvp2hands.py. Modify the prompts to take in some context from the user now.
def enhance_drawing_with_gemini(image_path, prompt="", request_id=None):
    global is_processing

    print(f"enhance_drawing_with_gemini called with prompt: {prompt}")
    
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
                            
                            # The image from Gemini is already in RGB format (PIL format)
                            # Save the enhanced image in RGB format to avoid color space issues
                            # Get enhanced image dimensions
                            enhanced_width, enhanced_height = image.size
                            
                            # Save the enhanced image in RGB format using PIL
                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            enhanced_filename = f"enhanced_{timestamp}.png"
                            enhanced_path = os.path.join(enhanced_dir, enhanced_filename)
                            image.save(enhanced_path, format="PNG")
                            print(f"Enhanced image saved to {enhanced_path}")
                            
                            # Create base64 image data from the RGB array for frontend
                            # Use the same PIL image for base64 encoding
                            img_buffer = BytesIO()
                            image.save(img_buffer, format="PNG")
                            enhanced_base64 = base64.b64encode(img_buffer.getvalue()).decode("utf-8")
                            print(f"Generated base64 data length: {len(enhanced_base64)}")
                            
                            # Update response status with additional data needed for interactive behavior
                            processing_status[request_id] = {
                                "status": "complete",
                                "result": {
                                    "filename": enhanced_filename,
                                    "path": f"/enhanced_drawings/{enhanced_filename}",
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

# Function to add image to storyboard
def add_to_storyboard(image_path, image_data=None):
    """Add an image to the storyboard by its file path and optionally image data"""
    global storyboard_images, storyboard_image_data
    
    print(f"add_to_storyboard called with image_path: {image_path}")
    print(f"Current storyboard_images before adding: {storyboard_images}")
    
    # Check if the file exists
    if not os.path.exists(image_path):
        print(f"Error: Image file {image_path} not found")
        return False
    
    # Check if image is already in storyboard to prevent duplicates
    if image_path in storyboard_images:
        print(f"Image {image_path} is already in storyboard, skipping duplicate")
        return True  # Return True since the image is already there
    
    # Add the file path to storyboard images
    storyboard_images.append(image_path)
    print(f"Added {image_path} to storyboard_images")
    print(f"Storyboard_images after adding: {storyboard_images}")
    
    # If image data is provided, add it to the storyboard image data
    if image_data:
        storyboard_image_data.append(image_data)
        print(f"Added provided image_data to storyboard_image_data")
    else:
        # Read image and convert to base64 for client display
        try:
            # Try to read as PIL Image first (for RGB images)
            try:
                pil_img = Image.open(image_path)
                # Convert PIL image to RGB if it's not already
                if pil_img.mode != 'RGB':
                    pil_img = pil_img.convert('RGB')
                
                # Convert to base64
                img_buffer = BytesIO()
                pil_img.save(img_buffer, format='PNG')
                img_base64 = base64.b64encode(img_buffer.getvalue()).decode('utf-8')
                
                # Get image dimensions
                width, height = pil_img.size
                
            except Exception as pil_error:
                # Fallback to OpenCV for BGR images
                print(f"PIL failed, trying OpenCV: {pil_error}")
                img = cv2.imread(image_path)
                if img is not None:
                    # Convert BGR to RGB to fix color inversion issue
                    img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    _, buffer = cv2.imencode('.png', img)
                    img_base64 = base64.b64encode(buffer).decode('utf-8')
                    
                    # Get image dimensions
                    height, width = img.shape[:2]
                else:
                    raise Exception("Could not read image with either PIL or OpenCV")
            
            storyboard_image_data.append({
                "path": image_path,
                "filename": os.path.basename(image_path),
                "base64Data": img_base64,
                "width": width,
                "height": height
            })
            print(f"Added image data for {os.path.basename(image_path)} to storyboard_image_data")
        except Exception as e:
            print(f"Error reading image for storyboard: {str(e)}")
            return False
    
    print(f"Final storyboard_images: {storyboard_images}")
    print(f"Final storyboard_image_data filenames: {[img.get('filename', 'unknown') for img in storyboard_image_data]}")
    return True

# Function to generate and play video (background processing)
def generate_video_background(request_id, story_context=None, include_music=False):
    global is_video_processing
    
    try:
        video_processing_status[request_id] = {"status": "processing", "message": "Video generation started"}
        
        # Ensure we have enough images
        if len(storyboard_images) < 2:
            error_msg = "Need at least 2 images to generate a video"
            print(error_msg)
            video_processing_status[request_id] = {"status": "error", "message": error_msg}
            is_video_processing = False
            return
        
        print(f"Storyboard images before video generation: {storyboard_images}")
        print(f"Number of storyboard images: {len(storyboard_images)}")
        print(f"Include music: {include_music}")
        for i, img_path in enumerate(storyboard_images):
            print(f"Storyboard image {i+1}: {img_path}")
        
        # Generate video using the storyboard images, pass include_music parameter
        video_path = video_generator.generate_video(storyboard_images, story_context, include_music)
        
        if video_path:
            # Get relative path for client
            rel_path = os.path.relpath(video_path, os.path.dirname(os.path.abspath(__file__)))
            video_url = f"/videos/{os.path.basename(video_path)}"
            print(f"Video generated successfully: {video_path}")
            
            video_processing_status[request_id] = {
                "status": "complete", 
                "result": {
                    "path": video_path,
                    "url": video_url,
                    "filename": os.path.basename(video_path)
                }
            }
        else:
            video_processing_status[request_id] = {"status": "error", "message": "Failed to generate video"}
    except Exception as e:
        error_msg = f"Error generating video: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        video_processing_status[request_id] = {"status": "error", "message": error_msg}
    finally:
        is_video_processing = False

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

# API endpoint to add an image to the storyboard
@app.route('/api/storyboard/add', methods=['POST'])
def add_to_storyboard_api():
    try:
        data = request.json
        image_path = data.get('imagePath')  # This could be an absolute path or relative URL
        
        print(f"=== ADDING IMAGE TO STORYBOARD ===")
        print(f"Received image_path: {image_path}")
        
        if not image_path:
            return jsonify({"error": "No image path provided"}), 400
        
        # Handle different path formats
        if image_path.startswith('/enhanced_drawings/') or image_path.startswith('/img/'):
            # Extract the filename and build the absolute path
            filename = os.path.basename(image_path)
            if image_path.startswith('/enhanced_drawings/'):
                absolute_path = os.path.join(enhanced_dir, filename)
            else:
                absolute_path = os.path.join(img_dir, filename)
        else:
            # Assume it's already an absolute path
            absolute_path = image_path
            
        print(f"Resolved absolute_path: {absolute_path}")
        print(f"File exists: {os.path.exists(absolute_path)}")
            
        # Verify file exists
        if not os.path.exists(absolute_path):
            return jsonify({"error": f"Image file not found at {absolute_path}"}), 404
            
        # Add image to storyboard
        success = add_to_storyboard(absolute_path)
        
        print(f"Add to storyboard success: {success}")
        print(f"Current storyboard_images: {storyboard_images}")
        print(f"Current storyboard_image_data filenames: {[img.get('filename', 'unknown') for img in storyboard_image_data]}")
        
        if success:
            # Check if this was a duplicate (image was already in storyboard)
            is_duplicate = absolute_path in storyboard_images[:-1]  # Check if it existed before we added it
            
            # Return the updated storyboard
            return jsonify({
                "success": True,
                "message": "Image already in storyboard" if is_duplicate else "Image added to storyboard",
                "isDuplicate": is_duplicate,
                "storyboard": {
                    "images": storyboard_image_data,
                    "count": len(storyboard_images)
                }
            })
        else:
            return jsonify({"error": "Failed to add image to storyboard"}), 500
            
    except Exception as e:
        error_msg = f"Error adding image to storyboard: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return jsonify({"error": error_msg}), 500

# API endpoint to get current storyboard
@app.route('/api/storyboard', methods=['GET'])
def get_storyboard():
    try:
        print(f"=== GET STORYBOARD DEBUG ===")
        print(f"storyboard_images: {storyboard_images}")
        print(f"storyboard_image_data: {[img.get('filename', 'unknown') for img in storyboard_image_data]}")
        print(f"Number of images: {len(storyboard_images)}")
        
        return jsonify({
            "success": True,
            "storyboard": {
                "images": storyboard_image_data,
                "count": len(storyboard_images)
            }
        })
    except Exception as e:
        error_msg = f"Error getting storyboard: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500

# API endpoint to clear the storyboard
@app.route('/api/storyboard/clear', methods=['POST'])
def clear_storyboard():
    try:
        global storyboard_images, storyboard_image_data
        storyboard_images.clear()
        storyboard_image_data.clear()
        
        return jsonify({
            "success": True,
            "message": "Storyboard cleared"
        })
    except Exception as e:
        error_msg = f"Error clearing storyboard: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500

# API endpoint to delete a specific image from the storyboard
@app.route('/api/storyboard/delete', methods=['POST'])
def delete_from_storyboard():
    try:
        global storyboard_images, storyboard_image_data
        data = request.json
        image_path = data.get('imagePath')
        image_index = data.get('imageIndex')  # New parameter for specific instance
        
        if not image_path:
            return jsonify({"error": "No image path provided"}), 400
        
        # Handle different path formats
        if image_path.startswith('/enhanced_drawings/') or image_path.startswith('/img/'):
            # Extract the filename and build the absolute path
            filename = os.path.basename(image_path)
            if image_path.startswith('/enhanced_drawings/'):
                absolute_path = os.path.join(enhanced_dir, filename)
            else:
                absolute_path = os.path.join(img_dir, filename)
        else:
            # Assume it's already an absolute path
            absolute_path = image_path
        
        # If index is provided, delete the specific instance
        if image_index is not None and 0 <= image_index < len(storyboard_images):
            # Remove the specific instance by index
            removed_path = storyboard_images.pop(image_index)
            print(f"Removed image at index {image_index}: {removed_path}")
            
            # Also remove the corresponding image data
            if image_index < len(storyboard_image_data):
                removed_data = storyboard_image_data.pop(image_index)
                print(f"Removed image data at index {image_index}: {removed_data.get('filename', 'unknown')}")
        else:
            # Fallback: Find and remove the first occurrence of the image
            if absolute_path in storyboard_images:
                storyboard_images.remove(absolute_path)
                print(f"Removed first occurrence of: {absolute_path}")
                
                # Also remove from image data array
                storyboard_image_data = [img for img in storyboard_image_data if img.get('path') != absolute_path]
            else:
                return jsonify({"error": "Image not found in storyboard"}), 404
        
        return jsonify({
            "success": True,
            "message": "Image removed from storyboard",
            "storyboard": {
                "images": storyboard_image_data,
                "count": len(storyboard_images)
            }
        })
            
    except Exception as e:
        error_msg = f"Error deleting image from storyboard: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return jsonify({"error": error_msg}), 500

# API endpoint to generate video from storyboard
@app.route('/api/generate-video', methods=['POST'])
def generate_video_api():
    global is_video_processing
    
    try:
        data = request.json or {}
        story_context = data.get('storyContext', '')
        include_music = data.get('includeMusic', False)
        print(f"=== VIDEO GENERATION REQUEST ===")
        print(f"Current storyboard_images: {storyboard_images}")
        print(f"Current storyboard_image_data: {[img.get('filename', 'unknown') for img in storyboard_image_data]}")
        print(f"Number of storyboard images: {len(storyboard_images)}")
        print(f"Include music: {include_music}")
        
        # Check if enough images are in storyboard
        if len(storyboard_images) < 2:
            return jsonify({
                "error": "Need at least 2 images in storyboard to generate a video"
            }), 400
            
        # Check if video generation is already in progress
        if is_video_processing:
            return jsonify({
                "error": "Video generation already in progress",
                "status": "busy"
            }), 429  # Too Many Requests
        
        # Generate a unique request ID
        request_id = f"video_req_{datetime.now().timestamp()}"
        
        # Start video generation in background, pass story_context and include_music
        is_video_processing = True
        threading.Thread(target=generate_video_background, args=(request_id, story_context, include_music)).start()
        
        # Return immediately with request ID for polling
        return jsonify({
            "success": True,
            "requestId": request_id,
            "message": "Video generation started"
        })
        
    except Exception as e:
        error_msg = f"Error generating video: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        return jsonify({"error": error_msg}), 500

# API endpoint to check video generation status
@app.route('/api/video-status/<request_id>', methods=['GET'])
def check_video_status(request_id):
    try:
        if request_id not in video_processing_status:
            return jsonify({"error": "Request ID not found"}), 404
            
        status = video_processing_status[request_id]
        return jsonify(status)
        
    except Exception as e:
        error_msg = f"Error checking video status: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500

# API endpoint to play a video
@app.route('/api/play-video/<video_filename>', methods=['POST'])
def play_video(video_filename):
    try:
        # Build full path to video file
        video_path = os.path.join(story_videos_dir, video_filename)
        
        if not os.path.exists(video_path):
            return jsonify({"error": f"Video file not found: {video_filename}"}), 404
            
        # Play video using system default player
        system = platform.system()
        if system == 'Darwin':  # macOS
            subprocess.call(('open', video_path))
        elif system == 'Windows':
            os.startfile(video_path)
        else:  # Linux
            subprocess.call(('xdg-open', video_path))
            
        return jsonify({
            "success": True,
            "message": f"Video {video_filename} opened in default player"
        })
        
    except Exception as e:
        error_msg = f"Error playing video: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500

# Serve static files from the various directories
@app.route('/img/<path:filename>')
def serve_image(filename):
    try:
        # Read the image and serve it correctly
        img_path = os.path.join(img_dir, filename)
        if os.path.exists(img_path):
            # Try to read as PIL Image first (for RGB images)
            try:
                pil_img = Image.open(img_path)
                # Convert PIL image to RGB if it's not already
                if pil_img.mode != 'RGB':
                    pil_img = pil_img.convert('RGB')
                
                # Convert to base64 and serve
                img_buffer = BytesIO()
                pil_img.save(img_buffer, format='PNG')
                return Response(img_buffer.getvalue(), mimetype='image/png')
                
            except Exception as pil_error:
                # Fallback to OpenCV for BGR images
                print(f"PIL failed, trying OpenCV: {pil_error}")
                img = cv2.imread(img_path)
                if img is not None:
                    # Convert BGR to RGB to fix color inversion issue
                    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    # Encode as PNG
                    _, buffer = cv2.imencode('.png', img_rgb)
                    return Response(buffer.tobytes(), mimetype='image/png')
    except Exception as e:
        print(f"Error serving image {filename}: {e}")
    
    # Fallback to direct file serving
    return send_from_directory(img_dir, filename)

@app.route('/enhanced_drawings/<path:filename>')
def serve_enhanced_image(filename):
    try:
        # Read the image and serve it correctly
        img_path = os.path.join(enhanced_dir, filename)
        if os.path.exists(img_path):
            # Try to read as PIL Image first (for RGB images)
            try:
                pil_img = Image.open(img_path)
                # Convert PIL image to RGB if it's not already
                if pil_img.mode != 'RGB':
                    pil_img = pil_img.convert('RGB')
                
                # Convert to base64 and serve
                img_buffer = BytesIO()
                pil_img.save(img_buffer, format='PNG')
                return Response(img_buffer.getvalue(), mimetype='image/png')
                
            except Exception as pil_error:
                # Fallback to OpenCV for BGR images
                print(f"PIL failed, trying OpenCV: {pil_error}")
                img = cv2.imread(img_path)
                if img is not None:
                    # Convert BGR to RGB to fix color inversion issue
                    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                    # Encode as PNG
                    _, buffer = cv2.imencode('.png', img_rgb)
                    return Response(buffer.tobytes(), mimetype='image/png')
    except Exception as e:
        print(f"Error serving enhanced image {filename}: {e}")
    
    # Fallback to direct file serving
    return send_from_directory(enhanced_dir, filename)

@app.route('/videos/<path:filename>')
def serve_video(filename):
    return send_from_directory(story_videos_dir, filename)

@app.route('/gen_music/<path:filename>')
def serve_music(filename):
    return send_from_directory(gen_music_dir, filename)

# Debug endpoint to check storyboard state
@app.route('/api/debug/storyboard', methods=['GET'])
def debug_storyboard():
    try:
        print(f"=== DEBUG STORYBOARD ENDPOINT ===")
        print(f"storyboard_images: {storyboard_images}")
        print(f"storyboard_image_data: {[img.get('filename', 'unknown') for img in storyboard_image_data]}")
        print(f"Number of images: {len(storyboard_images)}")
        
        # Check if files exist
        existing_files = []
        for img_path in storyboard_images:
            exists = os.path.exists(img_path)
            existing_files.append({
                "path": img_path,
                "exists": exists,
                "filename": os.path.basename(img_path)
            })
            print(f"File {img_path} exists: {exists}")
        
        return jsonify({
            "success": True,
            "storyboard_images": storyboard_images,
            "storyboard_image_data": [img.get('filename', 'unknown') for img in storyboard_image_data],
            "count": len(storyboard_images),
            "file_check": existing_files
        })
    except Exception as e:
        error_msg = f"Error in debug storyboard: {str(e)}"
        print(error_msg)
        return jsonify({"error": error_msg}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True) 
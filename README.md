# TRELLIS on Modal

This repository contains code to run Microsoft's TRELLIS 3D generation model on [Modal](https://modal.com).

## Setup

1. Install Modal CLI:
```bash
pip install modal
```

2. Authenticate with Modal:
```bash
modal token new
```

3. Deploy the application:
```bash
modal deploy trellis_modal.py
```

## Usage

After deployment, you can generate 3D models from images using the deployed endpoint.

### Using the API directly

```python
import requests
import base64
import json

# URL will be provided by Modal when you deploy the app
ENDPOINT_URL = "https://your-username--trellis-generate.modal.run"

# Prepare your image
with open("your_image.png", "rb") as f:
    # Use multipart/form-data format
    files = {"image": ("image.png", f, "image/jpeg")}
    
    # Parameters need to be sent as form data
    data = {
        "output_format": "glb",  # or "ply"
        "seed": "42",
        "ss_steps": "12",
        "ss_cfg_strength": "7.5",
        "slat_steps": "12",
        "slat_cfg_strength": "3.0",
    }
    
    # Make the request
    response = requests.post(ENDPOINT_URL, files=files, data=data)
    result = response.json()
    
    # Save the model
    model_data = base64.b64decode(result["model"])
    model_format = result["model_format"]
    with open(f"output_model.{model_format}", "wb") as f:
        f.write(model_data)
    
    # Save the videos if needed
    if "gaussian_video" in result:
        with open("gaussian_video.mp4", "wb") as f:
            f.write(base64.b64decode(result["gaussian_video"]))
    
    if "rf_video" in result:
        with open("rf_video.mp4", "wb") as f:
            f.write(base64.b64decode(result["rf_video"]))
    
    if "mesh_video" in result:
        with open("mesh_video.mp4", "wb") as f:
            f.write(base64.b64decode(result["mesh_video"]))
```

### Using the test client

We provide a test client script that simplifies the API usage:

```bash
python test_client.py --url https://your-username--trellis-generate.modal.run --image your_image.png --format glb
```

## Parameters

- `output_format`: Export format for the 3D model (`"glb"` or `"ply"`)
- `seed`: Random seed for reproducibility
- `ss_steps`: Number of steps for the sparse structure sampler (default: 12)
- `ss_cfg_strength`: Classifier-free guidance strength for the sparse structure sampler (default: 7.5)
- `slat_steps`: Number of steps for the SLat sampler (default: 12)
- `slat_cfg_strength`: Classifier-free guidance strength for the SLat sampler (default: 3.0)

## Notes

- The first request may take longer as the model needs to be loaded into memory
- The model requires an A100 GPU to run efficiently, which will be automatically provisioned by Modal
- The generated 3D model is returned in the requested format (GLB or PLY) along with preview videos
- All parameters are sent as form data (strings) rather than query parameters

# CoCo - Collaborative Canvas

A creative drawing application with hand gesture recognition and AI enhancement capabilities.

## Features

- Interactive canvas for drawing and sketching
- Hand gesture recognition for intuitive control
- Various drawing tools: pencil, rectangle, ellipse, text, etc.
- Clear all functionality with button or hand gesture
- Save drawings directly to the `img` folder on the server
- AI drawing enhancement powered by Google's Gemini model
- Interactive enhanced images that can be moved, resized, and positioned on the canvas

## Setup

1. Install Node.js dependencies:
```bash
npm install
```

2. Install Python dependencies:
```bash
pip install -r requirements.txt
```

3. Set up your environment variables:
```bash
# Copy the example env file and add your Google Gemini API key
cp .env.example .env
# Edit .env and add your actual API key
```

4. Start the Flask server:
```bash
python app.py
# This will start the Flask server on port 5001
```

5. In a separate terminal, start the development server for the React application:
```bash
npm run dev
```

## Using Hand Gestures

The application supports several hand gestures for intuitive control:
- Index finger extended: Draw on the canvas
- Closed fist: Click buttons and UI elements
- Two fingers (index and middle) extended: Clear the canvas

## Saving and Enhancing Images

### Save to Folder
When you click the "Save to Folder" button, your drawing will be:
1. Cropped to only include the area with content
2. Saved as a PNG file to the `img` folder on the server
3. Named with a timestamp for easy identification

### Enhance with Gemini
The "Enhance with Gemini" feature lets you transform your sketches using AI:
1. First save your drawing or click the Enhance button directly
2. Enter a prompt describing how you want your drawing enhanced
3. Google's Gemini model will generate an enhanced version
4. The enhanced image appears on your canvas as an interactive object
5. All enhanced images are saved to the `enhanced_drawings` folder

### Interactive Enhanced Images
After enhancing your drawing:
1. The enhanced image appears on your canvas as a movable, resizable element
2. Drag the image to reposition it anywhere on your canvas
3. Use the resize handles (small circles) to resize the image from any edge or corner
4. Click the "X" button to remove the enhanced image from the canvas
5. You can have multiple enhanced images on your canvas at once

## Technical Architecture

### Frontend (React)
- React application with TypeScript
- Canvas API for drawing
- MediaPipe for hand gesture recognition (when used in standalone mode)

### Backend (Flask)
- Flask server to handle image saving and enhancement (running on port 5001)
- Integration with Google Gemini API for AI image generation
- Image processing with OpenCV

## How Gemini Enhancement Works

1. The drawing is sent to the Flask server
2. The server processes the image and sends it to Google's Gemini model
3. A custom prompt guides Gemini to enhance the drawing
4. The enhanced image is saved and returned to the frontend
5. The frontend displays the enhanced image as an interactive element on the canvas

## Requirements

- Node.js 16+ for the frontend
- Python 3.8+ for the Flask backend
- Google Gemini API key for AI enhancement
- Webcam access (for hand tracking in standalone mode)

## Development

This project is built using Vite with React and TypeScript for the frontend and Flask for the backend.

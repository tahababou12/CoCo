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

# CoCo - Collaborative Drawing Application

CoCo is a real-time collaborative drawing application that allows multiple users to draw simultaneously on a shared canvas. It features a modern UI, various drawing tools, and AI-powered assistance using Claude.

## Features

- Real-time collaboration with multiple users
- Drawing tools: pen, shapes (rectangle, circle), text, and eraser
- User cursor visualization for all collaborators
- Draggable collaboration panel that shows connected users
- AI drawing assistance powered by Claude (feedback and improvement suggestions)
- Export drawings as PNG
- Pan and zoom canvas support

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS
- **Backend**: FastAPI (Python), WebSockets for real-time communication
- **AI**: Claude API integration for drawing assistance

## Setup and Installation

### Prerequisites

- Node.js and npm
- Python 3.8+
- Anthropic API key for Claude integration

### Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Create a virtual environment and activate it:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Create a `.env` file from the example:
   ```
   cp .env.example .env
   ```

5. Edit the `.env` file and add your Anthropic API key:
   ```
   ANTHROPIC_API_KEY=your_api_key_here
   ```

6. Start the backend server:
   ```
   uvicorn app.main:app --reload
   ```

### Frontend Setup

1. Navigate to the frontend-main directory:
   ```
   cd frontend-main
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file:
   ```
   echo "VITE_API_URL=http://localhost:8000" > .env
   ```

4. Start the development server:
   ```
   npm run dev
   ```

5. Access the application at [http://localhost:5173](http://localhost:5173)

## Using the Claude AI Assistant

CoCo integrates with Claude AI to provide drawing assistance and feedback:

1. Click the sparkle icon in the top toolbar to open the Claude AI panel.

2. Two options are available:
   - **Quick Feedback**: Receive a quick analysis of your current drawing.
   - **Detailed Improvement**: Get detailed suggestions to improve your drawing with optional specific instructions.

3. Type specific instructions in the text area if you have particular requirements (e.g., "Make my drawing more realistic" or "Add more details to the background").

4. Click one of the buttons and wait for Claude to process your drawing.

5. Review the AI suggestions and apply them to your drawing as needed.

6. Close the panel by clicking the X button when you're done.

## WebSocket Server

The application also includes a WebSocket server for real-time collaboration:

```
node backend/websocket-server.js
```

## License

[MIT License](LICENSE)

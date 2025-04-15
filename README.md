# CoCo - Collaborative Drawing Application

CoCo is a collaborative drawing application that allows multiple users to draw together in real-time. The app includes AI-powered image enhancement and story generation features.

## Features

- Real-time collaborative drawing
- AI-enhanced image generation with Gemini
- Storyboard creation
- Video generation from drawings
- Multi-user support with different drawing positions

## Project Structure

- **frontend-main/**: Frontend React application
- **backend/**: Backend services
  - WebSocket server for real-time collaboration
  - Flask API for image processing and AI features

## Quick Start

The easiest way to run the application is to use the provided start script:

```bash
./start.sh
```

This will:
1. Set up environment files
2. Install dependencies for both frontend and backend
3. Start all services
4. Provide URLs to access the application

To stop all services:

```bash
./stop.sh
```

## Manual Setup

### Backend

The backend consists of a WebSocket server for real-time collaboration and a Flask API for image processing.

```bash
cd backend
./setup-all.sh         # Install dependencies and set up environment
npm run start-all      # Start both servers
# or for development mode with auto-restart:
npm run dev-all
```

### Frontend

```bash
cd frontend-main
npm install
npm run dev
```

## Environment Setup

Create `.env` files in both the backend and frontend-main directories:

### backend/.env

```
GOOGLE_API_KEY=your_gemini_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### frontend-main/.env

```
VITE_WS_URL=ws://localhost:8080
VITE_API_URL=http://localhost:5001
```

## Access the Application

- Frontend UI: http://localhost:5173
- Backend API: http://localhost:5001
- WebSocket: ws://localhost:8080

## Development

For development workflow, you can run the backend and frontend servers separately:

### Backend Only

```bash
cd backend
npm run start-all      # Start both WebSocket and Flask API servers
# or separately:
npm run dev            # WebSocket server only
npm run api            # Flask API only
```

### Frontend Only

```bash
cd frontend-main
npm run dev
```

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

## License

[MIT License](LICENSE)

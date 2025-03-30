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

# CoCo - Collaborative Whiteboard

CoCo is a real-time collaborative drawing application that allows multiple users to draw simultaneously on a shared canvas. It features real-time cursor tracking, various drawing tools, and collaborative features.

## Features

- Real-time collaboration with multiple users
- Live cursor tracking for all participants
- Drawing tools: pen, shapes, and more
- WebSocket-based communication
- Support for webcam sharing
- History tracking and undo/redo
- Export drawings as PNG

## Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Vite
- **Backend**: Node.js, Express, WebSockets
- **Collaboration**: Custom WebSocket implementation

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/CoCo.git
   cd CoCo
   ```

2. **Install backend dependencies**:
   ```bash
   cd backend
   npm install
   ```

3. **Install frontend dependencies**:
   ```bash
   cd ../frontend-main
   npm install
   ```

### Running Locally

1. **Start the backend server**:
   ```bash
   cd backend
   node websocket-server.js
   ```
   Or use our convenient script:
   ```bash
   ./start-server.sh
   ```

2. **Start the frontend development server**:
   ```bash
   cd frontend-main
   npm run dev
   ```

3. **Access the application** at:
   ```
   http://localhost:5173
   ```

## Network Collaboration Setup

This guide will help you set up CoCo for collaboration across different devices on the same network.

### For the Host (Server)

1. **Start the Backend Server**:
   ```bash
   cd backend
   ./start-server.sh
   ```
   This script will show your IP address and start the server.

2. **Create or Update Frontend Environment Variables**:
   Create a file at `frontend-main/.env` with:
   ```
   VITE_WS_URL=ws://YOUR_IP_ADDRESS:8080
   ```
   Replace `YOUR_IP_ADDRESS` with your actual IP address (e.g., 10.28.30.186).

3. **Start the Frontend**:
   ```bash
   cd frontend-main
   npm run dev
   ```

4. **Share Your IP Address**:
   Share your IP address with collaborators. They will connect to:
   ```
   http://YOUR_IP_ADDRESS:5173
   ```

### For Collaborators

1. **Connect to the Host**:
   Open your browser and go to:
   ```
   http://HOST_IP_ADDRESS:5173
   ```
   Replace `HOST_IP_ADDRESS` with the IP address shared by the host.

### Troubleshooting

If connections fail:

1. **Check Firewall Settings**:
   - On Mac: System Preferences > Security & Privacy > Firewall
   - Make sure Node.js is allowed incoming connections

2. **Network Restrictions**:
   Some networks (especially institutional ones) might block direct connections between computers.
   Solutions:
   - Try using a personal hotspot
   - Connect to a less restricted network

3. **Verify Server is Running**:
   The host can check with:
   ```
   curl http://localhost:8080/api/ping
   ```

4. **Check the Frontend Environment**:
   Make sure the `.env` file has the correct IP address

## Project Structure

- `backend/` - Node.js server with WebSocket implementation
  - `websocket-server.js` - Main server file
  - `start-server.sh` - Convenience script for starting the server
  - `images/` - Storage for exported images

- `frontend-main/` - React frontend application
  - `src/` - Source code
    - `components/` - React components
    - `context/` - React context providers for state management
    - `utils/` - Utility functions

## Development

### Adding New Features

1. Frontend changes should be made in the `frontend-main/src` directory
2. Backend changes should be made in the `backend` directory
3. Restart both servers after making changes

### Building for Production

```bash
cd frontend-main
npm run build
```

The built files will be in the `frontend-main/dist` directory.

## License

[MIT License](LICENSE)

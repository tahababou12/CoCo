# CoCo Backend Services

This directory contains the backend services for CoCo, including the WebSocket server for real-time collaboration and the Flask API server for image processing and other features.

## Features

- WebSocket server for real-time collaboration:
  - Supports up to 4 users collaborating in real-time
  - Users can see each other's cursor positions
  - Synchronizes drawing shapes across all connected clients
  - Assigns each user a specific position on the screen
  - Handles connection and disconnection events gracefully

- Flask API server for:
  - Image processing and enhancement with Gemini AI
  - Storyboard management
  - Video generation from drawings

## Requirements

- Node.js 14.x or higher
- Python 3.8 or higher
- npm or yarn package manager

## Installation

1. Clone the repository (if you haven't already)
2. Navigate to the backend directory:

```bash
cd backend
```

3. Run the setup script to install all dependencies:

```bash
./setup-all.sh
```

This script will:
- Install Node.js dependencies
- Create a Python virtual environment
- Install Python dependencies
- Copy required files if needed
- Create necessary directories

## Running the Servers

### Combined Server (Recommended)

To run both the WebSocket server and Flask API together:

```bash
npm run start-all
```

For development mode with automatic reloading:

```bash
npm run dev-all
```

### Running Servers Separately

If you need to run the servers separately:

#### WebSocket Server Only

```bash
npm run dev  # Development mode
npm start    # Production mode
```

#### Flask API Server Only

```bash
npm run api
```

## Client Configuration

The frontend is configured to connect to the WebSocket server at `ws://localhost:8080` by default and the Flask API at `http://localhost:5001`.

If you need to change this, you can set the environment variables in a `.env` file in the frontend directory:

```
VITE_WS_URL=ws://your-server-address:8080
VITE_API_URL=http://your-server-address:5001
```

## WebSocket Protocol

### Message Types

The server handles the following message types:

- `JOIN_ROOM`: Sent when a user joins the drawing session
- `USER_JOINED`: Broadcast when a new user connects
- `USER_LEFT`: Broadcast when a user disconnects
- `CURSOR_MOVE`: Updates cursor position for a user
- `SYNC_SHAPES`: Syncs all shapes between clients
- `SHAPE_ADDED`: Sent when a new shape is added
- `SHAPE_UPDATED`: Sent when a shape is modified
- `SHAPES_DELETED`: Sent when shapes are removed
- `REQUEST_SYNC`: Requests a full sync of all shapes
- `ERROR`: Sent when an error occurs

## Deployment

For production deployment, consider using process managers like PM2:

```bash
npm install -g pm2
pm2 start websocket-server.js
```

Or containerize with Docker using the provided Dockerfile. 
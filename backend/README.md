# CoCo Collaboration WebSocket Server

This WebSocket server enables real-time collaboration features for CoCo, allowing multiple users to draw on the same canvas simultaneously.

## Features

- Supports up to 4 users collaborating in real-time
- Users can see each other's cursor positions
- Synchronizes drawing shapes across all connected clients
- Assigns each user a specific position on the screen
- Handles connection and disconnection events gracefully

## Requirements

- Node.js 14.x or higher
- npm or yarn package manager

## Installation

1. Clone the repository (if you haven't already)
2. Navigate to the backend directory:

```bash
cd backend
```

3. Install the dependencies:

```bash
npm install
```

## Running the Server

### Development Mode

To run the server in development mode with automatic reloading:

```bash
npm run dev
```

### Production Mode

To run the server in production mode:

```bash
npm start
```

By default, the server runs on port 8080. You can change this by setting the `PORT` environment variable:

```bash
PORT=9000 npm start
```

## Client Configuration

The frontend is configured to connect to the WebSocket server at `ws://localhost:8080` by default. 

If you need to change this, you can set the `VITE_WS_URL` environment variable in a `.env` file in the frontend directory:

```
VITE_WS_URL=ws://your-server-address:port
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
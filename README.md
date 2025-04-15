# CoCo - Collaborative Drawing Application

CoCo is a collaborative drawing application that enables multiple users to draw together in real-time. The application features AI-powered image enhancement using Google's Gemini model and story generation capabilities.

![CoCo Banner](frontend-main/public/CoCo_banner.png)

## Features

- **Real-time Collaboration**: Draw with multiple users simultaneously
- **Live Cursor Tracking**: See other users' cursor positions in real-time
- **AI-Enhanced Images**: Transform simple sketches into detailed images with Gemini AI
- **Storyboard Creation**: Build visual narratives by combining enhanced drawings
- **Video Generation**: Generate engaging videos from your storyboards with AI narration
- **Multi-User Support**: Each user is assigned a specific drawing position

## Quick Start

The easiest way to run the application is with our provided scripts:

```bash
# Clone the repository
git clone https://github.com/tahababou12/CoCo.git
cd CoCo

# Start all services
./start.sh

# To stop all services when finished
./stop.sh
```

This will:
1. Set up required environment files
2. Install dependencies for frontend and backend
3. Start all services
4. Provide URLs to access the application

## Project Architecture

CoCo uses a modular architecture with separate frontend and backend components:

- **Frontend** (React + TypeScript)
  - Real-time canvas with collaboration features
  - UI for storyboard management
  - Image enhancement interface

- **Backend** (Node.js + Flask)
  - WebSocket server for real-time collaboration
  - Flask API for AI-powered features (image enhancement, video generation)
  - Combined server that runs both services simultaneously

## Detailed Setup

### Prerequisites

- Node.js 14+ and npm
- Python 3.8+
- Git

### Backend Setup

The backend consists of a WebSocket server for real-time collaboration and a Flask API for AI-powered features.

```bash
cd backend

# Run the setup script to install all dependencies 
./setup-all.sh

# Start both servers
npm run start-all

# For development mode with auto-restart:
npm run dev-all

# To run servers individually:
npm run dev            # WebSocket server only
npm run api            # Flask API only
```

### Frontend Setup

```bash
cd frontend-main

# Install dependencies
npm install

# Start development server
npm run dev
```

## Environment Configuration

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

## Accessing the Application

Once all services are running, access the application at:

- **Frontend UI**: http://localhost:5173
- **Backend API**: http://localhost:5001
- **WebSocket**: ws://localhost:8080

## Network Collaboration

To collaborate with users on the same network:

1. Find your IP address (e.g., use `ifconfig` or `ipconfig`)
2. Update frontend-main/.env:
   ```
   VITE_WS_URL=ws://YOUR_IP_ADDRESS:8080
   VITE_API_URL=http://YOUR_IP_ADDRESS:5001
   ```
3. Share your IP address with collaborators, who can connect via:
   ```
   http://YOUR_IP_ADDRESS:5173
   ```

## AI Features

### Image Enhancement

1. Draw a sketch on the canvas
2. Click "Enhance with Gemini"
3. Enter a prompt to guide the enhancement
4. The enhanced image appears on your canvas as an interactive object

### Storyboard Creation

1. Create multiple enhanced drawings
2. Add them to the storyboard using the "Add to Storyboard" button
3. Arrange your scenes in the storyboard panel

### Video Generation

1. Add at least 2 images to your storyboard
2. Click "Generate Video"
3. The AI will create a narrated video connecting your scenes

## Development

### Project Structure

```
CoCo/
├── frontend-main/     # React frontend
│   ├── src/           # Source code
│   ├── public/        # Static assets
│   └── package.json   # Dependencies
│
├── backend/           # Backend services
│   ├── websocket-server.js  # Real-time collaboration server
│   ├── app.py         # Flask API for AI features
│   ├── server.js      # Combined server manager
│   └── package.json   # Node.js dependencies
│
├── start.sh           # Script to start all services
└── stop.sh            # Script to stop all services
```

### Adding New Features

1. Frontend changes should be made in the `frontend-main/src` directory
2. Backend changes:
   - WebSocket functionality: `backend/websocket-server.js`
   - AI processing: `backend/app.py`
   - Server management: `backend/server.js`

## Troubleshooting

### Connection Issues

- Ensure all services are running (check with `ps aux | grep node` and `ps aux | grep python`)
- Verify correct URLs in frontend-main/.env
- Check that ports 5001, 5173, and 8080 are not blocked by firewalls

### AI Enhancement Issues

- Verify your API keys are correctly set in backend/.env
- Check the Flask server logs for API-related errors

## License

[MIT License](LICENSE)

## Acknowledgements

- Google Gemini API for image generation
- ElevenLabs for text-to-speech generation
- MediaPipe for hand gesture recognition

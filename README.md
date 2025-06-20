# CoCo - Collaborative Drawing Application

CoCo is a collaborative drawing application that enables multiple users to draw together in real-time. The application features AI-powered image enhancement using Google's Gemini model and story generation capabilities.

![CoCo Banner](frontend-main/public/CoCo_banner.png)

## 🎨 Features

- **Real-time Collaborative Drawing**: Draw together with others in real-time
- **Hand Gesture Recognition**: Control the canvas with hand gestures
- **AI-Powered Enhancement**: Enhance your sketches with Gemini AI
- **Voice-Controlled AI Assistant**: Talk to an AI assistant about your drawings
- **Storyboard Generation**: Create storyboards from your drawings
- **Video Generation**: Generate videos from your storyboards
- **Multi-modal Interaction**: Combine drawing, voice, and text for AI interaction

## 🤖 Multimodal AI Assistant

The new **Multimodal AI Assistant** allows you to have real-time conversations with Gemini about your drawings:

### **Voice Commands**
- **"Make this drawing more detailed"** - Ask for enhancements
- **"Change the colors to blue and green"** - Modify existing images
- **"What do you think about this drawing?"** - Get feedback
- **"Add a background to this scene"** - Request modifications

### **Text Chat**
- Type messages to ask questions about your drawings
- Get suggestions for improvements
- Request specific modifications

### **Real-time Drawing Analysis**
- The AI can see your drawing as you create it
- Get instant feedback and suggestions
- Ask for help with drawing techniques

### **How to Use**
1. Click the **💬 AI Assistant** button in the top-right corner
2. **Draw something** on the canvas
3. **Talk to the AI** using voice or text
4. **Get real-time assistance** and modifications

## Quick Start

### **Option 1: Complete Setup (Recommended)**
```bash
# Start all servers including multimodal AI assistant
chmod +x start-multimodal.sh
./start-multimodal.sh

# In a new terminal, start the frontend
npm install
npm run dev
```

### **Option 2: Manual Setup**
```bash
# Backend setup
cd backend
chmod +x setup-all.sh
./setup-all.sh

# Start multimodal server (in new terminal)
cd multimodal
source ../backend/venv/bin/activate
python main.py

# Start backend server (in new terminal)
cd backend
source venv/bin/activate
python app.py

# Frontend setup (in new terminal)
npm install
npm run dev
```

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

## Acknowledgements

- Google Gemini API for image generation
- ElevenLabs for text-to-speech generation
- MediaPipe for hand gesture recognition

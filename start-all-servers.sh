#!/bin/bash

echo "🚀 Starting CoCo Drawing App with Voice Enhancement..."

# Check if we're in the right directory
if [ ! -f "backend/app.py" ]; then
    echo "❌ Error: Please run this script from the CoCo project root directory"
    exit 1
fi

# Clean up any existing processes on our ports
echo "🧹 Cleaning up existing processes on ports 5000, 5001, 5173, 5174, 9083..."
pkill -f "python.*app.py" 2>/dev/null
pkill -f "python.*multimodal_server.py" 2>/dev/null
pkill -f "npm.*dev" 2>/dev/null
sleep 2

# Force kill any remaining processes on our ports
echo "🛑 Force killing any remaining processes..."
pkill -9 -f "python.*app.py" 2>/dev/null
pkill -9 -f "python.*multimodal_server.py" 2>/dev/null
pkill -9 -f "npm.*dev" 2>/dev/null

# Kill processes by port
echo "🔌 Killing processes by port..."
lsof -ti:5000 | xargs kill -9 2>/dev/null
lsof -ti:5001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
lsof -ti:5174 | xargs kill -9 2>/dev/null
lsof -ti:9083 | xargs kill -9 2>/dev/null

# Clean up signal files
rm -f /tmp/browser_closed
rm -f /tmp/coco_shutdown

echo "✅ Port cleanup complete"

# Load environment variables
echo "📋 Loading environment variables..."
if [ -f "backend/.env" ]; then
    echo "✅ Found .env file in backend directory"
    export $(cat backend/.env | grep -v '^#' | xargs)
else
    echo "⚠️  Warning: No .env file found in backend directory"
    echo "   Make sure GOOGLE_API_KEY is set in your environment"
fi

# Check for required API key
if [ -z "$GOOGLE_API_KEY" ]; then
    echo "❌ Error: GOOGLE_API_KEY environment variable is required"
    echo "   Please set it in backend/.env file or export it in your shell"
    exit 1
fi

echo "✅ Environment setup complete"

# Setup virtual environment
echo "🐍 Setting up Python virtual environment..."
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install/upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install backend dependencies
echo "📦 Installing backend dependencies..."
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    echo "⚠️  No requirements.txt found, installing common dependencies..."
    pip install flask flask-cors python-dotenv opencv-python mediapipe numpy pillow google-genai google-generativeai
fi

# Install additional dependencies for voice enhancement
echo "📦 Installing voice enhancement dependencies..."
pip install aiohttp pydub pyaudio websockets

cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm install
else
    echo "✅ Frontend dependencies already installed"
fi

echo "✅ All dependencies installed"

# Clean up any existing browser closed signals
rm -f /tmp/browser_closed

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down servers..."
    pkill -f "python.*app.py" 2>/dev/null
    pkill -f "python.*multimodal_server.py" 2>/dev/null
    pkill -f "npm.*dev" 2>/dev/null
    rm -f /tmp/browser_closed
    echo "✅ Servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start Flask backend server
echo "🐍 Starting Flask backend server..."
cd backend
source venv/bin/activate
python app.py &
FLASK_PID=$!
cd ..

# Wait a moment for Flask to start
sleep 3

# Check if Flask started successfully
if ! kill -0 $FLASK_PID 2>/dev/null; then
    echo "❌ Error: Flask server failed to start"
    exit 1
fi
echo "✅ Flask backend running on http://localhost:5001"

# Start multimodal server
echo "🎤 Starting multimodal AI server..."
cd backend
source venv/bin/activate
python multimodal_server.py &
MULTIMODAL_PID=$!
cd ..

# Wait a moment for multimodal server to start
sleep 3

# Check if multimodal server started successfully
if ! kill -0 $MULTIMODAL_PID 2>/dev/null; then
    echo "❌ Error: Multimodal server failed to start"
    kill $FLASK_PID 2>/dev/null
    exit 1
fi
echo "✅ Multimodal server running on ws://localhost:9083"

# Start frontend development server
echo "🌐 Starting frontend development server..."
npm run dev &
FRONTEND_PID=$!

# Wait a moment for frontend to start
sleep 5

# Check if frontend started successfully
if ! kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "❌ Error: Frontend server failed to start"
    kill $FLASK_PID $MULTIMODAL_PID 2>/dev/null
    exit 1
fi
echo "✅ Frontend running on http://localhost:5174"

echo ""
echo "🎉 All servers are running!"
echo ""
echo "📱 Frontend: http://localhost:5174"
echo "🔧 Backend API: http://localhost:5001"
echo "🎤 Multimodal AI: ws://localhost:9083"
echo ""
echo "🎨 How to use voice enhancement:"
echo "   1. Open the app in your browser"
echo "   2. Draw something on the canvas"
echo "   3. Click the AI Assistant button (top right)"
echo "   4. Click the microphone button to start voice input"
echo "   5. Say: 'Enhance this drawing with Gemini'"
echo "   6. The assistant will speak back and start enhancement!"
echo ""
echo "🛑 Press Ctrl+C to stop all servers"
echo "🔄 Servers will auto-shutdown when browser closes"

# Simple monitoring - just wait for browser closed signal
echo "👁️  Monitoring for browser close signal..."
while true; do
    # Check if browser closed signal exists
    if [ -f "/tmp/browser_closed" ]; then
        echo "🚨 Browser closed signal detected - shutting down servers"
        cleanup
        break
    fi
    
    # Check if any of our main processes have died
    if ! kill -0 $FLASK_PID 2>/dev/null; then
        echo "❌ Flask server died unexpectedly"
        cleanup
        break
    fi
    
    if ! kill -0 $MULTIMODAL_PID 2>/dev/null; then
        echo "❌ Multimodal server died unexpectedly"
        cleanup
        break
    fi
    
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "❌ Frontend server died unexpectedly"
        cleanup
        break
    fi
    
    sleep 2  # Check every 2 seconds
done 
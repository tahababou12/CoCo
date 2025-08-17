#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Starting all CoCo servers...${NC}"

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠️  Port $1 is already in use${NC}"
        return 1
    else
        return 0
    fi
}

# Function to kill processes on specific ports
kill_port() {
    echo -e "${YELLOW}🛑 Killing processes on port $1...${NC}"
    lsof -ti:$1 | xargs kill -9 2>/dev/null || echo -e "${YELLOW}No processes found on port $1${NC}"
}

# Kill existing processes on our ports
echo -e "${BLUE}🧹 Cleaning up existing processes...${NC}"
kill_port 3000  # Frontend dev server (old port)
kill_port 5174  # Frontend dev server (actual port)
kill_port 5001  # Flask API server
kill_port 8008  # WebSocket server
kill_port 9083  # Friendly AI server
kill_port 9084  # Sarcastic AI server

# Wait a moment for processes to fully terminate
sleep 2

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Check if backend directory exists
if [ ! -d "backend" ]; then
    echo -e "${RED}❌ Error: backend directory not found.${NC}"
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Start servers
echo -e "${BLUE}📡 Starting servers...${NC}"

# Start AI server with personality switching
echo -e "${GREEN}🎯 Starting AI Server with Personality Switching on port 9083...${NC}"
cd backend
source venv/bin/activate
python multimodal_server_gemini_live_refactored.py > "../logs/AI Server.log" 2>&1 &
AI_PID=$!
cd ..

# Wait a moment and check if it started successfully
sleep 3
if kill -0 $AI_PID 2>/dev/null; then
    echo -e "${GREEN}✅ AI Server with Personality Switching started successfully (PID: $AI_PID)${NC}"
    echo $AI_PID > "logs/AI Server.pid"
else
    echo -e "${RED}❌ Failed to start AI Server${NC}"
fi

# Start frontend dev server
echo -e "${CYAN}🎯 Starting Frontend Dev Server on port 5174...${NC}"
npm run dev > "logs/Frontend Dev Server.log" 2>&1 &
FRONTEND_PID=$!

# Wait a moment and check if it started successfully
sleep 3
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo -e "${CYAN}✅ Frontend Dev Server started successfully (PID: $FRONTEND_PID)${NC}"
    echo $FRONTEND_PID > "logs/Frontend Dev Server.pid"
else
    echo -e "${RED}❌ Failed to start Frontend Dev Server${NC}"
fi

# Start Flask API server
echo -e "${BLUE}🎯 Starting Flask API Server on port 5001...${NC}"
cd backend
source venv/bin/activate
python app.py > "../logs/Flask API Server.log" 2>&1 &
FLASK_PID=$!
cd ..

# Wait a moment and check if it started successfully
sleep 3
if kill -0 $FLASK_PID 2>/dev/null; then
    echo -e "${BLUE}✅ Flask API Server started successfully (PID: $FLASK_PID)${NC}"
    echo $FLASK_PID > "logs/Flask API Server.pid"
else
    echo -e "${RED}❌ Failed to start Flask API Server${NC}"
fi

# Start WebSocket server
echo -e "${YELLOW}🎯 Starting WebSocket Server on port 8008...${NC}"
cd backend
node websocket-server.js > "../logs/WebSocket Server.log" 2>&1 &
WEBSOCKET_PID=$!
cd ..

# Wait a moment and check if it started successfully
sleep 3
if kill -0 $WEBSOCKET_PID 2>/dev/null; then
    echo -e "${YELLOW}✅ WebSocket Server started successfully (PID: $WEBSOCKET_PID)${NC}"
    echo $WEBSOCKET_PID > "logs/WebSocket Server.pid"
else
    echo -e "${RED}❌ Failed to start WebSocket Server${NC}"
fi

# Wait for all servers to start
echo -e "${BLUE}⏳ Waiting for servers to fully start...${NC}"
sleep 5

# Check server status
echo -e "${BLUE}📊 Server Status:${NC}"
echo "----------------------------------------"

# Check AI server with personality switching
if check_port 9083; then
    echo -e "${GREEN}✅ AI Server WebSocket (port 9083) - RUNNING${NC}"
else
    echo -e "${RED}❌ AI Server WebSocket (port 9083) - NOT RUNNING${NC}"
fi

# Check AI server HTTP endpoint
if check_port 9085; then
    echo -e "${GREEN}✅ AI Server HTTP (port 9085) - RUNNING${NC}"
else
    echo -e "${RED}❌ AI Server HTTP (port 9085) - NOT RUNNING${NC}"
fi

# Check frontend server
if check_port 5174; then
    echo -e "${CYAN}✅ Frontend Dev Server (port 5174) - RUNNING${NC}"
else
    echo -e "${RED}❌ Frontend Dev Server (port 5174) - NOT RUNNING${NC}"
fi

# Check Flask API server
if check_port 5001; then
    echo -e "${BLUE}✅ Flask API Server (port 5001) - RUNNING${NC}"
else
    echo -e "${RED}❌ Flask API Server (port 5001) - NOT RUNNING${NC}"
fi

# Check WebSocket server
if check_port 8008; then
    echo -e "${YELLOW}✅ WebSocket Server (port 8008) - RUNNING${NC}"
else
    echo -e "${RED}❌ WebSocket Server (port 8008) - NOT RUNNING${NC}"
fi

echo "----------------------------------------"

echo -e "${GREEN}🎉 All servers started!${NC}"
echo -e "${YELLOW}📝 Logs are saved in the 'logs' directory${NC}"
echo -e "${YELLOW}🛑 To stop all servers, run: ./stop-all-servers.sh${NC}"
echo ""
echo -e "${BLUE}🌐 Access your application at:${NC}"
echo -e "${CYAN}   Frontend: http://localhost:5174${NC}"
echo -e "${BLUE}   Flask API: http://localhost:5001${NC}"
echo -e "${YELLOW}   WebSocket: ws://localhost:8008${NC}"
echo -e "${GREEN}   AI Server WebSocket: ws://localhost:9083${NC}"
echo -e "${GREEN}   AI Server HTTP: http://localhost:9085${NC}"
echo ""
echo -e "${YELLOW}💡 You can now toggle between Friendly and Sarcastic AI in the header!${NC}" 
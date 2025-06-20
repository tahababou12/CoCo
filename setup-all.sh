#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to cleanup processes on exit
cleanup() {
    echo -e "\n${YELLOW}Cleaning up processes...${NC}"
    pkill -f "python app.py" || true
    pkill -f "python multimodal_server.py" || true
    pkill -f "vite" || true
    exit 0
}

# Set up trap to cleanup on script exit
trap cleanup SIGINT SIGTERM EXIT

echo -e "${BLUE}Starting CoCo backend and multimodal servers...${NC}"

# Kill any existing processes on the ports
echo -e "${YELLOW}Killing existing processes on ports 5001 and 9083...${NC}"
lsof -ti:5001 | xargs kill -9 2>/dev/null || true
lsof -ti:9083 | xargs kill -9 2>/dev/null || true

# Wait a moment for ports to be freed
sleep 1

# Install dependencies in backend virtual environment
echo -e "${BLUE}Installing Python dependencies...${NC}"
cd backend

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python -m venv venv
fi

# Activate virtual environment and install requirements
echo -e "${YELLOW}Installing requirements.txt...${NC}"
source venv/bin/activate
pip install -r requirements.txt

# Start Flask backend
echo -e "${BLUE}Starting Flask backend on port 5001...${NC}"
python app.py &
BACKEND_PID=$!

# Start multimodal server
echo -e "${BLUE}Starting multimodal server on port 9083...${NC}"
python multimodal_server.py &
MULTIMODAL_PID=$!

cd ..

echo -e "${GREEN}✅ Both servers started!${NC}"
echo -e "${BLUE}   - Flask backend: http://localhost:5001 (PID: $BACKEND_PID)${NC}"
echo -e "${BLUE}   - Multimodal server: ws://localhost:9083 (PID: $MULTIMODAL_PID)${NC}"
echo -e "\n${YELLOW}To start the frontend, run: npm run dev${NC}"
echo -e "\n${BLUE}Press Ctrl+C to stop all servers${NC}"

# Wait for user to stop
wait 
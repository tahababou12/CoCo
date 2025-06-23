#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "   _____      _____      "
echo "  / ____|    / ____|     "
echo " | |        | |          "
echo " | |        | |          "
echo " | |____    | |____      "
echo "  \_____|    \_____|     "
echo "                         "
echo -e "CoCo Multimodal Setup${NC}"
echo ""

# Function to cleanup background processes
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    pkill -f "python.*multimodal/main.py"
    pkill -f "python.*backend/app.py"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Check if multimodal server is running
if pgrep -f "multimodal/main.py" > /dev/null; then
    echo -e "${YELLOW}Multimodal server already running${NC}"
else
    echo -e "${YELLOW}Starting multimodal server...${NC}"
    cd multimodal
    source ../backend/venv/bin/activate
    python main.py &
    MULTIMODAL_PID=$!
    cd ..
    echo -e "${GREEN}✓ Multimodal server started (PID: $MULTIMODAL_PID)${NC}"
fi

# Check if backend server is running
if pgrep -f "backend/app.py" > /dev/null; then
    echo -e "${YELLOW}Backend server already running${NC}"
else
    echo -e "${YELLOW}Starting backend server...${NC}"
    cd backend
    source venv/bin/activate
    python app.py &
    BACKEND_PID=$!
    cd ..
    echo -e "${GREEN}✓ Backend server started (PID: $BACKEND_PID)${NC}"
fi

echo ""
echo -e "${GREEN}✓ All servers started!${NC}"
echo -e "${BLUE}Multimodal server: http://localhost:1212${NC}"
echo -e "${BLUE}Backend API: http://localhost:5001${NC}"
echo -e "${BLUE}Frontend: http://localhost:5174${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all servers${NC}"

# Wait for user to stop
wait 
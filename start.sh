#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
echo -e "${BLUE}"
echo "   _____      _____      "
echo "  / ____|    / ____|     "
echo " | |        | |          "
echo " | |        | |          "
echo " | |____    | |____      "
echo "  \_____|    \_____|     "
echo "                         "
echo -e "Collaborative Drawing App${NC}"
echo ""

# Check if .env files exist and copy from examples if not
echo -e "${YELLOW}Checking environment files...${NC}"

if [ ! -f "backend/.env" ]; then
  if [ -f "backend/.env.example" ]; then
    echo -e "${YELLOW}Creating backend/.env from example...${NC}"
    cp backend/.env.example backend/.env
    echo -e "${GREEN}✓ Created backend/.env${NC}"
    echo -e "${RED}⚠️  Don't forget to update your ANTHROPIC_API_KEY in backend/.env!${NC}"
  else
    echo -e "${RED}❌ backend/.env.example not found!${NC}"
  fi
fi

if [ ! -f "frontend-main/.env" ]; then
  if [ -f "frontend-main/.env.example" ]; then
    echo -e "${YELLOW}Creating frontend-main/.env from example...${NC}"
    cp frontend-main/.env.example frontend-main/.env
    echo -e "${GREEN}✓ Created frontend-main/.env${NC}"
  else
    echo -e "${RED}❌ frontend-main/.env.example not found!${NC}"
  fi
fi

# Function to start backend services
start_backend() {
  echo -e "${YELLOW}Starting backend services...${NC}"
  
  # Start Python FastAPI server
  cd backend
  echo -e "${BLUE}Checking Python virtual environment...${NC}"
  
  if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating Python virtual environment...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✓ Created Python virtual environment${NC}"
  fi
  
  # Activate virtual environment
  echo -e "${YELLOW}Activating virtual environment...${NC}"
  source venv/bin/activate
  
  # Install requirements
  echo -e "${YELLOW}Installing Python dependencies...${NC}"
  pip install -r requirements.txt
  
  # Start FastAPI server
  echo -e "${GREEN}Starting FastAPI server...${NC}"
  uvicorn app.main:app --reload --port 8000 > ../logs/fastapi.log 2>&1 &
  FASTAPI_PID=$!
  echo $FASTAPI_PID > ../logs/fastapi.pid
  echo -e "${GREEN}✓ FastAPI server started (PID: $FASTAPI_PID)${NC}"
  
  # Start WebSocket server
  echo -e "${YELLOW}Installing WebSocket server dependencies...${NC}"
  npm install
  
  echo -e "${GREEN}Starting WebSocket server...${NC}"
  node websocket-server.js > ../logs/websocket.log 2>&1 &
  WS_PID=$!
  echo $WS_PID > ../logs/websocket.pid
  echo -e "${GREEN}✓ WebSocket server started (PID: $WS_PID)${NC}"
  
  cd ..
}

# Function to start frontend
start_frontend() {
  echo -e "${YELLOW}Starting frontend...${NC}"
  cd frontend-main
  
  # Install dependencies
  echo -e "${YELLOW}Installing frontend dependencies...${NC}"
  npm install
  
  # Start frontend server
  echo -e "${GREEN}Starting frontend development server...${NC}"
  npm run dev > ../logs/frontend.log 2>&1 &
  FRONTEND_PID=$!
  echo $FRONTEND_PID > ../logs/frontend.pid
  echo -e "${GREEN}✓ Frontend server started (PID: $FRONTEND_PID)${NC}"
  
  cd ..
}

# Create logs directory
mkdir -p logs

# Start services
start_backend
start_frontend

echo ""
echo -e "${GREEN}All services started! 🚀${NC}"
echo -e "${BLUE}Frontend:${NC} http://localhost:5173"
echo -e "${BLUE}Backend API:${NC} http://localhost:8000"
echo -e "${BLUE}WebSocket:${NC} ws://localhost:8080"
echo ""
echo -e "${YELLOW}To stop all services, run:${NC} ./stop.sh"
echo ""

# Add trap to handle Ctrl+C
trap 'echo -e "\n${RED}Interrupted!${NC} Please run ${YELLOW}./stop.sh${NC} to ensure all processes are terminated."; exit 1' INT

# Keep script running
wait 
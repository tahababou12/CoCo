#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Stopping CoCo services...${NC}"

# Function to stop process from PID file
stop_process() {
  local pid_file=$1
  local name=$2
  
  if [ -f "$pid_file" ]; then
    PID=$(cat "$pid_file")
    if ps -p $PID > /dev/null; then
      echo -e "${YELLOW}Stopping $name (PID: $PID)...${NC}"
      kill $PID
      echo -e "${GREEN}✓ $name stopped${NC}"
    else
      echo -e "${BLUE}$name is not running${NC}"
    fi
    rm "$pid_file"
  else
    echo -e "${BLUE}No PID file found for $name${NC}"
  fi
}

# Stop Frontend
stop_process "logs/frontend.pid" "Frontend server"

# Stop WebSocket server
stop_process "logs/websocket.pid" "WebSocket server"

# Stop FastAPI server
stop_process "logs/fastapi.pid" "FastAPI server"

echo -e "${GREEN}All services stopped!${NC}" 
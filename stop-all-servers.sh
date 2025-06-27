#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🛑 Stopping all CoCo servers...${NC}"

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    local name=$2
    local color=$3
    
    echo -e "${color}🛑 Stopping $name on port $port...${NC}"
    lsof -ti:$port | xargs kill -9 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $name stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  No $name process found on port $port${NC}"
    fi
}

# Function to kill processes by name pattern
kill_process() {
    local pattern=$1
    local name=$2
    local color=$3
    
    echo -e "${color}🛑 Stopping $name...${NC}"
    pkill -f "$pattern" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $name stopped${NC}"
    else
        echo -e "${YELLOW}⚠️  No $name process found${NC}"
    fi
}

# Kill processes by port
kill_port 5174 "Frontend Dev Server" $CYAN
kill_port 5001 "Flask API Server" $BLUE
kill_port 8008 "WebSocket Server" $YELLOW
kill_port 9083 "Friendly AI Server" $GREEN
kill_port 9084 "Sarcastic AI Server" $PURPLE

# Kill processes by name pattern (backup method)
kill_process "npm.*dev" "Frontend Dev Server" $CYAN
kill_process "python.*app.py" "Flask API Server" $BLUE
kill_process "node.*websocket-server.js" "WebSocket Server" $YELLOW
kill_process "python.*multimodal_server.py" "Friendly AI Server" $GREEN
kill_process "python.*sarcastic_multimodal_server.py" "Sarcastic AI Server" $PURPLE

# Clean up PID files
echo -e "${BLUE}🧹 Cleaning up PID files...${NC}"
rm -f logs/*.pid 2>/dev/null

# Clean up signal files
echo -e "${BLUE}🧹 Cleaning up signal files...${NC}"
rm -f /tmp/browser_closed 2>/dev/null
rm -f /tmp/coco_shutdown 2>/dev/null

# Wait a moment for processes to fully terminate
sleep 2

# Final check
echo -e "${BLUE}📊 Final Status Check:${NC}"
echo "----------------------------------------"

# Check if any of our ports are still in use
ports=(5174 5001 8008 9083 9084)
all_clear=true

for port in "${ports[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $port is still in use${NC}"
        all_clear=false
    else
        echo -e "${GREEN}✅ Port $port is free${NC}"
    fi
done

echo "----------------------------------------"

if [ "$all_clear" = true ]; then
    echo -e "${GREEN}🎉 All servers stopped successfully!${NC}"
else
    echo -e "${YELLOW}⚠️  Some processes may still be running. You may need to manually kill them.${NC}"
fi

echo -e "${YELLOW}📝 Log files are preserved in the 'logs' directory${NC}" 
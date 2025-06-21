#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "   _____      _____      "
echo "  / ____|    / ____|     "
echo " | |        | |          "
echo " | |        | |          "
echo " | |____    | |____      "
echo "  \_____|    \_____|     "
echo "                         "
echo -e "CoCo Multi-Terminal Setup${NC}"
echo ""

# Kill any existing processes first
echo -e "${YELLOW}Killing any existing processes...${NC}"
./kill-all-ports.sh
sleep 2

# Get the absolute path to the project
PROJECT_PATH=$(pwd)

echo -e "${GREEN}Opening 3 new Terminal windows...${NC}"
echo ""

# Function to open a new terminal window with a specific command
open_terminal() {
    local title="$1"
    local command="$2"
    local color="$3"
    
    echo -e "${color}Opening: $title${NC}"
    
    # Create AppleScript to open new terminal window
    osascript <<EOF
tell application "Terminal"
    activate
    do script "cd '$PROJECT_PATH' && echo '=== $title ===' && $command"
end tell
EOF
    
    sleep 1
}

# Open the three terminal windows
open_terminal "Flask Server (Image Enhancement)" "cd backend && source venv/bin/activate && python app.py" "$GREEN"
open_terminal "Multimodal Server (AI Assistant)" "cd backend && source venv/bin/activate && python multimodal_server.py" "$PURPLE"
open_terminal "Frontend (Vite Dev Server)" "npm run dev" "$CYAN"

echo ""
echo -e "${GREEN}✓ All 3 Terminal windows opened!${NC}"
echo ""
echo -e "${BLUE}Terminal Setup:${NC}"
echo -e "${GREEN}  🖥️  Terminal 1:${NC} Flask Server (Image Enhancement) - http://localhost:5001"
echo -e "${PURPLE}  🎤 Terminal 2:${NC} Multimodal Server (AI Assistant) - ws://localhost:9083"
echo -e "${CYAN}  🌐 Terminal 3:${NC} Frontend (Vite Dev Server) - http://localhost:5174"
echo ""
echo -e "${YELLOW}Instructions:${NC}"
echo "  • Each server runs in its own Terminal window"
echo "  • You can see logs from each server separately"
echo "  • To stop all servers, run: ./kill-all-ports.sh"
echo ""
echo -e "${GREEN}🎉 Your CoCo project is ready!${NC}"
echo -e "${BLUE}Open your browser to: http://localhost:5174${NC}"
echo "" 
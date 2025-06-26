#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Killing all CoCo project ports...${NC}"
echo ""

# Function to kill process on a specific port
kill_port() {
    local port=$1
    local process_name=$2
    
    echo -e "${YELLOW}Checking port $port ($process_name)...${NC}"
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null)
    
    if [ -n "$pid" ]; then
        echo -e "${RED}Found process $pid on port $port${NC}"
        kill -9 $pid 2>/dev/null
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ Killed process on port $port${NC}"
        else
            echo -e "${RED}✗ Failed to kill process on port $port${NC}"
        fi
    else
        echo -e "${GREEN}✓ No process found on port $port${NC}"
    fi
}

# Function to kill processes by name pattern
kill_processes_by_name() {
    local pattern=$1
    local description=$2
    
    echo -e "${YELLOW}Killing $description processes...${NC}"
    
    # Find processes matching the pattern
    local pids=$(pgrep -f "$pattern" 2>/dev/null)
    
    if [ -n "$pids" ]; then
        echo -e "${RED}Found processes: $pids${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null
        echo -e "${GREEN}✓ Killed $description processes${NC}"
    else
        echo -e "${GREEN}✓ No $description processes found${NC}"
    fi
}

# Kill specific ports used by CoCo
kill_port 5001 "Flask API"
kill_port 9083 "Multimodal WebSocket"
kill_port 3000 "Node.js Server"
kill_port 5174 "Vite Frontend"

# Kill processes by name patterns
kill_processes_by_name "python.*app.py" "Flask"
kill_processes_by_name "python.*multimodal_server.py" "Multimodal"
kill_processes_by_name "node.*server.js" "Node.js"
kill_processes_by_name "vite" "Vite"

# Additional cleanup for any remaining Python processes related to the project
echo -e "${YELLOW}Cleaning up any remaining project processes...${NC}"
pkill -f "backend" 2>/dev/null
pkill -f "CoCo" 2>/dev/null

echo ""
echo -e "${GREEN}✓ All CoCo ports and processes killed!${NC}"
echo -e "${BLUE}Ports cleared: 5001, 9083, 3000, 5174${NC}" 
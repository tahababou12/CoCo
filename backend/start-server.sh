#!/bin/bash

# Kill any existing Node processes
pkill -f "node" || true

# Output the server's IP address
echo "Server IP addresses:"
ifconfig | grep "inet " | grep -v 127.0.0.1

# Start the server
echo "Starting WebSocket server..."
node websocket-server.js 
#!/bin/bash

echo "🛑 Stopping all CoCo servers..."

# Stop Flask backend
echo "🛑 Stopping Flask backend..."
pkill -f "python.*app.py" 2>/dev/null
sleep 1

# Stop multimodal server
echo "🛑 Stopping multimodal server..."
pkill -f "python.*multimodal_server.py" 2>/dev/null
sleep 1

# Stop frontend
echo "🛑 Stopping frontend..."
pkill -f "npm.*dev" 2>/dev/null
sleep 1

# Check if any processes are still running
if pgrep -f "python.*app.py\|python.*multimodal_server.py\|npm.*dev" > /dev/null; then
    echo "⚠️  Some processes may still be running. Force stopping..."
    pkill -9 -f "python.*app.py" 2>/dev/null
    pkill -9 -f "python.*multimodal_server.py" 2>/dev/null
    pkill -9 -f "npm.*dev" 2>/dev/null
fi

echo "✅ All servers stopped!"
echo "🎉 You can now run './start-all-servers.sh' again to restart everything" 
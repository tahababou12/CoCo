#!/bin/bash

echo "🛑 Force stopping all CoCo servers..."

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

# Force kill if still running
echo "🛑 Force killing any remaining processes..."
pkill -9 -f "python.*app.py" 2>/dev/null
pkill -9 -f "python.*multimodal_server.py" 2>/dev/null
pkill -9 -f "npm.*dev" 2>/dev/null

# Clean up signal files
rm -f /tmp/browser_closed
rm -f /tmp/coco_shutdown

echo "✅ All servers force stopped!" 
#!/bin/bash
# EC2 stop script for CoCo application

echo "🛑 Stopping CoCo Application..."

# Stop backend
if [ -f logs/backend.pid ]; then
    kill $(cat logs/backend.pid)
    rm logs/backend.pid
    echo "Backend stopped"
fi

# Stop frontend
if [ -f logs/frontend.pid ]; then
    kill $(cat logs/frontend.pid)
    rm logs/frontend.pid
    echo "Frontend stopped"
fi

echo "✅ CoCo stopped successfully!" 
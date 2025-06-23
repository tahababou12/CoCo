#!/bin/bash
# EC2 startup script for CoCo application

echo "🚀 Starting CoCo Application on EC2..."

# Start backend services in background
cd /home/ubuntu/CoCo/backend
nohup pnpm run start-all > ../logs/backend.log 2>&1 &
echo "Backend PID: $!" > ../logs/backend.pid

# Start frontend server
cd /home/ubuntu/CoCo
nohup pnpm run preview --host 0.0.0.0 --port 3000 > logs/frontend.log 2>&1 &
echo "Frontend PID: $!" > logs/frontend.pid

echo "✅ CoCo started successfully!"
echo "Frontend: http://$(curl -s http://checkip.amazonaws.com):3000"
echo "Backend API: http://$(curl -s http://checkip.amazonaws.com):5001"
echo "WebSocket: ws://$(curl -s http://checkip.amazonaws.com):8008"

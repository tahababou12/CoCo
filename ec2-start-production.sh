#!/bin/bash
# Production startup script for CoCo application

echo "🚀 Starting CoCo Application in Production Mode..."

# Build frontend for production
echo "🏗️ Building frontend..."
cd /home/ubuntu/CoCo
pnpm run build

# Copy built files to Nginx web root
sudo mkdir -p /var/www/coco
sudo cp -r dist/* /var/www/coco/
sudo chown -R www-data:www-data /var/www/coco

# Start backend services in background
echo "🔧 Starting backend services..."
cd /home/ubuntu/CoCo/backend
nohup pnpm run start-all > ../logs/backend.log 2>&1 &
echo "Backend PID: $!" > ../logs/backend.pid

echo "✅ CoCo started in production mode!"
echo "Frontend served by Nginx at: https://$(curl -s http://checkip.amazonaws.com)"
echo "Backend API: https://$(curl -s http://checkip.amazonaws.com)/api"
echo "WebSocket: wss://$(curl -s http://checkip.amazonaws.com)/ws" 
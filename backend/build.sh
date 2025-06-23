#!/bin/bash
# Build script for Render backend deployment

echo "🚀 Starting CoCo Backend Build..."

# Install system dependencies
echo "🔧 Installing system dependencies..."
apt-get update
apt-get install -y portaudio19-dev python3-dev build-essential

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
pnpm install

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
python --version
pip --version
pip install -r requirements.txt

echo "✅ Build completed successfully!" 
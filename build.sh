#!/bin/bash
# Build script for Render backend deployment

echo "🚀 Starting CoCo Backend Build..."

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
cd backend
pnpm install

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
python --version
pip --version
pip install -r requirements.txt

echo "✅ Build completed successfully!" 
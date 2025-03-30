#!/bin/bash

# CoCo WebSocket Collaboration Server setup script

echo "Setting up CoCo WebSocket Collaboration Server..."

# Make sure Node.js is installed
if ! command -v node &> /dev/null; then
  echo "Node.js is required but not installed. Please install Node.js 14 or higher."
  exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 14 ]; then
  echo "Node.js version 14 or higher is required. Current version: $(node -v)"
  exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
  echo "Creating default .env file..."
  echo "PORT=8080" > .env
fi

echo "Setup complete! You can now run the server with 'npm start' or 'npm run dev'"
echo "To start the server now, run: npm run dev" 
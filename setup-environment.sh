#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "   _____      _____      "
echo "  / ____|    / ____|     "
echo " | |        | |          "
echo " | |        | |          "
echo " | |____    | |____      "
echo "  \_____|    \_____|     "
echo "                         "
echo -e "CoCo Environment Setup${NC}"
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status
print_status() {
    local status=$1
    local message=$2
    if [ "$status" = "success" ]; then
        echo -e "${GREEN}✓${NC} $message"
    elif [ "$status" = "error" ]; then
        echo -e "${RED}✗${NC} $message"
    elif [ "$status" = "info" ]; then
        echo -e "${BLUE}ℹ${NC} $message"
    elif [ "$status" = "warning" ]; then
        echo -e "${YELLOW}⚠${NC} $message"
    fi
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    print_status "error" "Please run this script from the CoCo project root directory"
    exit 1
fi

print_status "info" "Starting CoCo environment setup..."

# Check Python version
echo ""
print_status "info" "Checking Python installation..."
if command_exists python3; then
    PYTHON_VERSION=$(python3 --version 2>&1 | cut -d' ' -f2)
    print_status "success" "Python $PYTHON_VERSION found"
else
    print_status "error" "Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check Node.js
echo ""
print_status "info" "Checking Node.js installation..."
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_status "success" "Node.js $NODE_VERSION found"
else
    print_status "error" "Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_status "success" "npm $NPM_VERSION found"
else
    print_status "error" "npm is not installed. Please install npm first."
    exit 1
fi

# Setup backend virtual environment
echo ""
print_status "info" "Setting up Python virtual environment..."

cd backend

# Remove existing venv if it exists
if [ -d "venv" ]; then
    print_status "warning" "Removing existing virtual environment..."
    rm -rf venv
fi

# Create new virtual environment
print_status "info" "Creating new virtual environment..."
python3 -m venv venv

if [ ! -d "venv" ]; then
    print_status "error" "Failed to create virtual environment"
    exit 1
fi

print_status "success" "Virtual environment created"

# Activate virtual environment and upgrade pip
print_status "info" "Activating virtual environment and upgrading pip..."
source venv/bin/activate
pip install --upgrade pip

# Install Python dependencies
echo ""
print_status "info" "Installing Python dependencies..."

# Check if requirements.txt exists
if [ -f "requirements.txt" ]; then
    print_status "info" "Installing from requirements.txt..."
    pip install -r requirements.txt
    
    # Install additional dependencies that might be missing or need specific versions
    print_status "info" "Installing additional dependencies with specific versions..."
    pip install google-genai==1.21.1 \
                pydub==0.25.1 \
                PyAudio==0.2.14 \
                websockets==14.2 \
                flask==3.1.1 \
                flask-cors==6.0.1 \
                python-dotenv==1.1.0 \
                mediapipe==0.10.21 \
                opencv-python==4.11.0.86 \
                opencv-contrib-python==4.11.0.86 \
                pillow==11.2.1 \
                numpy==1.26.4 \
                elevenlabs==2.3.0 \
                moviepy==2.2.1 \
                matplotlib==3.10.3 \
                sounddevice==0.5.2 \
                google-api-python-client==2.172.0 \
                google-auth==2.40.3 \
                protobuf==4.25.8 \
                grpcio==1.73.0 \
                pydantic==2.11.7
    
    print_status "success" "Python dependencies installed"
else
    print_status "warning" "requirements.txt not found, installing core dependencies..."
    pip install google-genai==1.21.1 \
                pydub==0.25.1 \
                PyAudio==0.2.14 \
                websockets==14.2 \
                flask==3.1.1 \
                flask-cors==6.0.1 \
                python-dotenv==1.1.0 \
                mediapipe==0.10.21 \
                opencv-python==4.11.0.86 \
                opencv-contrib-python==4.11.0.86 \
                pillow==11.2.1 \
                numpy==1.26.4 \
                elevenlabs==2.3.0 \
                moviepy==2.2.1 \
                matplotlib==3.10.3 \
                sounddevice==0.5.2 \
                google-api-python-client==2.172.0 \
                google-auth==2.40.3 \
                protobuf==4.25.8 \
                grpcio==1.73.0 \
                pydantic==2.11.7
    print_status "success" "Core Python dependencies installed"
fi

# Verify key packages
echo ""
print_status "info" "Verifying key packages..."
python -c "import google.genai; print(f'google-genai version: {google.genai.__version__}')" 2>/dev/null && print_status "success" "google-genai installed" || print_status "error" "google-genai not installed"
python -c "import flask; print(f'Flask version: {flask.__version__}')" 2>/dev/null && print_status "success" "Flask installed" || print_status "error" "Flask not installed"
python -c "import websockets; print(f'websockets version: {websockets.__version__}')" 2>/dev/null && print_status "success" "websockets installed" || print_status "error" "websockets not installed"
python -c "import pydub; print('pydub installed')" 2>/dev/null && print_status "success" "pydub installed" || print_status "error" "pydub not installed"
python -c "import pyaudio; print('PyAudio installed')" 2>/dev/null && print_status "success" "PyAudio installed" || print_status "error" "PyAudio not installed"
python -c "import mediapipe; print('mediapipe installed')" 2>/dev/null && print_status "success" "mediapipe installed" || print_status "error" "mediapipe not installed"
python -c "import cv2; print('opencv-python installed')" 2>/dev/null && print_status "success" "opencv-python installed" || print_status "error" "opencv-python not installed"
python -c "import elevenlabs; print('elevenlabs installed')" 2>/dev/null && print_status "success" "elevenlabs installed" || print_status "error" "elevenlabs not installed"
python -c "import moviepy; print('moviepy installed')" 2>/dev/null && print_status "success" "moviepy installed" || print_status "error" "moviepy not installed"

# Check for .env file
echo ""
print_status "info" "Checking environment configuration..."
if [ -f ".env" ]; then
    print_status "success" ".env file found"
    
    # Check for required environment variables
    if grep -q "GOOGLE_API_KEY" .env; then
        print_status "success" "GOOGLE_API_KEY found in .env"
    else
        print_status "warning" "GOOGLE_API_KEY not found in .env - you'll need to add it"
    fi
    
    if grep -q "GEMINI_API_KEY" .env; then
        print_status "success" "GEMINI_API_KEY found in .env"
    else
        print_status "warning" "GEMINI_API_KEY not found in .env - you'll need to add it"
    fi
else
    print_status "warning" ".env file not found - you'll need to create it with your API keys"
    echo -e "${YELLOW}Create a .env file in the backend directory with:${NC}"
    echo "GOOGLE_API_KEY=your_google_api_key_here"
    echo "GEMINI_API_KEY=your_gemini_api_key_here"
fi

cd ..

# Setup frontend dependencies
echo ""
print_status "info" "Setting up frontend dependencies..."

# Install npm dependencies
if [ -f "package.json" ]; then
    print_status "info" "Installing npm dependencies..."
    npm install
    print_status "success" "npm dependencies installed"
else
    print_status "error" "package.json not found"
    exit 1
fi

# Test the setup
echo ""
print_status "info" "Testing the setup..."

# Test Python imports
cd backend
source venv/bin/activate
python -c "
import sys
print('Testing Python imports...')
try:
    import flask
    import google.genai
    import websockets
    import pydub
    import pyaudio
    print('✓ All Python imports successful')
except ImportError as e:
    print(f'✗ Import error: {e}')
    sys.exit(1)
" && print_status "success" "Python imports test passed" || print_status "error" "Python imports test failed"

cd ..

# Test Node.js setup
print_status "info" "Testing Node.js setup..."
node -e "
console.log('Testing Node.js setup...');
try {
    require('./package.json');
    console.log('✓ Node.js setup successful');
} catch (e) {
    console.log('✗ Node.js setup failed:', e.message);
    process.exit(1);
}
" && print_status "success" "Node.js setup test passed" || print_status "error" "Node.js setup test failed"

echo ""
print_status "success" "🎉 CoCo environment setup complete!"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "${GREEN}1.${NC} Add your API keys to backend/.env file:"
echo "   GOOGLE_API_KEY=your_google_api_key_here"
echo "   GEMINI_API_KEY=your_gemini_api_key_here"
echo ""
echo -e "${GREEN}2.${NC} Start your servers:"
echo "   ./start-all-terminals.sh"
echo ""
echo -e "${GREEN}3.${NC} Or start manually:"
echo "   Terminal 1: cd backend && source venv/bin/activate && python app.py"
echo "   Terminal 2: cd backend && source venv/bin/activate && python multimodal_server.py"
echo "   Terminal 3: npm run dev"
echo ""
echo -e "${GREEN}4.${NC} Open your browser to: http://localhost:5174"
echo ""
print_status "info" "Happy coding! 🚀" 
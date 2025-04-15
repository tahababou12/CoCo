#!/bin/bash

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print banner
echo -e "${BLUE}"
echo "   _____      _____      "
echo "  / ____|    / ____|     "
echo " | |        | |          "
echo " | |        | |          "
echo " | |____    | |____      "
echo "  \_____|    \_____|     "
echo "                         "
echo -e "CoCo Backend Setup${NC}"
echo ""

# Create logs directory
mkdir -p logs
echo -e "${GREEN}✓ Created logs directory${NC}"

# Check for .env file
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo -e "${YELLOW}Creating .env from example...${NC}"
    cp .env.example .env
    echo -e "${GREEN}✓ Created .env${NC}"
    echo -e "${RED}⚠️  Don't forget to update your API keys in .env!${NC}"
  else
    echo -e "${YELLOW}No .env.example found. Creating empty .env file...${NC}"
    touch .env
    echo -e "${GREEN}✓ Created empty .env${NC}"
    echo -e "${RED}⚠️  Please add required API keys to your .env file!${NC}"
  fi
fi

# Install Node.js dependencies
echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
npm install
echo -e "${GREEN}✓ Node.js dependencies installed${NC}"

# Setup Python virtual environment
echo -e "${YELLOW}Setting up Python virtual environment...${NC}"
if [ -d "venv" ]; then
  echo -e "${BLUE}Virtual environment already exists${NC}"
else
  # python3.11 -m venv venv
  python3 -m venv venv
  echo -e "${GREEN}✓ Created Python virtual environment${NC}"
fi

# Activate virtual environment and install dependencies
echo -e "${YELLOW}Installing Python dependencies...${NC}"
if [ -f "venv/bin/activate" ]; then
  source venv/bin/activate
elif [ -f "venv/Scripts/activate" ]; then
  source venv/Scripts/activate
else
  echo -e "${RED}Failed to activate virtual environment${NC}"
  exit 1
fi

# Install requirements for both FastAPI and Flask
pip install -r requirements.txt
echo -e "${GREEN}✓ Python dependencies installed${NC}"

# Copy app.py and related files if not in backend directory
if [ ! -f "app.py" ]; then
  if [ -f "../app.py" ]; then
    echo -e "${YELLOW}Copying app.py from parent directory...${NC}"
    cp ../app.py .
    echo -e "${GREEN}✓ Copied app.py${NC}"
    
    # Check if story_video_generator.py is needed
    if [ ! -f "story_video_generator.py" ] && [ -f "../story_video_generator.py" ]; then
      cp ../story_video_generator.py .
      echo -e "${GREEN}✓ Copied story_video_generator.py${NC}"
    fi
  else
    echo -e "${RED}Warning: app.py not found in parent directory${NC}"
    echo -e "${RED}Please ensure app.py is in the backend directory${NC}"
  fi
fi

# Create necessary directories
mkdir -p img enhanced_drawings story_videos temp_processing
echo -e "${GREEN}✓ Created required directories${NC}"

echo ""
echo -e "${GREEN}✓ Setup complete!${NC}"
echo -e "${YELLOW}To start all backend services, run:${NC} npm run start-all"
echo -e "${YELLOW}For development mode with auto-restart:${NC} npm run dev-all"
echo "" 
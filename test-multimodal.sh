#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Testing multimodal server startup...${NC}"

# Check if we're in the right directory
if [ ! -f "backend/multimodal_server.py" ]; then
    echo -e "${RED}❌ multimodal_server.py not found in backend directory${NC}"
    exit 1
fi

# Check if .env exists
if [ ! -f "backend/.env" ]; then
    echo -e "${RED}❌ .env file not found in backend directory${NC}"
    exit 1
fi

# Test imports
echo -e "${YELLOW}Testing Python imports...${NC}"
cd backend
python -c "
import sys
try:
    import websockets
    print('✅ websockets imported successfully')
except ImportError as e:
    print(f'❌ websockets import failed: {e}')
    sys.exit(1)

try:
    import pydub
    print('✅ pydub imported successfully')
except ImportError as e:
    print(f'❌ pydub import failed: {e}')
    sys.exit(1)

try:
    from google import genai
    print('✅ google.genai imported successfully')
except ImportError as e:
    print(f'❌ google.genai import failed: {e}')
    sys.exit(1)

try:
    import google.generativeai
    print('✅ google.generativeai imported successfully')
except ImportError as e:
    print(f'❌ google.generativeai import failed: {e}')
    sys.exit(1)

try:
    from dotenv import load_dotenv
    import os
    load_dotenv('.env')
    api_key = os.getenv('GOOGLE_API_KEY')
    if api_key:
        print('✅ API key loaded successfully')
    else:
        print('❌ API key not found in .env')
        sys.exit(1)
except Exception as e:
    print(f'❌ Environment setup failed: {e}')
    sys.exit(1)

print('✅ All imports and setup successful!')
"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Import test failed${NC}"
    exit 1
fi

# Test server startup with error capture
echo -e "${YELLOW}Testing server startup (will run for 10 seconds)...${NC}"

# Create a temporary log file
TEMP_LOG=$(mktemp)

# Start server and capture output
python multimodal_server.py > "$TEMP_LOG" 2>&1 &
SERVER_PID=$!

# Wait for startup
sleep 5

# Check if server is listening
if lsof -i :1212 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Multimodal server started successfully and is listening on port 1212${NC}"
    kill $SERVER_PID 2>/dev/null || true
    echo -e "${GREEN}✅ Test completed successfully!${NC}"
else
    echo -e "${RED}❌ Multimodal server failed to start or listen on port 1212${NC}"
    echo -e "${YELLOW}Server output:${NC}"
    cat "$TEMP_LOG"
    kill $SERVER_PID 2>/dev/null || true
    rm "$TEMP_LOG"
    exit 1
fi

# Clean up
rm "$TEMP_LOG"
cd .. 
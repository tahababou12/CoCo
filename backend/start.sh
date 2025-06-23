#!/bin/bash
# Start script for Render backend deployment

echo "🚀 Starting CoCo Backend Services..."

pnpm run start-all 
python multimodal_server.py &
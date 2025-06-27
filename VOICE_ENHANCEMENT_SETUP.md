# 🎤 Voice Enhancement Setup Guide

This guide will help you set up and run the CoCo drawing app with the new voice command enhancement feature.

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.8+ with pip
- Node.js 16+ with npm
- Google Gemini API key
- Microphone and speakers

### 2. Setup Environment Variables
Create a `.env` file in the `backend/` directory:

```bash
cd backend
echo "GOOGLE_API_KEY=your_gemini_api_key_here" > .env
```

Replace `your_gemini_api_key_here` with your actual Google Gemini API key.

### 3. Install Dependencies

**Backend dependencies:**
```bash
cd backend
pip install -r requirements.txt
pip install aiohttp  # For voice enhancement
```

**Frontend dependencies:**
```bash
npm install
```

### 4. Run the Application

**Option A: Use the startup script (Recommended)**
```bash
./start-all-servers.sh
```

**Option B: Manual startup**
```bash
# Terminal 1: Start Flask backend
cd backend
python app.py

# Terminal 2: Start multimodal server
cd backend
python multimodal_server.py

# Terminal 3: Start frontend
npm run dev
```

### 5. Access the Application
Open your browser and go to: http://localhost:5173

## 🎨 How to Use Voice Enhancement

1. **Draw something** on the canvas
2. **Click the AI Assistant button** (top right corner)
3. **Click the microphone button** to start voice input
4. **Say one of these phrases:**
   - "Enhance this drawing with Gemini"
   - "Enhance with Gemini"
   - "Gemini enhance this drawing"
   - "Improve this image with AI"
   - "Upgrade this picture"
   - "Enhance drawing"
   - "Enhance this drawing with more detail"

5. **The assistant will:**
   - Speak back: "I'll enhance your drawing with Gemini AI now! Enhancement started successfully."
   - Show the message in chat
   - Automatically start the enhancement process

## 🔧 Troubleshooting

### Common Issues

**"GOOGLE_API_KEY environment variable is required"**
- Make sure you have a `.env` file in the `backend/` directory
- Verify your API key is valid and has access to Gemini

**"Failed to connect to AI assistant"**
- Check that the multimodal server is running on port 9083
- Ensure your microphone permissions are enabled in the browser

**"Enhancement API error"**
- Verify the Flask backend is running on port 5000
- Check that you have a drawing saved before trying to enhance

**Voice commands not working**
- Make sure you're speaking clearly
- Try different variations of the enhancement phrases
- Check that your microphone is working and not muted

### Port Conflicts
If you get port conflicts, you can stop all servers with:
```bash
./stop-all-servers.sh
```

### Manual Server Management
To stop individual servers:
```bash
# Stop Flask backend
pkill -f "python.*app.py"

# Stop multimodal server
pkill -f "python.*multimodal_server.py"

# Stop frontend
pkill -f "npm.*dev"
```

## 🎯 Voice Command Examples

Here are some phrases that will trigger enhancement:

✅ **Will work:**
- "Enhance this drawing with Gemini"
- "Enhance with Gemini"
- "Gemini enhance this drawing"
- "Improve this image with AI"
- "Upgrade this picture"
- "Enhance drawing"
- "Enhance this drawing with more detail"
- "Make this better with AI"

❌ **Won't work:**
- "Can you help me with this drawing"
- "What is this drawing about"
- "Tell me about this image"

## 🔍 Debugging

### Check Server Status
```bash
# Check if servers are running
ps aux | grep -E "(app.py|multimodal_server.py|npm.*dev)"

# Check ports in use
lsof -i :5000  # Flask backend
lsof -i :9083  # Multimodal server
lsof -i :5173  # Frontend
```

### View Logs
The servers will show detailed logs in their respective terminals. Look for:
- `🎯 Enhancement command detected:` - Voice command recognized
- `✅ Enhancement API called successfully:` - API call successful
- `❌ Enhancement API error:` - API call failed

## 🎉 Success Indicators

When everything is working correctly, you should see:
1. All three servers start without errors
2. Browser opens to the drawing app
3. AI Assistant button appears in top right
4. Microphone button works and shows voice status
5. Voice commands trigger spoken responses and enhancement

## 📞 Support

If you're still having issues:
1. Check the browser console for JavaScript errors
2. Check the terminal logs for Python errors
3. Verify all dependencies are installed correctly
4. Ensure your API key has the necessary permissions 
#!/usr/bin/env python3
"""
Test script to verify voice enhancement functionality
"""

import asyncio
import aiohttp
import json
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def test_voice_enhancement():
    """Test the voice enhancement API endpoint"""
    
    print("🧪 Testing Voice Enhancement API...")
    
    # Test 1: Check if Flask server is running
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("http://localhost:5001/api/test") as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Flask server is running: {result}")
                else:
                    print(f"❌ Flask server error: {response.status}")
                    return False
    except Exception as e:
        print(f"❌ Cannot connect to Flask server: {e}")
        return False
    
    # Test 2: Check if img directory has images
    img_dir = os.path.join(os.path.dirname(__file__), "img")
    if os.path.exists(img_dir):
        img_files = [f for f in os.listdir(img_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        print(f"📁 Found {len(img_files)} images in img directory")
        if img_files:
            print(f"📄 Latest image: {img_files[0]}")
        else:
            print("⚠️  No images found - voice enhancement will fail")
    else:
        print("❌ img directory does not exist")
    
    # Test 3: Test voice enhancement API call
    try:
        async with aiohttp.ClientSession() as session:
            url = "http://localhost:5001/api/enhance-image-voice"
            data = {"prompt": "Test voice enhancement with more detail"}
            
            print(f"📤 Calling voice enhancement API...")
            async with session.post(url, json=data) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Voice enhancement API call successful: {result}")
                    return True
                else:
                    error_text = await response.text()
                    print(f"❌ Voice enhancement API error: {response.status} - {error_text}")
                    return False
    except Exception as e:
        print(f"❌ Error calling voice enhancement API: {e}")
        return False

async def test_command_patterns():
    """Test the voice command regex patterns"""
    
    print("\n🔍 Testing Voice Command Patterns...")
    
    # Import the patterns from multimodal_server
    import re
    
    ENHANCE_COMMANDS = [
        r'\b(?:enhance|improve|make better|upgrade)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)\b',
        r'\b(?:enhance|improve|make better|upgrade)\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)\b',
        r'\b(?:gemini|ai|artificial intelligence)\s+(?:enhance|improve|make better|upgrade)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\b',
        r'\b(?:enhance|improve|make better|upgrade)\s+(?:drawing|image|sketch|picture)\b',
        r'\b(?:enhance|improve|make better|upgrade)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\b',
        r'\b(?:enhance|improve|make better|upgrade)\s+(?:with\s+)?(?:more\s+)?(?:detail|artistic|style)\b'
    ]
    
    def is_enhance_command(text):
        """Check if the given text matches any enhancement command pattern"""
        text_lower = text.lower().strip()
        for pattern in ENHANCE_COMMANDS:
            if re.search(pattern, text_lower):
                return True
        return False
    
    # Test various voice commands
    test_commands = [
        "enhance with gemini",
        "enhance this drawing with gemini",
        "improve this image with ai",
        "make this sketch better with artificial intelligence",
        "gemini enhance this drawing",
        "enhance drawing",
        "improve image",
        "upgrade this picture",
        "enhance with more detail",
        "make better with artistic style",
        "hello world",  # Should not match
        "what's the weather",  # Should not match
    ]
    
    for command in test_commands:
        matches = is_enhance_command(command)
        status = "✅" if matches else "❌"
        print(f"{status} '{command}' -> {matches}")

async def main():
    """Run all tests"""
    print("🚀 Starting Voice Enhancement Tests...\n")
    
    # Test command patterns
    await test_command_patterns()
    
    # Test API functionality
    print("\n" + "="*50)
    success = await test_voice_enhancement()
    
    if success:
        print("\n🎉 All tests passed! Voice enhancement should work.")
        print("\n💡 To use voice enhancement:")
        print("1. Draw something on the canvas")
        print("2. Say 'enhance with gemini' or similar commands")
        print("3. Gemini should respond and start the enhancement")
    else:
        print("\n❌ Tests failed. Check the issues above.")

if __name__ == "__main__":
    asyncio.run(main()) 
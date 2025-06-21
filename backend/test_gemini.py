#!/usr/bin/env python3

import os
import base64
from io import BytesIO
from google import genai
from google.genai import types
from PIL import Image
import numpy as np
import cv2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
if not GEMINI_API_KEY:
    print("Error: GOOGLE_API_KEY not found in environment variables")
    exit(1)

print(f"API Key available: {bool(GEMINI_API_KEY)}")

# Initialize client
client = genai.Client(api_key=GEMINI_API_KEY)

# Model name
GEMINI_MODEL = "gemini-2.0-flash-exp-image-generation"

def test_gemini_api():
    """Test the Gemini API with a simple image"""
    
    # Create a simple test image (a red circle)
    test_img = np.zeros((200, 200, 3), dtype=np.uint8)
    cv2.circle(test_img, (100, 100), 50, (0, 0, 255), -1)  # Red circle
    
    # Convert to PIL Image
    pil_image = Image.fromarray(cv2.cvtColor(test_img, cv2.COLOR_BGR2RGB))
    
    # Convert to base64
    buffered = BytesIO()
    pil_image.save(buffered, format="JPEG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    
    print(f"Test image created, size: {pil_image.size}")
    print(f"Base64 length: {len(img_base64)}")
    
    # Prepare the request
    contents = [
        {"text": "Enhance this simple red circle into a beautiful illustration"},
        {"inlineData": {
            "mimeType": "image/jpeg",
            "data": img_base64
        }}
    ]
    
    config = types.GenerateContentConfig(response_modalities=['Text', 'Image'])
    
    print(f"Model: {GEMINI_MODEL}")
    print(f"Contents structure: {contents}")
    print(f"Config: {config}")
    
    try:
        print("Making API call...")
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=contents,
            config=config
        )
        
        print("API call successful!")
        print(f"Response type: {type(response)}")
        print(f"Response: {response}")
        
        # Check if we got an image back
        if hasattr(response, 'candidates') and response.candidates:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data is not None:
                    print("✅ Image received in response!")
                    return True
                elif hasattr(part, 'text') and part.text is not None:
                    print(f"Text response: {part.text}")
        
        print("❌ No image found in response")
        return False
        
    except Exception as e:
        print(f"❌ API call failed: {str(e)}")
        print(f"Error type: {type(e)}")
        print(f"Error details: {e}")
        return False

if __name__ == "__main__":
    print("Testing Gemini API...")
    success = test_gemini_api()
    if success:
        print("✅ Test passed!")
    else:
        print("❌ Test failed!") 
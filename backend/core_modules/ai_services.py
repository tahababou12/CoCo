"""
AI Services Module
Handles all Gemini API calls and AI processing logic using Strategy pattern
"""

import asyncio
import json
import os
from abc import ABC, abstractmethod
from google import genai
from google.genai.types import (
    LiveConnectConfig,
    SpeechConfig,
    VoiceConfig,
    PrebuiltVoiceConfig
)
import base64
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class AIModelStrategy(ABC):
    """Abstract base class for AI model strategies"""
    
    @abstractmethod
    async def generate_content(self, contents):
        """Generate content using the AI model"""
        pass

class GeminiStrategy(AIModelStrategy):
    """Strategy for Gemini models"""
    
    def __init__(self, api_key, model_name):
        self.client = genai.Client(api_key=api_key)
        self.model_name = model_name
    
    async def generate_content(self, contents):
        """Generate content using Gemini"""
        return await asyncio.to_thread(
            self.client.models.generate_content,
            model=self.model_name,
            contents=contents
        )

class AIService:
    """AI service using strategy pattern"""
    
    def __init__(self, strategy: AIModelStrategy):
        self.strategy = strategy
    
    async def generate_drawing_coordinates(self, drawing_request, canvas_context=None):
        """Generate drawing coordinates using the AI strategy"""
        try:
            contents = self._prepare_contents(drawing_request, canvas_context)
            prompt = self._create_drawing_prompt(drawing_request, canvas_context)
            contents.append({"text": prompt})
            
            print(f"🚀 Calling AI for drawing: {drawing_request}")
            response = await self.strategy.generate_content(contents)
            
            return self._parse_response(response)
            
        except Exception as e:
            print(f"❌ Error calling AI: {e}")
            return None
    
    def _prepare_contents(self, drawing_request, canvas_context):
        """Prepare contents for AI call"""
        contents = []
        
        # Add canvas image if available
        if canvas_context and canvas_context.get('drawing', {}).get('canvasImage'):
            try:
                canvas_image_data = base64.b64decode(canvas_context['drawing']['canvasImage'])
                print(f"🎨 Adding canvas image to AI: {len(canvas_image_data)} bytes")
                
                contents.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": canvas_context['drawing']['canvasImage']
                    }
                })
            except Exception as e:
                print(f"⚠️ Failed to add canvas image: {e}")
        
        return contents
    
    def _create_drawing_prompt(self, drawing_request, canvas_context):
        """Create the drawing prompt"""
        canvas_width = canvas_context.get('drawing', {}).get('canvasWidth', 800) if canvas_context else 800
        canvas_height = canvas_context.get('drawing', {}).get('canvasHeight', 600) if canvas_context else 600
        
        return f"""
You are a drawing coordinate generator for AI cursor animation. The user wants to draw: {drawing_request}

IMPORTANT: You can see the current canvas content! Use this to:
1. If adding to existing drawings: place new elements intelligently around what's already there
2. If drawing something new: use the center area but don't be afraid to use the full canvas
3. Make sure new elements don't overlap with existing ones unless intended

Generate the appropriate number of drawing steps needed to create a recognizable, detailed version of the requested object. Use common sense for complexity!

Generate ONLY a JSON response with sequential drawing steps in this exact format:
{{
  "drawing_steps": [
    {{
      "step": 1,
      "action": "start_drawing",
      "shape_type": "pencil",
      "x": 400,
      "y": 300
    }},
    {{
      "step": 2,
      "action": "move_cursor",
      "x": 450,
      "y": 280
    }},
    {{
      "step": 3,
      "action": "move_cursor",
      "x": 500,
      "y": 300
    }},
    {{
      "step": 4,
      "action": "end_shape"
    }}
  ]
}}

CRITICAL INSTRUCTIONS:
- Create HIGHLY DETAILED, visually rich drawings that look professional and complete
- Use your visual knowledge to draw objects as they actually look in real life
- Be creative and add visual interest - don't settle for basic outlines
- IMPORTANT: Draw like a professional artist - add curves, angles, realistic proportions, and fine details
- Use MANY points for complex shapes - don't be afraid of 20+ steps for detailed objects
- Push the boundaries of what's possible - make drawings that impress and look realistic
- Use "start_drawing" to begin a new shape, "move_cursor" for key points, "end_shape" to finish
- Use the FULL canvas intelligently based on context:
  * If adding to existing drawings: place new elements intelligently around what's already there
  * If drawing something new: use the center area but don't be afraid to use the full canvas
  * Make sure new elements don't overlap with existing ones unless intended
  * For new drawings: use center area (X around {canvas_width//2} ± 100 pixels, Y around {canvas_height//2} ± 80 pixels)
  * For adding details: use coordinates that make sense relative to existing drawings
- Use "rectangle" for straight edges, "ellipse" for circles, "line" for simple lines
- Use "pencil" for complex, organic shapes like tree branches, animal outlines, curved paths, detailed features
- PREFER "pencil" tool for most objects - it allows for more natural, curved, realistic shapes
- Don't just connect dots with straight lines - create smooth, natural curves and realistic proportions
- You can draw ANYTHING the user asks for - animals, objects, scenes, etc.
- Return ONLY the JSON, no other text
"""
    
    def _parse_response(self, response):
        """Parse and clean AI response"""
        if not hasattr(response, 'text') or not response.text:
            print(f"❌ No text response from AI")
            return None
        
        print(f"✅ AI response received: {response.text}")
        
        # Clean the response
        cleaned_text = response.text.strip()
        if cleaned_text.startswith('```json'):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.startswith('```'):
            cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith('```'):
            cleaned_text = cleaned_text[:-3]
        
        cleaned_text = cleaned_text.strip()
        print(f"🧹 Cleaned text: {cleaned_text}")
        
        # Parse JSON
        try:
            drawing_data = json.loads(cleaned_text)
            print(f"🎨 Parsed drawing data: {json.dumps(drawing_data, indent=2)}")
            return drawing_data
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse JSON: {e}")
            print(f"❌ Raw response: {response.text}")
            print(f"❌ Cleaned text: {cleaned_text}")
            return None

# Factory function for creating AI services
def create_ai_service(api_key=None, model_name="gemini-2.0-flash-exp"):
    """Factory function to create AI service with appropriate strategy"""
    if not api_key:
        api_key = os.getenv('GOOGLE_API_KEY')
    
    if not api_key:
        raise ValueError("GOOGLE_API_KEY environment variable is required")
    
    strategy = GeminiStrategy(api_key, model_name)
    return AIService(strategy)

# Legacy function for backward compatibility
async def call_gemini_pro_for_drawing(drawing_request, canvas_context=None):
    """Legacy function - creates AI service and calls it"""
    ai_service = create_ai_service()
    return await ai_service.generate_drawing_coordinates(drawing_request, canvas_context)

def get_system_instruction(personality="friendly"):
    """Get system instruction based on personality"""
    if personality == "sarcastic":
        return """You are a sarcastic, witty AI assistant. Be clever and slightly snarky, but still helpful. 
                 Use dry humor and clever remarks while providing useful assistance."""
    else:
        return """You are a friendly, helpful AI assistant. Be warm, supportive, and encouraging. 
                 Help users with their requests in a positive and constructive way."""

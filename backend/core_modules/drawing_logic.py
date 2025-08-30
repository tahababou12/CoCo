"""
Drawing Logic Module
Handles all drawing-related processing and coordinate parsing using Command pattern
"""

import json
import re
from abc import ABC, abstractmethod

class DrawingCommand(ABC):
    """Abstract base class for drawing commands"""
    
    @abstractmethod
    async def execute(self, websocket):
        """Execute the drawing command"""
        pass

class DrawObjectCommand(DrawingCommand):
    """Command for drawing objects"""
    
    def __init__(self, drawing_request, ai_service):
        self.drawing_request = drawing_request
        self.ai_service = ai_service
    
    async def execute(self, websocket):
        """Execute drawing object command"""
        try:
            print(f"🎨 Drawing request detected: {self.drawing_request}")
            
            # Send loading notification
            await self._send_loading_status(websocket, "loading", "Generating drawing coordinates with AI...")
            
            # Get canvas context from websocket if available
            canvas_context = None
            # Note: In a real implementation, you'd get this from the websocket state
            
            # Call AI for drawing coordinates
            drawing_data = await self.ai_service.generate_drawing_coordinates(self.drawing_request, canvas_context)
            
            if drawing_data and drawing_data.get('drawing_steps'):
                print(f"🎨 Drawing data received: {len(drawing_data.get('drawing_steps', []))} steps")
                
                # Send loading complete notification
                await self._send_loading_status(websocket, "complete", "Ready to draw!")
                
                # Send drawing steps to frontend
                await websocket.send(json.dumps({
                    "type": "drawing_steps",
                    "steps": drawing_data['drawing_steps'],
                    "request": self.drawing_request
                }))
                
                return True
            else:
                print(f"❌ No drawing data received from AI")
                await self._send_loading_status(websocket, "error", "Failed to generate drawing. Please try again.")
                return False
                
        except Exception as e:
            print(f"❌ Error processing drawing command: {e}")
            await self._send_loading_status(websocket, "error", "Failed to generate drawing. Please try again.")
            return False
    
    async def _send_loading_status(self, websocket, status, message):
        """Send loading status notification"""
        try:
            await websocket.send(json.dumps({
                "type": "drawing_loading",
                "status": status,
                "message": message
            }))
        except Exception as e:
            print(f"❌ Error sending loading status: {e}")

class DrawingCommandFactory:
    """Factory for creating drawing commands"""
    
    def __init__(self, ai_service):
        self.ai_service = ai_service
    
    def create_command(self, text):
        """Create appropriate drawing command from text"""
        # Check if this is a drawing request
        drawing_patterns = [
            r"can you draw (.+?)(?:\?|$)",
            r"draw (.+?)(?:\?|$)",
            r"please draw (.+?)(?:\?|$)",
            r"i want you to draw (.+?)(?:\?|$)"
        ]
        
        for pattern in drawing_patterns:
            match = re.search(pattern, text.lower())
            if match:
                drawing_request = match.group(1).strip()
                return DrawObjectCommand(drawing_request, self.ai_service)
        
        return None

class DrawingProcessor:
    """Main drawing processor using command pattern"""
    
    def __init__(self, ai_service):
        self.command_factory = DrawingCommandFactory(ai_service)
    
    async def process_drawing_commands(self, text, websocket):
        """Process drawing commands using command pattern"""
        try:
            # Create command from text
            command = self.command_factory.create_command(text)
            
            if command:
                # Execute the command
                return await command.execute(websocket)
            else:
                return False
                
        except Exception as e:
            print(f"❌ Error processing drawing command: {e}")
            return False

# Legacy function for backward compatibility
async def process_drawing_commands(text, websocket):
    """Legacy function - creates processor and calls it"""
    from .ai_services import create_ai_service
    
    ai_service = create_ai_service()
    processor = DrawingProcessor(ai_service)
    return await processor.process_drawing_commands(text, websocket)

async def parse_drawing_response(gemini_response):
    """
    Parse and validate drawing response from AI
    """
    try:
        if not gemini_response:
            return None
        
        # Clean the response
        cleaned_text = gemini_response.strip()
        if cleaned_text.startswith('```json'):
            cleaned_text = cleaned_text[7:]
        if cleaned_text.startswith('```'):
            cleaned_text = cleaned_text[3:]
        if cleaned_text.endswith('```'):
            cleaned_text = cleaned_text[:-3]
        
        cleaned_text = cleaned_text.strip()
        
        # Parse JSON
        drawing_data = json.loads(cleaned_text)
        
        # Validate structure
        if not drawing_data.get('drawing_steps'):
            print(f"❌ No drawing_steps in response")
            return None
        
        steps = drawing_data['drawing_steps']
        if not isinstance(steps, list) or len(steps) == 0:
            print(f"❌ Invalid drawing_steps format")
            return None
        
        # Validate each step
        for i, step in enumerate(steps):
            if not isinstance(step, dict):
                print(f"❌ Step {i} is not a dictionary")
                return None
            
            required_fields = ['step', 'action']
            for field in required_fields:
                if field not in step:
                    print(f"❌ Step {i} missing required field: {field}")
                    return None
            
            # Validate action types
            valid_actions = ['start_drawing', 'move_cursor', 'end_shape']
            if step['action'] not in valid_actions:
                print(f"❌ Step {i} has invalid action: {step['action']}")
                return None
            
            # Validate coordinates for move_cursor
            if step['action'] == 'move_cursor':
                if 'x' not in step or 'y' not in step:
                    print(f"❌ Step {i} missing coordinates")
                    return None
                
                # Validate coordinate ranges
                x, y = step['x'], step['y']
                if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                    print(f"❌ Step {i} has invalid coordinate types")
                    return None
                
                if x < 0 or y < 0 or x > 2000 or y > 2000:  # Reasonable canvas limits
                    print(f"❌ Step {i} has coordinates out of range: ({x}, {y})")
                    return None
        
        print(f"✅ Drawing response validated successfully")
        return drawing_data
        
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse JSON: {e}")
        return None
    except Exception as e:
        print(f"❌ Error validating drawing response: {e}")
        return None

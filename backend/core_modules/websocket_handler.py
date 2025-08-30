"""
WebSocket Handler Module
Manages all real-time communication and WebSocket connections using Observer pattern
"""

import asyncio
import json
import websockets
import time
from abc import ABC, abstractmethod
from .voice_processing import AudioManager, process_voice_command_with_regex, process_voice_command_with_ai
from .drawing_logic import process_drawing_commands

class MessageHandler(ABC):
    """Abstract base class for message handlers"""
    
    @abstractmethod
    async def handle(self, data, websocket):
        """Handle a specific message type"""
        pass

class VoiceCommandHandler(MessageHandler):
    """Handles voice command messages"""
    
    async def handle(self, data, websocket):
        """Handle voice command message"""
        try:
            text = data.get('text', '')
            if not text:
                return
            
            print(f"🎤 Voice command received: {text}")
            
            # Try regex-based processing first
            processed = await process_voice_command_with_regex(text, websocket)
            
            # If not processed by regex, try AI processing
            if not processed:
                # This would integrate with a session manager
                session = None
                await process_voice_command_with_ai(text, websocket, session)
                
        except Exception as e:
            print(f"❌ Error handling voice command: {e}")

class DrawingRequestHandler(MessageHandler):
    """Handles drawing request messages"""
    
    async def handle(self, data, websocket):
        """Handle drawing request message"""
        try:
            text = data.get('text', '')
            if not text:
                return
            
            print(f"🎨 Drawing request received: {text}")
            await process_drawing_commands(text, websocket)
            
        except Exception as e:
            print(f"❌ Error handling drawing request: {e}")

class AppControlHandler(MessageHandler):
    """Handles app control messages"""
    
    async def handle(self, data, websocket):
        """Handle app control message"""
        try:
            action = data.get('action', '')
            print(f"🎮 App control action: {action}")
            
            if action == 'stop':
                # Handle stop action
                await websocket.send(json.dumps({
                    "type": "app_control_response",
                    "status": "stopping"
                }))
                
        except Exception as e:
            print(f"❌ Error handling app control: {e}")

class PingHandler(MessageHandler):
    """Handles ping messages for connection health"""
    
    async def handle(self, data, websocket):
        """Handle ping message"""
        try:
            await websocket.send(json.dumps({
                "type": "pong",
                "timestamp": time.time()
            }))
        except Exception as e:
            print(f"❌ Error handling ping: {e}")

class WebSocketHandler:
    """
    Handles WebSocket connections and message routing using Observer pattern
    """
    
    def __init__(self):
        self.connections = set()
        self.audio_manager = None
        self.message_handlers = {}
        self._setup_handlers()
    
    def _setup_handlers(self):
        """Setup message handlers for different message types"""
        self.message_handlers = {
            'voice_command': VoiceCommandHandler(),
            'drawing_request': DrawingRequestHandler(),
            'app_control': AppControlHandler(),
            'ping': PingHandler()
        }
    
    async def handle_connection(self, websocket, path):
        """Handle new WebSocket connection"""
        try:
            self.connections.add(websocket)
            print(f"🔌 New WebSocket connection: {len(self.connections)} total")
            
            # Initialize audio manager for this connection
            if not self.audio_manager:
                self.audio_manager = AudioManager()
                self.audio_manager.start_stream()
            
            await self.handle_messages(websocket)
            
        except websockets.exceptions.ConnectionClosed:
            print("🔌 WebSocket connection closed")
        except Exception as e:
            print(f"❌ Error in WebSocket connection: {e}")
        finally:
            self.connections.remove(websocket)
            print(f"🔌 WebSocket disconnected: {len(self.connections)} remaining")
            
            # Clean up audio manager if no connections
            if len(self.connections) == 0 and self.audio_manager:
                self.audio_manager.cleanup()
                self.audio_manager = None
    
    async def handle_messages(self, websocket):
        """Handle incoming WebSocket messages"""
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.route_message(data, websocket)
                except json.JSONDecodeError:
                    print(f"❌ Invalid JSON message: {message}")
                except Exception as e:
                    print(f"❌ Error processing message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            print("🔌 WebSocket connection closed during message handling")
        except Exception as e:
            print(f"❌ Error in message handling: {e}")
    
    async def route_message(self, data, websocket):
        """Route messages to appropriate handlers using Observer pattern"""
        try:
            message_type = data.get('type', 'unknown')
            
            # Get handler for message type
            handler = self.message_handlers.get(message_type)
            
            if handler:
                # Handle the message
                await handler.handle(data, websocket)
            else:
                print(f"⚠️ Unknown message type: {message_type}")
                
        except Exception as e:
            print(f"❌ Error routing message: {e}")
    
    async def broadcast_message(self, message, exclude_websocket=None):
        """Broadcast message to all connected clients"""
        try:
            message_json = json.dumps(message) if isinstance(message, dict) else message
            
            for websocket in self.connections:
                if websocket != exclude_websocket:
                    try:
                        await websocket.send(message_json)
                    except websockets.exceptions.ConnectionClosed:
                        # Remove closed connections
                        self.connections.discard(websocket)
                    except Exception as e:
                        print(f"❌ Error broadcasting to websocket: {e}")
                        
        except Exception as e:
            print(f"❌ Error broadcasting message: {e}")
    
    def get_connection_count(self):
        """Get current connection count"""
        return len(self.connections)
    
    def cleanup(self):
        """Clean up WebSocket handler resources"""
        if self.audio_manager:
            self.audio_manager.cleanup()
        print("🔌 WebSocket handler cleaned up")

async def gemini_session_handler(websocket):
    """
    Main Gemini session handler for WebSocket connections
    """
    try:
        handler = WebSocketHandler()
        await handler.handle_connection(websocket, None)
    except Exception as e:
        print(f"❌ Error in Gemini session handler: {e}")
    finally:
        # Clean up
        if 'handler' in locals():
            handler.cleanup()

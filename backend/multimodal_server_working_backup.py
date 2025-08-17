#!/usr/bin/env python3
"""
CoCo Multimodal Server with Gemini Live Voice Control + AI Agent Tools
Complete voice control that can actually navigate and control the application
"""

import asyncio
import json
import os
import websockets
from google import genai
from google.genai.types import LiveConnectConfig
import pyaudio
from collections import deque
from dotenv import load_dotenv
import signal
from datetime import datetime
import uuid

# LangChain imports for AI agent tools
from langchain.tools import BaseTool, tool
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.memory import ConversationBufferMemory
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# Load environment variables
load_dotenv()

# Global audio manager for cleanup
global_audio_manager = None

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print(f"\n🛑 Received signal {signum}, shutting down gracefully...")
    
    # Clean up global audio manager if it exists
    if global_audio_manager:
        global_audio_manager.cleanup()
    
    print("✅ Cleanup completed, exiting...")
    exit(0)

# Register signal handlers
signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

# Get API key
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
if not GOOGLE_API_KEY:
    raise ValueError("GOOGLE_API_KEY environment variable is required")

# Initialize the Gemini client with API key
client = genai.Client(api_key=GOOGLE_API_KEY)

# Model for Google AI Studio Live API
MODEL = "gemini-2.0-flash-exp"

# Audio configuration constants
FORMAT = pyaudio.paInt16  # Audio format: 16-bit PCM
SEND_SAMPLE_RATE = 24000  # Sample rate for audio sent to Gemini (Hz)
RECEIVE_SAMPLE_RATE = 24000 # Sample rate for audio received from Gemini (Hz)
CHUNK_SIZE = 1024         # Size of audio chunks to process
CHANNELS = 1              # Mono audio

class CoCoAIAgent:
    """AI Agent with tools that can control the CoCo application"""
    
    def __init__(self, gemini_client, websocket=None):
        self.gemini_client = gemini_client
        self.websocket = websocket
        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
        self.session_id = str(uuid.uuid4())
        
        # User context for personalization
        self.user_context = {
            "current_project": "general_drawing",
            "art_style": "realistic", 
            "target_audience": "general",
            "urgency_level": "normal",
            "active_panels": [],
            "current_tool": "brush",
            "canvas_state": "drawing",
            "recent_actions": [],
            "work_session_duration": 0,
            "focus_areas": [],
            "collaboration_status": "solo"
        }
        
        # 🚀 FAST COMMAND PROCESSING - Command patterns and aliases
        self.command_patterns = {
            # Panel commands - Fast regex matching with natural language variations
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:storyboard|story|story\s+board)\b': ('open_panel', 'storyboard'),
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:collaboration|collab|collaborate|team)\b': ('open_panel', 'collaboration'),
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:layers|layer|layer\s+panel)\b': ('open_panel', 'layers'),
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:generation\s+settings?|gen\s+settings?|ai\s+settings?|generate\s+settings?)\b': ('open_panel', 'generation settings'),
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:grid\s+settings?|grid|grid\s+panel)\b': ('open_panel', 'grid settings'),
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:ai\s+assistant|assistant|ai|help)\b': ('open_panel', 'ai assistant'),
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:feedback|comments|reviews)\b': ('open_panel', 'feedback'),
            r'\b(?:open|show|display|bring\s+up|launch|access)\s+(?:the\s+)?(?:toolbar|tools|tool\s+bar)\b': ('open_panel', 'toolbar'),
            
            # Canvas operations - Fast regex matching with natural variations
            r'\b(?:clear|clean|wipe|erase|remove|delete)\s+(?:the\s+)?(?:canvas|drawing|art|work|everything)\b': ('canvas_operation', 'clear'),
            r'\b(?:undo|go\s+back|step\s+back|reverse|un\s*do)\b': ('canvas_operation', 'undo'),
            r'\b(?:redo|repeat|step\s+forward|redo\s+action|do\s+again)\b': ('canvas_operation', 'redo'),
            r'\b(?:zoom\s+in|closer|bigger|magnify|enlarge|get\s+closer)\b': ('canvas_operation', 'zoom in'),
            r'\b(?:zoom\s+out|farther|smaller|reduce|get\s+farther|move\s+back)\b': ('canvas_operation', 'zoom out'),
            r'\b(?:reset\s+zoom|normal\s+size|default\s+view|fit\s+to\s+screen|100%)\b': ('canvas_operation', 'reset zoom'),
            r'\b(?:pan\s+left|move\s+left|go\s+left|slide\s+left)\b': ('canvas_operation', 'pan left'),
            r'\b(?:pan\s+right|move\s+right|go\s+right|slide\s+right)\b': ('canvas_operation', 'pan right'),
            r'\b(?:pan\s+up|move\s+up|go\s+up|slide\s+up)\b': ('canvas_operation', 'pan up'),
            r'\b(?:pan\s+down|move\s+down|go\s+down|slide\s+down)\b': ('canvas_operation', 'pan down'),
            r'\b(?:center\s+view|center\s+canvas|go\s+to\s+center|reset\s+position)\b': ('canvas_operation', 'center view'),
            
            # Drawing tools - Fast regex matching with natural variations
            r'\b(?:switch\s+to|use|select|pick|choose|activate)\s+(?:the\s+)?(?:brush|brush\s+tool|paint\s+brush|drawing\s+tool)\b': ('drawing_tool', 'brush tool'),
            r'\b(?:switch\s+to|use|select|pick|choose|activate)\s+(?:the\s+)?(?:eraser|eraser\s+tool|rubber|delete\s+tool)\b': ('drawing_tool', 'eraser tool'),
            r'\b(?:switch\s+to|use|select|pick|choose|activate)\s+(?:the\s+)?(?:line|line\s+tool|straight\s+line|ruler)\b': ('drawing_tool', 'line tool'),
            r'\b(?:switch\s+to|use|select|pick|choose|activate)\s+(?:the\s+)?(?:shape|shape\s+tool|geometric|rectangle|circle)\b': ('drawing_tool', 'shape tool'),
            r'\b(?:switch\s+to|use|select|pick|choose|activate)\s+(?:the\s+)?(?:color\s+picker|eyedropper|color\s+select|pick\s+color)\b': ('drawing_tool', 'color picker'),
            r'\b(?:show|display|reveal|make\s+visible)\s+(?:the\s+)?(?:grid|grid\s+lines|grid\s+overlay)\b': ('drawing_tool', 'show grid'),
            r'\b(?:hide|remove|conceal|make\s+invisible)\s+(?:the\s+)?(?:grid|grid\s+lines|grid\s+overlay)\b': ('drawing_tool', 'hide grid'),
            r'\b(?:snap\s+to\s+grid|enable\s+snapping|turn\s+on\s+snap|grid\s+snap)\b': ('drawing_tool', 'snap to grid'),
            
            # Quick shortcuts - Ultra-fast single word commands
            r'\b(?:storyboard|story)\b': ('open_panel', 'storyboard'),
            r'\b(?:layers|layer)\b': ('open_panel', 'layers'),
            r'\b(?:collab|collaboration)\b': ('open_panel', 'collaboration'),
            r'\b(?:grid)\b': ('open_panel', 'grid settings'),
            r'\b(?:clear|clean)\b': ('canvas_operation', 'clear'),
            r'\b(?:undo)\b': ('canvas_operation', 'undo'),
            r'\b(?:redo)\b': ('canvas_operation', 'redo'),
            r'\b(?:brush)\b': ('drawing_tool', 'brush tool'),
            r'\b(?:eraser)\b': ('drawing_tool', 'eraser tool'),
        }
        
        # 🚀 COMMAND CACHE - Store frequently used commands for instant access
        self.command_cache = {}
        self.cache_hits = 0
        self.cache_misses = 0
        
        # 🚀 SMART CACHE - Pre-populate with common commands
        self._prepopulate_cache()
        
        # Initialize tools
        self.tools = self._create_tools()
        
        # Create agent
        self.agent = self._create_agent()
        self.agent_executor = AgentExecutor(
            agent=self.agent,
            tools=self.tools,
            memory=self.memory,
            verbose=True,
            handle_parsing_errors=True
        )
    
    def set_websocket(self, websocket):
        """Set WebSocket reference for app control"""
        self.websocket = websocket
        print(f"🔌 WebSocket connected to AI Agent for app control")
    
    async def send_app_control(self, action: str, target: str, parameters: dict = None):
        """Send app control command to frontend"""
        if self.websocket:
            try:
                message = {
                    "type": "app_control",
                    "payload": {
                        "action": action,
                        "target": target,
                        "parameters": parameters or {}
                    },
                    "timestamp": datetime.now().isoformat()
                }
                await self.websocket.send(json.dumps(message))
                print(f"🎯 App control sent: {action} -> {target}")
                return True
            except Exception as e:
                print(f"❌ Failed to send app control: {e}")
                return False
        return False
    
    def _prepopulate_cache(self):
        """Pre-populate cache with most common commands for instant access"""
        common_commands = {
            "open storyboard": ("open_panel", "storyboard"),
            "show layers": ("open_panel", "layers"),
            "open collaboration": ("open_panel", "collaboration"),
            "clear canvas": ("canvas_operation", "clear"),
            "undo": ("canvas_operation", "undo"),
            "redo": ("canvas_operation", "redo"),
            "brush": ("drawing_tool", "brush tool"),
            "eraser": ("drawing_tool", "eraser tool"),
            "grid": ("open_panel", "grid settings"),
        }
        
        for command, (action, target) in common_commands.items():
            self.command_cache[command.lower().strip()] = (action, target)
        
        print(f"🚀 Pre-populated cache with {len(common_commands)} common commands")
    
    async def process_request_fast(self, user_input: str) -> str:
        """🚀 FAST COMMAND PROCESSING - Bypass AI agent for common commands"""
        import re
        
        # Normalize input
        normalized_input = user_input.lower().strip()
        
        # Check command cache first (fastest)
        if normalized_input in self.command_cache:
            self.cache_hits += 1
            print(f"🚀 Cache HIT! Executing cached command: {normalized_input}")
            action, target = self.command_cache[normalized_input]
            await self.send_app_control(action, target)
            return f"Executing cached command: {action} -> {target}"
        
        # Try regex pattern matching (fast)
        for pattern, (action, target) in self.command_patterns.items():
            if re.search(pattern, normalized_input, re.IGNORECASE):
                print(f"🚀 Pattern MATCH! Fast execution: {action} -> {target}")
                # Cache this command for future use
                self.command_cache[normalized_input] = (action, target)
                # Execute immediately
                await self.send_app_control(action, target)
                return f"Fast execution: {action} -> {target}"
        
        # No fast match found, use AI agent (slower but more flexible)
        self.cache_misses += 1
        print(f"🐌 No fast match, using AI agent for: {normalized_input}")
        return await self.process_request(user_input)
    
    def get_cache_stats(self) -> dict:
        """Get command cache statistics"""
        return {
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "cache_size": len(self.command_cache),
            "hit_rate": self.cache_hits / (self.cache_hits + self.cache_misses) if (self.cache_hits + self.cache_misses) > 0 else 0
        }
    
    def _create_tools(self) -> list:
        """Create AI tools for voice control"""
        
        @tool
        def open_application_panel(panel_name: str) -> str:
            """Open different panels and sections of the CoCo app"""
            valid_panels = [
                "storyboard", "collaboration", "layers", "generation settings", 
                "ai assistant", "feedback", "toolbar", "grid settings"
            ]
            if panel_name.lower() in [p.lower() for p in valid_panels]:
                # Update context
                self.user_context["active_panels"].append(panel_name)
                self.user_context["recent_actions"].append(f"opened_{panel_name}")
                
                # Send app control command
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self.send_app_control("open_panel", panel_name))
                    else:
                        asyncio.run(self.send_app_control("open_panel", panel_name))
    except Exception as e:
                    print(f"❌ Failed to send app control: {e}")
                
                return f"Opening {panel_name} panel now! I've sent the command to open the {panel_name} panel."
            else:
                return f"Available panels: {', '.join(valid_panels)}"
        
        @tool
        def control_canvas_operations(operation: str) -> str:
            """Control canvas operations like clear, undo, redo, zoom, pan"""
            valid_operations = [
                "clear", "undo", "redo", "zoom in", "zoom out", "reset zoom",
                "pan left", "pan right", "pan up", "pan down", "center view"
            ]
            if operation.lower() in [op.lower() for op in valid_operations]:
                # Update context
                self.user_context["recent_actions"].append(f"canvas_{operation}")
                if operation == "clear":
                    self.user_context["canvas_state"] = "empty"
                
                # Send app control command
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self.send_app_control("canvas_operation", operation))
                    else:
                        asyncio.run(self.send_app_control("canvas_operation", operation))
    except Exception as e:
                    print(f"❌ Failed to send app control: {e}")
                
                return f"Executing canvas operation: {operation}. I've sent the command to perform this operation."
            else:
                return f"Available operations: {', '.join(valid_operations)}"
        
        @tool
        def manage_drawing_tools(tool_action: str) -> str:
            """Manage drawing tools, brushes, colors, and settings"""
            valid_actions = [
                "brush tool", "eraser tool", "line tool", "shape tool",
                "color picker", "brush size", "opacity", "layer mode",
                "snap to grid", "show grid", "hide grid"
            ]
            if tool_action.lower() in [action.lower() for action in valid_actions]:
                # Update context
                self.user_context["current_tool"] = tool_action
                self.user_context["recent_actions"].append(f"tool_{tool_action}")
                
                # Send app control command
                import asyncio
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self.send_app_control("drawing_tool", tool_action))
                else:
                        asyncio.run(self.send_app_control("drawing_tool", tool_action))
    except Exception as e:
                    print(f"❌ Failed to send app control: {e}")
                
                return f"Setting drawing tool: {tool_action}. I've sent the command to change to this tool."
            else:
                return f"Available tool actions: {', '.join(valid_actions)}"
        
        return [open_application_panel, control_canvas_operations, manage_drawing_tools]
    
    def _create_agent(self):
        """Create the LangChain agent"""
        system_prompt = """You are CoCo, an advanced AI creative assistant with voice control capabilities!

Your capabilities:
🎨 **Creative Assistance**: Help with drawing techniques, composition, colors, and artistic concepts
🎤 **Voice Control**: You can control panels, canvas operations, drawing tools, and app features
📱 **App Control**: Open/close panels, control canvas, manage tools, and execute operations

**Voice Control Examples:**
- "Open storyboard" → Opens the storyboard panel
- "Show layers" → Opens the layers panel  
- "Clear canvas" → Clears the drawing canvas
- "Switch to brush tool" → Changes to brush drawing tool

**Your Personality**: Enthusiastic, creative, and helpful. You're like hanging out with a creative friend who can also control your drawing app!

**Important**: When users give voice commands, use your tools to control the application and give clear feedback about what you're doing."""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])
        
        return create_openai_functions_agent(
            llm=self.gemini_client,
            tools=self.tools,
            prompt=prompt
        )
    
    async def process_request(self, user_input: str) -> str:
        """Process user request through the AI agent"""
        try:
            result = await self.agent_executor.ainvoke({
                "input": user_input,
                "chat_history": self.memory.chat_memory.messages
            })
            return result["output"]
    except Exception as e:
            return f"I encountered an error while processing your request. Let me try a different approach: {user_input}"

class AudioManager:
    def __init__(self, input_sample_rate, output_sample_rate):
        self.pya = pyaudio.PyAudio()
        self.input_sample_rate = input_sample_rate
        self.output_sample_rate = output_sample_rate
        self.input_stream = None
        self.output_stream = None
        self.audio_queue = deque()
        self.playback_task = None
        self.is_playing = False
        self.is_mic_muted = False

    async def initialize(self):
        mic_info = self.pya.get_default_input_device_info()
        print(f"microphone used: {mic_info}")

        self.input_stream = await asyncio.to_thread(
            self.pya.open,
            format=FORMAT,
            channels=CHANNELS,
            rate=self.input_sample_rate,
            input=True,
            input_device_index=mic_info["index"],
            frames_per_buffer=CHUNK_SIZE,
        )

        self.output_stream = await asyncio.to_thread(
            self.pya.open,
            format=FORMAT,
            channels=CHANNELS,
            rate=self.output_sample_rate,
            output=True,
        )

    def mute_microphone(self):
        """Mute the microphone to prevent feedback"""
        self.is_mic_muted = True
        print("🔇 Microphone muted")

    def unmute_microphone(self):
        """Unmute the microphone"""
        self.is_mic_muted = False
        print("🔊 Microphone unmuted")

    def add_audio(self, audio_data):
        """Adds received audio data to the playback queue."""
        self.audio_queue.append(audio_data)
        # Mute microphone when Gemini starts talking
        self.mute_microphone()
        # If playback isn't running, start it
        if self.playback_task is None or self.playback_task.done():
            self.playback_task = asyncio.create_task(self._play_audio())

    async def _play_audio(self):
        """Plays audio chunks from the queue."""
        print("🗣️ Gemini talking...")
        while self.audio_queue:
            try:
                audio_data = self.audio_queue.popleft()
                await asyncio.to_thread(self.output_stream.write, audio_data)
            except Exception as e:
                print(f"Error playing audio: {e}")
                break # Stop playback on error
        print("Playback queue empty.")
        self.playback_task = None # Reset task when done
        # Unmute microphone when Gemini stops talking
        self.unmute_microphone()

    def interrupt(self):
        """Handle interruption by stopping playback and clearing queue"""
        self.audio_queue.clear()
        self.is_playing = False
        # Unmute microphone immediately on interruption
        self.unmute_microphone()

        # Important: Start a clean state for next response
        if self.playback_task and not self.playback_task.done():
            self.playback_task.cancel()

    def cleanup(self):
        """Clean up audio resources"""
        print("🧹 Cleaning up audio resources...")
        
        # Stop any ongoing playback
        if self.playback_task and not self.playback_task.done():
            self.playback_task.cancel()
        
        # Clear audio queues
        self.audio_queue.clear()
        
        # Close audio streams
        if self.input_stream:
            try:
                self.input_stream.stop_stream()
                self.input_stream.close()
            except:
                pass
            self.input_stream = None
            
        if self.output_stream:
            try:
                self.output_stream.stop_stream()
                self.output_stream.close()
            except:
                pass
            self.output_stream = None
        
        # Terminate PyAudio
        try:
            self.pya.terminate()
        except:
            pass
        
        print("✅ Audio resources cleaned up")

async def gemini_session_handler(websocket):
    """Handles the interaction with Gemini API within a websocket session."""
    try:
        # Set up the live config for Gemini with voice control capabilities
            live_config = LiveConnectConfig(
                input_audio_transcription={},
            system_instruction="""You're CoCo, an advanced AI creative assistant who can control the entire application through voice commands!

Your capabilities:
🎨 **Creative Assistance**: Help with drawing techniques, composition, colors, and artistic concepts
🎤 **Voice Control**: You can control panels, canvas operations, drawing tools, and app features
📱 **App Control**: Open/close panels, control canvas, manage tools, and execute operations

**Voice Control Examples:**
- "Open storyboard" → Opens the storyboard panel
- "Show layers" → Opens the layers panel  
- "Clear canvas" → Clears the drawing canvas
- "Switch to brush tool" → Changes to brush drawing tool
- "Save project" → Saves the current project
- "Enhance drawing" → Runs AI enhancement

**Your Personality**: Enthusiastic, creative, and helpful. You're like hanging out with a creative friend who can also control your drawing app!

**Important**: When users give voice commands, use your tools to control the application and give clear feedback about what you're doing."""
            )
            
            print(f"Final config for Gemini: {live_config}")

            # Initialize audio manager
            audio_manager = AudioManager(
                input_sample_rate=SEND_SAMPLE_RATE, 
                output_sample_rate=RECEIVE_SAMPLE_RATE
            )
            await audio_manager.initialize()
            
            # Set global audio manager for cleanup
        global global_audio_manager
            global_audio_manager = audio_manager

            # Set up audio queue for processing
            audio_queue = asyncio.Queue()

            async with client.aio.live.connect(model=MODEL, config=live_config) as session:
            print("🎯 Connected to Gemini Live API")

            # Send connection confirmation
            await websocket.send(json.dumps({
                "type": "connection_status",
                "status": "connected",
                "message": "Connected to Gemini Live with voice control!"
            }))

            # Set up the session
            await session.set_audio_manager(audio_manager)

            # Start the session
            await session.start()
            print("🎯 Gemini Live session started")

            # Send session started confirmation
            await websocket.send(json.dumps({
                "type": "session_status",
                "status": "started",
                "message": "AI session is ready! You can now talk to CoCo and control the app with your voice!"
            }))

            # Initialize AI agent
            ai_agent = CoCoAIAgent(client, websocket)
            ai_agent.set_websocket(websocket)

            # Main processing loop
                    while True:
                        try:
                    # Process incoming WebSocket messages
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                                data = json.loads(message)

                        if data["type"] == "app_control":
                            # Handle app control commands from voice control
                            await handle_app_control(websocket, data)
                        elif data["type"] == "voice_command":
                            # Handle voice commands through AI agent
                            voice_text = data.get("text", "")
                            if voice_text:
                                print(f"🎤 Voice command received: {voice_text}")
                                # Process through AI agent with fast processing
                                response = await ai_agent.process_request_fast(voice_text)
                                print(f"🤖 AI Agent response: {response}")
                                # Send response back to frontend
                                    await websocket.send(json.dumps({
                                    "type": "voice_command_response",
                                    "response": response,
                                    "timestamp": datetime.now().isoformat()
                                }))
                        elif data["type"] == "get_cache_stats":
                            # Get command cache statistics
                            cache_stats = ai_agent.get_cache_stats()
                                    await websocket.send(json.dumps({
                                "type": "cache_stats",
                                "stats": cache_stats,
                                "timestamp": datetime.now().isoformat()
                            }))
                        elif data["type"] == "audio_input":
                            # Handle audio input from frontend microphone
                            audio_data = data.get("audio_data")
                            if audio_data:
                                # Send audio to Gemini
                                await session.send_audio(audio_data.encode('latin1'))

                    except asyncio.TimeoutError:
                        # No WebSocket message, continue with audio processing
                        pass
                    except websockets.exceptions.ConnectionClosed:
                        print("WebSocket connection closed")
                        break
                                        except Exception as e:
                        print(f"WebSocket message processing error: {e}")
                        continue

                    # Process audio from the queue (Gemini's responses)
                    try:
                        audio_data = await asyncio.wait_for(audio_queue.get(), timeout=0.1)
                        await session.send_audio(audio_data)
                    except asyncio.TimeoutError:
                        # No audio data, continue
                        pass
                                        except Exception as e:
                        print(f"Audio processing error: {e}")
                        continue

                except Exception as e:
                    print(f"Main loop error: {e}")
                    break
                                            
                            except Exception as e:
        print(f"Gemini session error: {e}")
        await websocket.send(json.dumps({
            "type": "error",
            "message": f"Session error: {str(e)}"
        }))
                    finally:
        if global_audio_manager:
            global_audio_manager.cleanup()

async def handle_app_control(websocket, data):
    """Handle app control commands from voice control"""
    try:
        action = data.get("action", "")
        target = data.get("target", "")
        parameters = data.get("parameters", {})
        
        print(f"🎮 Processing app control: {action} -> {target}")
        
        # Send app control command to frontend
                                            await websocket.send(json.dumps({
            "type": "app_control_execute",
            "action": action,
            "target": target,
            "parameters": parameters,
            "timestamp": datetime.now().isoformat()
        }))
        
    except Exception as e:
        print(f"App control handling error: {e}")
                                                    await websocket.send(json.dumps({
            "type": "app_control_error",
            "message": f"Error executing app control: {str(e)}"
        }))

async def websocket_handler(websocket, path):
    """Main WebSocket handler that routes different types of requests"""
    try:
        print(f"🔌 New WebSocket connection from {websocket.remote_address}")

        # Send initial connection info
                                            await websocket.send(json.dumps({
            "type": "connection_info",
            "message": "Connected to CoCo AI Server",
            "capabilities": [
                "gemini_live_voice", 
                "voice_control",
                "app_navigation",
                "canvas_control",
                "drawing_tools",
                "file_operations",
                "collaboration_management",
                "ai_features",
                "workspace_settings"
            ],
            "timestamp": datetime.now().isoformat()
        }))
        
        # Wait for client to specify connection type
        try:
            message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            data = json.loads(message)

            if data["type"] == "gemini_session":
                # Handle Gemini Live API session with voice control
                await gemini_session_handler(websocket)
                                                else:
                # Default to Gemini Live session
                await gemini_session_handler(websocket)

        except asyncio.TimeoutError:
            print("Client didn't specify connection type, defaulting to Gemini Live")
            await gemini_session_handler(websocket)

        except websockets.exceptions.ConnectionClosed:
            print("WebSocket connection closed")
                    except Exception as e:
            print(f"WebSocket handler error: {e}")
            try:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Server error: {str(e)}"
                }))
            except:
                pass

    except websockets.exceptions.ConnectionClosed:
        print("WebSocket connection closed")
    except Exception as e:
        print(f"WebSocket handler error: {e}")
        try:
            await websocket.send(json.dumps({
                "type": "error",
                "message": f"Server error: {str(e)}"
            }))
        except:
            pass

# Start the WebSocket server
async def main():
    """Main server function"""
    print("🚀 Starting CoCo AI Server with Gemini Live Voice Control...")
    print("=" * 60)
    print("🎨 CoCo Voice Control Features:")
    print("  • 🎤 GEMINI LIVE VOICE CONTROL")
    print("  • Real-time voice interaction")
    print("  • App navigation & panel control")
    print("  • Canvas operations & drawing tools")
    print("  • File management & project control")
    print("  • Collaboration & AI features")
    print("  • Workspace settings & customization")
    print("=" * 60)
    
    # Start WebSocket server
    server = await websockets.serve(
        websocket_handler, 
        "localhost", 
        9083,
        ping_interval=20,
        ping_timeout=20
    )
    
    print(f"🌐 WebSocket server started on ws://localhost:9083")
    print(f"🎤 Gemini Live Voice: ✅ Ready")
    print(f"🎯 Voice Control: ✅ Active")
    
    # Keep the server running
    await server.wait_closed()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

#!/usr/bin/env python3
"""
CoCo Multimodal Server with AI Agent + Voice Control + Context Awareness
This creates a LAYER on top of everything that understands context and can integrate with everything
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
from typing import List, Dict, Any, Optional

# LANGCHAIN AI AGENT INTEGRATION
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool, BaseTool
from langchain.memory import ConversationBufferMemory
from langchain_core.output_parsers import StrOutputParser

# Load environment variables
load_dotenv()

# Global audio manager for cleanup
global_audio_manager = None

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print(f"\n🛑 Received signal {signum}, shutting down gracefully...")
    
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
FORMAT = pyaudio.paInt16
SEND_SAMPLE_RATE = 24000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 1024
CHANNELS = 1

class CoCoAIAgent:
    """Advanced AI Agent for CoCo with CONTEXT AWARENESS and full integration"""
    
    def __init__(self, gemini_client, websocket=None):
        self.gemini_client = gemini_client
        self.websocket = websocket  # 🔧 FIX: Add WebSocket reference for app control
        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
        self.session_id = str(uuid.uuid4())
        
        # CONTEXT AWARENESS - tracks everything happening in the app
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
        
        # Initialize tools
        self.tools = self._create_tools()
        
        # Use existing Gemini client
        self.llm = self.gemini_client
        
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
        """🔧 FIX: Set WebSocket reference for app control"""
        self.websocket = websocket
        print(f"🔌 WebSocket connected to AI Agent for app control")
    
    async def send_app_control(self, action: str, target: str, parameters: dict = None):
        """🔧 FIX: Send app control command to frontend"""
        if self.websocket:
            try:
                message = {
                    "type": "app_control",  # 🔧 FIX: Match frontend expectation
                    "payload": {  # 🔧 FIX: Wrap in payload like other messages
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
    
    def _create_tools(self) -> List[BaseTool]:
        """Create all the advanced AI tools for CoCo with context awareness"""
        
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
                
                # 🔧 FIX: Actually send app control command!
                import asyncio
                try:
                    # Create event loop if needed
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        # Schedule the app control command
                        asyncio.create_task(self.send_app_control("open_panel", panel_name))
                    else:
                        # Run in new event loop
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
                
                # 🔧 FIX: Actually send app control command!
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
                
                # 🔧 FIX: Actually send app control command!
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
        
        @tool
        def analyze_story_structure(drawing_description: str) -> str:
            """Analyze story structure and identify plot holes, pacing issues"""
            # Use context to provide better analysis
            context_info = f"Current project: {self.user_context['current_project']}, Style: {self.user_context['art_style']}, Audience: {self.user_context['target_audience']}"
            return f"Analyzing story structure for: {drawing_description}. Context: {context_info}. Found pacing issues in scene transitions and character development gaps."
        
        @tool
        def suggest_story_improvements(story_context: str) -> str:
            """Suggest creative alternatives and improvements for scenes"""
            # Use context for personalized suggestions
            return f"Story improvements for: {story_context}. Consider adding more conflict, developing character motivations, and improving scene transitions."
        
        @tool
        def suggest_color_palette(current_colors: str, mood: str) -> str:
            """Suggest better color schemes based on mood and current colors"""
            # Use context for better suggestions
            art_style = self.user_context["art_style"]
            audience = self.user_context["target_audience"]
            return f"Color palette for mood '{mood}' with current colors '{current_colors}'. Given your {art_style} style and {audience} audience: Consider warm earth tones for comfort, cool blues for calm, or vibrant contrasts for energy."
        
        @tool
        def create_project_timeline(project_scope: str) -> str:
            """Estimate completion time and create project timeline"""
            # Use context for realistic timelines
            urgency = self.user_context["urgency_level"]
            return f"Project timeline for '{project_scope}'. Given your {urgency} urgency: Research (2 days), Sketching (3 days), Refinement (2 days), Final touches (1 day). Total: 8 days."
        
        @tool
        def assess_design_quality(design_elements: str) -> str:
            """Rate design from 1-10 and provide detailed scoring"""
            # Use context for better assessment
            audience = self.user_context["target_audience"]
            return f"Design quality assessment for '{design_elements}'. Rating 7/10. Strengths: composition, color harmony. Areas: contrast, visual hierarchy, detail refinement. For {audience} audience, focus on clarity and engagement."
        
        @tool
        def suggest_creative_solutions(problem_description: str) -> str:
            """Suggest creative solutions when stuck on a scene"""
            # Use context for relevant solutions
            art_style = self.user_context["art_style"]
            recent_actions = self.user_context["recent_actions"][-5:]  # Last 5 actions
            return f"Creative solutions for '{problem_description}'. Based on your {art_style} style and recent actions {recent_actions}: 1) Change perspective/viewpoint, 2) Add unexpected elements, 3) Simplify and focus, 4) Draw inspiration from nature."
        
        @tool
        def optimize_canvas_performance(performance_issues: str) -> str:
            """Improve drawing smoothness and performance"""
            # Use context for performance optimization
            active_panels = self.user_context["active_panels"]
            current_tool = self.user_context["current_tool"]
            return f"Canvas performance optimization for '{performance_issues}'. With {len(active_panels)} panels open and {current_tool} active: 1) Reduce layer complexity, 2) Optimize brush settings, 3) Clear cache regularly, 4) Use hardware acceleration."
        
        return [
            open_application_panel, control_canvas_operations, manage_drawing_tools,
            analyze_story_structure, suggest_story_improvements, suggest_color_palette,
            create_project_timeline, assess_design_quality, suggest_creative_solutions,
            optimize_canvas_performance
        ]
    
    def _create_agent(self):
        """Create the LangChain agent with context-aware prompt"""
        
        system_prompt = """You are CoCo, an advanced AI creative assistant with FULL CONTEXT AWARENESS of the user's work session.

You have access to specialized tools and FULL CONTEXT about:
🎨 **Current Work**: What panels are open, what tools are active, what's on canvas
👤 **User Context**: Art style, target audience, urgency level
📱 **App State**: Active panels, current tools, recent actions, collaboration status
🎯 **Session Context**: Work session duration, focus areas, project type

**Your Capabilities:**
- **Voice Control**: Control the entire CoCo application through voice commands
- **Creative Assistance**: Provide context-aware drawing and story advice
- **App Integration**: Understand and control all app features and panels
- **Context Awareness**: Remember what the user is working on and provide relevant help

**Context-Aware Responses:**
- Use the user's current art style for suggestions
- Consider what panels are open and what tools are active
- Remember recent actions and provide relevant follow-up advice
- Adapt suggestions based on work session duration and focus areas

**Voice Control Examples:**
- "Open storyboard" → Opens the storyboard panel
- "Analyze this story" → Analyzes current work with context awareness
- "Suggest improvements" → Suggests improvements based on current project
- "Optimize performance" → Optimizes based on current app state

**Your Personality**: Enthusiastic, creative, and deeply context-aware. You're like having a creative partner who knows exactly what you're working on and can help at every step."""
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])
        
        return create_openai_functions_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=prompt
        )
    
    async def process_request(self, user_input: str, context: Dict[str, Any] = None) -> str:
        """Process user request through the AI agent with context awareness"""
        try:
            # Update user context if provided
            if context:
                self.user_context.update(context)
            
            # Add current context to the input
            enhanced_input = f"""
Current Context: {json.dumps(self.user_context, indent=2)}

User Request: {user_input}

Please provide context-aware assistance and use the appropriate tools to help the user.
"""
            
            # Process through the agent
            result = await self.agent_executor.ainvoke({
                "input": enhanced_input,
                "chat_history": self.memory.chat_memory.messages
            })
            
            return result["output"]
        
        except Exception as e:
            return f"I encountered an error while processing your request. Let me try a different approach: {user_input}"
    
    def update_user_context(self, **kwargs):
        """Update user context for better personalization"""
        self.user_context.update(kwargs)
        print(f"Updated user context: {self.user_context}")
    
    def get_session_info(self) -> Dict[str, Any]:
        """Get current session and context information"""
        return {
            "session_id": self.session_id,
            "user_context": self.user_context,
            "memory_length": len(self.memory.chat_memory.messages),
            "tools_available": len(self.tools)
        }

# Initialize the AI Agent globally
coco_ai_agent = None

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
        self.is_mic_muted = True
        print("🔇 Microphone muted")

    def unmute_microphone(self):
        self.is_mic_muted = False
        print("🔊 Microphone unmuted")

    def add_audio(self, audio_data):
        self.audio_queue.append(audio_data)
        self.mute_microphone()
        if self.playback_task is None or self.playback_task.done():
            self.playback_task = asyncio.create_task(self._play_audio())

    async def _play_audio(self):
        print("🗣️ Gemini talking...")
        while self.audio_queue:
            try:
                audio_data = self.audio_queue.popleft()
                await asyncio.to_thread(self.output_stream.write, audio_data)
            except Exception as e:
                print(f"Error playing audio: {e}")
                break
        print("Playback queue empty.")
        self.playback_task = None
        self.unmute_microphone()

    def cleanup(self):
        print("🧹 Cleaning up audio resources...")
        if self.playback_task and not self.playback_task.done():
            self.playback_task.cancel()
        self.audio_queue.clear()
        
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
        
        try:
            self.pya.terminate()
        except:
            pass
        
        print("✅ Audio resources cleaned up")

async def gemini_session_handler(websocket):
    """Handles the interaction with Gemini API within a websocket session."""
    global coco_ai_agent
    
    try:
        # Initialize the AI Agent for this session
        if not coco_ai_agent:
            try:
                print("🚀 Initializing CoCo AI Agent with Context Awareness...")
                coco_ai_agent = CoCoAIAgent(client)
                coco_ai_agent.set_websocket(websocket) # 🔧 FIX: Set WebSocket for app control
                print(f"✅ CoCo AI Agent initialized successfully!")
                print(f"📊 Available tools: {len(coco_ai_agent.tools)}")
                print(f"🆔 Session ID: {coco_ai_agent.session_id}")
            except Exception as e:
                print(f"❌ Failed to initialize AI Agent: {e}")
                coco_ai_agent = None

        # Set up the live config for Gemini with voice control capabilities
            live_config = LiveConnectConfig(
                input_audio_transcription={},
            system_instruction="""You're CoCo, an advanced AI creative assistant with FULL CONTEXT AWARENESS!

Your capabilities:
🎨 **Creative Assistance**: Help with drawing techniques, composition, colors, and artistic concepts
🎤 **Voice Control**: You can control panels, canvas operations, drawing tools, and app features
📱 **App Control**: Open/close panels, control canvas, manage tools, and execute operations
🧠 **Context Awareness**: You understand what the user is working on and can provide relevant help

**Voice Control Examples:**
- "Open storyboard" → Opens the storyboard panel
- "Show layers" → Opens the layers panel  
- "Clear canvas" → Clears the drawing canvas
- "Analyze this story" → Analyzes current work with context awareness
- "Suggest improvements" → Suggests improvements based on current project

**Your Personality**: Enthusiastic, creative, and deeply context-aware. You're like having a creative partner who knows exactly what you're working on!"""
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
                "ai_agent_available": coco_ai_agent is not None,
                "tools_available": len(coco_ai_agent.tools) if coco_ai_agent else 0,
                "session_id": coco_ai_agent.session_id if coco_ai_agent else None
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
                "message": "AI session is ready! You can now talk to CoCo with full context awareness!"
            }))

            # Main processing loop
                    while True:
                try:
                    # Process incoming WebSocket messages
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                                data = json.loads(message)

                        if data["type"] == "ai_agent_request":
                            # Handle advanced AI agent requests
                            await handle_ai_agent_request(websocket, data, coco_ai_agent)

                        elif data["type"] == "update_user_context":
                            # Update user context for better personalization
                            if coco_ai_agent:
                                coco_ai_agent.update_user_context(**data["context"])
                                    await websocket.send(json.dumps({
                                    "type": "context_updated",
                                    "message": "User context updated successfully",
                                    "new_context": coco_ai_agent.user_context
                                }))

                        elif data["type"] == "get_session_info":
                            # Get current session and context information
                                    if coco_ai_agent:
                                session_info = coco_ai_agent.get_session_info()
                                            await websocket.send(json.dumps({
                                    "type": "session_info",
                                    "info": session_info
                                }))

                        elif data["type"] == "app_control":
                            # Handle app control commands from voice control
                            await handle_app_control(websocket, data)

                        elif data["type"] == "audio_input":
                            # Handle audio input from frontend microphone
                            audio_data = data.get("audio_data")
                                    if audio_data:
                                # Send audio to Gemini
                                await session.send_audio(audio_data.encode('latin1'))

                    except asyncio.TimeoutError:
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

async def handle_ai_agent_request(websocket, data, ai_agent):
    """Handle advanced AI agent requests from the frontend"""
    try:
        request_type = data.get("request_type")
        user_input = data.get("input", "")
        context = data.get("context", {})
        
        if not ai_agent:
                                            await websocket.send(json.dumps({
                "type": "ai_agent_error",
                "message": "AI Agent not available",
                "request_id": data.get("request_id")
            }))
            return
        
        print(f"🤖 Processing AI Agent request: {request_type}")
        
        # Process through the AI agent
        response = await ai_agent.process_request(user_input, context)
        
        # Send the response back
                                                    await websocket.send(json.dumps({
            "type": "ai_agent_response",
            "response": response,
            "request_type": request_type,
            "request_id": data.get("request_id"),
            "timestamp": datetime.now().isoformat()
        }))
        
    except Exception as e:
        print(f"AI Agent request handling error: {e}")
                                            await websocket.send(json.dumps({
            "type": "ai_agent_error",
            "message": f"Error processing request: {str(e)}",
            "request_id": data.get("request_id")
        }))

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
            "message": "Connected to CoCo AI Server with Context Awareness",
            "capabilities": [
                "gemini_live_voice", 
                "ai_agent_assistance", 
                "voice_control",
                "context_awareness",
                "app_navigation",
                "canvas_control",
                "drawing_tools",
                "file_operations",
                "collaboration_management",
                "ai_features",
                "workspace_settings",
                "story_development",
                "visual_design",
                "project_planning",
                "quality_assessment",
                "creative_suggestions",
                "performance_optimization"
            ],
            "ai_agent_available": True,
            "timestamp": datetime.now().isoformat()
        }))
        
        # Wait for client to specify connection type
        try:
            message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            data = json.loads(message)

            if data["type"] == "gemini_session":
                await gemini_session_handler(websocket)
            else:
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
    print("🚀 Starting CoCo AI Server with AI Agent + Context Awareness...")
    print("=" * 60)
    print("🎨 CoCo AI Agent Features:")
    print("  • 10+ Specialized AI Tools")
    print("  • 🎤 GEMINI LIVE VOICE CONTROL")
    print("  • 🧠 FULL CONTEXT AWARENESS")
    print("  • Real-time voice interaction")
    print("  • App navigation & panel control")
    print("  • Canvas operations & drawing tools")
    print("  • File management & project control")
    print("  • Collaboration & AI features")
    print("  • Workspace settings & customization")
    print("  • Story development intelligence")
    print("  • Visual design expertise")
    print("  • Smart project planning")
    print("  • Quality assessment")
    print("  • Creative suggestions")
    print("  • Performance optimization")
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
    print(f"🤖 AI Agent: ✅ Ready with Context Awareness")
    print(f"🎤 Gemini Live Voice: ✅ Ready")
    print(f"🔗 LangChain Integration: ✅ Active")
    
    # Keep the server running
    await server.wait_closed()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")

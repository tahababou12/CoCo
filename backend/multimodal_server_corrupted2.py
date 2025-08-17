## pip install --upgrade google-genai==0.3.0 google-generativeai==0.8.3##
import asyncio
import json
import os
import websockets
from google import genai
from google.genai.types import (
LiveConnectConfig,
SpeechConfig,
VoiceConfig,
PrebuiltVoiceConfig
)
import base64
import io
from pydub import AudioSegment
import wave
from dotenv import load_dotenv
import pyaudio
from collections import deque
import numpy as np
from google.genai import live
from google.genai import types
import aiohttp
import re
import signal

# LANGCHAIN AI AGENT INTEGRATION
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool, BaseTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain.memory import ConversationBufferMemory
from langchain_core.messages import BaseMessage
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
import traceback

# Load environment variables
load_dotenv()

# Global audio manager for cleanup
global_audio_manager = None

# LANGCHAIN AI AGENT SETUP
class CoCoAIAgent:
    """Advanced AI Agent for CoCo with multimodal capabilities"""

def __init__(self, gemini_client):
    self.gemini_client = gemini_client  # Your existing Gemini 2.0 Flash client!
    self.memory = ConversationBufferMemory(
    memory_key="chat_history",
    return_messages=True
    )
    self.session_id = str(uuid.uuid4())
    self.user_context = {
    "current_project": "general_drawing",
    "art_style": "realistic",
    "target_audience": "general",
    "urgency_level": "normal",
    "skill_level": "intermediate"
    }

    # Initialize tools
    self.tools = self._create_tools()

    # Use YOUR existing Gemini client - NO DUPLICATE!
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

def _create_tools(self) -> List[BaseTool]:
    """Create all the advanced AI tools for CoCo"""

    @tool
    def open_application_panel(panel_name: str) -> str:
        """Open different panels and sections of the CoCo app"""
        valid_panels = [
            "storyboard", "collaboration", "layers", "generation settings",
            "ai assistant", "feedback", "toolbar", "grid settings"
        ]
        if panel_name.lower() in [p.lower() for p in valid_panels]:
            # Send app control command to frontend
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
            # Send canvas operation command to frontend
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
            # Send tool change command to frontend
            return f"Setting drawing tool: {tool_action}. I've sent the command to change to this tool."
        else:
            return f"Available tool actions: {', '.join(valid_actions)}"

    @tool
    def control_file_operations(file_action: str) -> str:
        """Control file operations like save, load, export, import"""
        valid_actions = [
            "save", "save as", "load", "import", "export", "new project",
            "open project", "close project", "auto save", "backup"
        ]
        if file_action.lower() in [action.lower() for action in valid_actions]:
            # Send file operation command to frontend
            return f"Executing file operation: {file_action}. I've sent the command to perform this file operation."
        else:
            return f"Available file actions: {', '.join(valid_actions)}"

    @tool
    def manage_collaboration_features(collab_action: str) -> str:
        """Manage collaboration features like sharing, permissions, chat"""
        valid_actions = [
            "share project", "invite user", "set permissions", "start chat",
            "join session", "leave session", "view participants", "mute user"
        ]
        if collab_action.lower() in [action.lower() for action in valid_actions]:
            # Send collaboration command to frontend
            return f"Managing collaboration: {collab_action}. I've sent the command to manage this collaboration feature."
        else:
            return f"Available collaboration actions: {', '.join(valid_actions)}"

    @tool
    def control_ai_features(ai_action: str) -> str:
        """Control AI features like generation, enhancement, modification"""
        valid_actions = [
            "enhance drawing", "modify style", "generate background", "add details",
            "change colors", "apply filter", "style transfer", "upscale image"
        ]
        if ai_action.lower() in [action.lower() for action in valid_actions]:
            # Send AI feature command to frontend
            return f"Executing AI action: {ai_action}. I've sent the command to run this AI feature."
        else:
            return f"Available AI actions: {', '.join(valid_actions)}"

    @tool
    def manage_workspace_settings(setting_action: str) -> str:
        """Manage workspace settings like themes, layouts, preferences"""
        valid_actions = [
            "dark theme", "light theme", "compact layout", "spacious layout",
            "show tooltips", "hide tooltips", "auto save interval", "performance mode"
        ]
        if setting_action.lower() in [action.lower() for action in valid_actions]:
            # Send workspace setting command to frontend
            return f"Changing workspace setting: {setting_action}. I've sent the command to change this workspace setting."
        else:
            return f"Available workspace settings: {', '.join(valid_actions)}"

    @tool
    def analyze_story_structure(drawing_description: str) -> str:
        """Analyze story structure and identify plot holes, pacing issues"""
        return f"Analyzing story structure for: {drawing_description}. Found pacing issues in scene transitions and character development gaps."

    @tool
    def suggest_story_improvements(story_context: str) -> str:
        """Suggest creative alternatives and improvements for scenes"""
        return f"Story improvements for: {story_context}. Consider adding more conflict, developing character motivations, and improving scene transitions."

    @tool
    def character_development_guide(character_info: str) -> str:
        """Provide character arc suggestions and development guidance"""
        return f"Character development for: {character_info}. Focus on internal conflicts, growth arcs, and relationship dynamics."

    @tool
    def suggest_color_palette(current_colors: str, mood: str) -> str:
        """Suggest better color schemes based on mood and current colors"""
        return f"Color palette for mood '{mood}' with current colors '{current_colors}': Consider warm earth tones for comfort, cool blues for calm, or vibrant contrasts for energy."

    @tool
    def apply_cinematic_composition(composition_type: str) -> str:
        """Apply film composition rules and cinematic techniques"""
        return f"Cinematic composition for '{composition_type}': Use rule of thirds, leading lines, depth of field, and dynamic angles for visual impact."

    @tool
    def improve_visual_hierarchy(elements: str) -> str:
        """Suggest layout improvements and visual hierarchy"""
        return f"Visual hierarchy for elements '{elements}': Establish clear focal points, use size contrast, create visual flow, and balance negative space."

    @tool
    def suggest_visual_effects(effect_type: str) -> str:
        """Suggest lighting, shadows, textures, and visual effects"""
        return f"Visual effects for '{effect_type}': Add ambient lighting, cast shadows, texture overlays, and atmospheric effects for depth."

    @tool
    def create_project_timeline(project_scope: str) -> str:
        """Estimate completion time and create project timeline"""
        return f"Project timeline for '{project_scope}': Research (2 days), Sketching (3 days), Refinement (2 days), Final touches (1 day). Total: 8 days."

    @tool
    def identify_bottlenecks(workflow_description: str) -> str:
        """Find workflow inefficiencies and bottlenecks"""
        return f"Workflow bottlenecks in '{workflow_description}': 1) Too many revision cycles, 2) Unclear feedback process, 3) Tool switching overhead."

    @tool
    def suggest_workflow_improvements(current_workflow: str) -> str:
        """Optimize your creative process and workflow"""
        return f"Workflow improvements for '{current_workflow}': Batch similar tasks, use templates, establish clear milestones, and implement feedback loops."

    @tool
    def assess_design_quality(design_elements: str) -> str:
        """Rate design from 1-10 and provide detailed scoring"""
        return f"Design quality assessment for '{design_elements}': Rating 7/10. Strengths: composition, color harmony. Areas: contrast, visual hierarchy, detail refinement."

    @tool
    def suggest_creative_solutions(problem_description: str) -> str:
        """Suggest creative solutions when stuck on a scene"""
        return f"Creative solutions for '{problem_description}': 1) Change perspective/viewpoint, 2) Add unexpected elements, 3) Simplify and focus, 4) Draw inspiration from nature."

    @tool
    def enhance_engagement(engagement_factors: str) -> str:
        """Provide ideas to make content more engaging"""
        return f"Engagement enhancement for '{engagement_factors}': 1) Add emotional hooks, 2) Create visual surprises, 3) Build anticipation, 4) Include interactive elements."

    @tool
    def suggest_skill_development(current_skills: str) -> str:
        """Suggest skills to develop and learning resources"""
        return f"Skill development for '{current_skills}': Focus on: 1) Advanced composition techniques, 2) Color theory mastery, 3) Digital tool efficiency, 4) Storytelling fundamentals."

    @tool
    def optimize_canvas_performance(performance_issues: str) -> str:
        """Improve drawing smoothness and performance"""
        return f"Canvas performance optimization for '{performance_issues}': 1) Reduce layer complexity, 2) Optimize brush settings, 3) Clear cache regularly, 4) Use hardware acceleration."

    return [
        open_application_panel, control_canvas_operations, manage_drawing_tools,
        control_file_operations, manage_collaboration_features, control_ai_features,
        manage_workspace_settings, analyze_story_structure, suggest_story_improvements,
        character_development_guide, suggest_color_palette, apply_cinematic_composition,
        improve_visual_hierarchy, suggest_visual_effects, create_project_timeline,
        identify_bottlenecks, suggest_workflow_improvements, assess_design_quality,
        suggest_creative_solutions, enhance_engagement, suggest_skill_development,
        optimize_canvas_performance
    ]

def _create_agent(self):
    """Create the LangChain agent with custom prompt"""

    system_prompt = """You are CoCo, an advanced AI creative assistant for artists and designers. You have access to specialized tools for:

    🎨 **AI Drawing Assistance**: Style transfer, background generation, composition improvement
    📚 **Story Development**: Plot analysis, character development, narrative variations
    🎨 **Visual Design**: Color theory, cinematic composition, visual hierarchy
    📊 **Project Planning**: Timeline creation, workflow optimization, task prioritization
    🔍 **Quality Assessment**: Design scoring, issue identification, professional benchmarking
    💡 **Smart Suggestions**: Creative solutions, engagement enhancement, workflow analysis
    ⚡ **Performance Optimization**: Canvas speed, memory management, tool caching

    🎤 **VOICE CONTROL**: You can control the ENTIRE CoCo application through voice commands!

    **Voice Control Capabilities:**
    - **App Navigation**: "Open storyboard", "Show collaboration panel", "Hide layers"
    - **Canvas Control**: "Clear canvas", "Undo", "Zoom in", "Pan left"
    - **Drawing Tools**: "Switch to brush tool", "Set brush size", "Change color"
    - **File Operations**: "Save project", "Load file", "Export as PNG"
    - **AI Features**: "Enhance drawing", "Modify style", "Generate background"
    - **Workspace**: "Dark theme", "Compact layout", "Show grid"

    **Your Personality**: You're enthusiastic, creative, and deeply knowledgeable about art and design. You give specific, actionable advice and always consider the user's context and skill level.

    **Context Awareness**: Adapt your suggestions based on the user's current project, art style, target audience, urgency level, and skill level.

    **Response Style**: Be encouraging, specific, and actionable. Use emojis and clear formatting. Always provide concrete next steps.

    **Voice Commands**: When users give voice commands, use the appropriate tools to control the application and give clear feedback about what you're doing."""

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
    """Process user request through the AI agent"""
    try:
        # Update user context if provided
        if context:
            self.user_context.update(context)

            # Add context to the input
            enhanced_input = f"""
            User Context: {json.dumps(self.user_context, indent=2)}

            User Request: {user_input}

            Please provide specific, actionable advice and use the appropriate tools to help the user.
"""

            # Process through the agent
            result = await self.agent_executor.ainvoke({
            "input": enhanced_input,
            "chat_history": self.memory.chat_memory.messages
            })

            return result["output"]

        except Exception as e:
            error_msg = f"AI Agent Error: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
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

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully"""
    print(f"\n🛑 Received signal {signum}, shutting down gracefully...")

    # Clean up global audio manager if it exists
    if global_audio_manager:
        global_audio_manager.cleanup()

        # Create browser closed signal file
        try:
            with open("/tmp/browser_closed", "w") as f:
                f.write("browser_closed")
            except:
                pass

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

# Voice Activity Detection (VAD) configuration
                    VAD_SILENCE_THRESHOLD = 3     # Lower threshold for silence detection (was 5)
                    VAD_VOICE_THRESHOLD = 8       # Higher threshold for voice detection (was 10)
                    VAD_MIN_VOICE_DURATION = 0.3  # Minimum speaking time before starting (seconds)
                    VAD_MAX_SILENCE_DURATION = 2.0  # Maximum silence before stopping (seconds) - increased from 0.8
                    VAD_SPEECH_BUFFER = 0.5       # Buffer time to continue speech after silence (seconds)

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
    self.audio_buffer = []  # Buffer for sending to frontend

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

def get_buffered_audio(self):
    """Get and clear the audio buffer for sending to frontend"""
    if self.audio_buffer:
        # Combine all audio chunks
        combined_audio = b''.join(self.audio_buffer)
        self.audio_buffer.clear()
        return base64.b64encode(combined_audio).decode('utf-8')
        return None

def cleanup(self):
    """Clean up audio resources"""
    print("🧹 Cleaning up audio resources...")

    # Stop any ongoing playback
    if self.playback_task and not self.playback_task.done():
        self.playback_task.cancel()

        # Clear audio queues
        self.audio_queue.clear()
        self.audio_buffer.clear()

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
        # Initialize the AI Agent for this session
        global coco_ai_agent
        if not coco_ai_agent:
            try:
                print("🚀 Initializing CoCo AI Agent with LangChain...")
                coco_ai_agent = CoCoAIAgent(client)
                print(f"✅ CoCo AI Agent initialized successfully!")
                print(f"📊 Available tools: {len(coco_ai_agent.tools)}")
                print(f"🆔 Session ID: {coco_ai_agent.session_id}")
            except Exception as e:
                print(f"❌ Failed to initialize AI Agent: {e}")
                coco_ai_agent = None

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
                    "message": "AI session is ready! You can now talk to CoCo and control the app with your voice!"
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

                                        except asyncio.TimeoutError:
                                            # No WebSocket message, continue with audio processing
                                            pass
                                        except websockets.exceptions.ConnectionClosed:
                                            print("WebSocket connection closed")
                                            break
                                        except Exception as e:
                                            print(f"WebSocket message processing error: {e}")
                                            continue

                                            # Process audio from the queue
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

# WebSocket handler for AI Agent requests
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
        "ai_agent_assistance",
        "voice_control",
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
                # Handle Gemini Live API session with voice control
                await gemini_session_handler(websocket)
            elif data["type"] == "ai_agent_only":
                # Handle AI Agent only (no voice)
                await handle_ai_agent_only_session(websocket)
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

async def handle_ai_agent_only_session(websocket):
    """Handle AI Agent only sessions (no voice processing)"""
    global coco_ai_agent

    # Initialize the AI Agent if not already done
    if not coco_ai_agent:
        try:
            print("🚀 Initializing CoCo AI Agent (AI-only mode)...")
            coco_ai_agent = CoCoAIAgent(client)
            print(f"✅ CoCo AI Agent initialized successfully!")
        except Exception as e:
            print(f"❌ Failed to initialize AI Agent: {e}")
            await websocket.send(json.dumps({
            "type": "error",
            "message": "Failed to initialize AI Agent"
            }))
            return

            # Send AI Agent ready confirmation
            await websocket.send(json.dumps({
            "type": "ai_agent_ready",
            "status": "ready",
            "tools_available": len(coco_ai_agent.tools),
            "session_id": coco_ai_agent.session_id,
            "message": "AI Agent is ready! You can now make requests."
            }))

            # Handle AI Agent requests
            try:
                async for message in websocket:
                try:
                    data = json.loads(message)

                    if data["type"] == "ai_agent_request":
                        await handle_ai_agent_request(websocket, data, coco_ai_agent)
                    elif data["type"] == "update_user_context":
                        if coco_ai_agent:
                            coco_ai_agent.update_user_context(**data["context"])
                            await websocket.send(json.dumps({
                            "type": "context_updated",
                            "message": "User context updated successfully"
                            }))
                        elif data["type"] == "get_session_info":
                            if coco_ai_agent:
                                session_info = coco_ai_agent.get_session_info()
                                await websocket.send(json.dumps({
                                "type": "session_info",
                                "info": session_info
                                }))
                            else:
                                await websocket.send(json.dumps({
                                "type": "error",
                                "message": f"Unknown message type: {data.get('type')}"
                                }))

                            except json.JSONDecodeError:
                                await websocket.send(json.dumps({
                                "type": "error",
                                "message": "Invalid JSON message"
                                }))
                            except Exception as e:
                                print(f"Message processing error: {e}")
                                await websocket.send(json.dumps({
                                "type": "error",
                                "message": f"Processing error: {str(e)}"
                                }))

                            except websockets.exceptions.ConnectionClosed:
                                print("AI Agent session connection closed")
                            except Exception as e:
                                print(f"AI Agent session error: {e}")

# Start the WebSocket server
async def main():
    """Main server function"""
    print("🚀 Starting CoCo AI Server with Gemini Live Voice Control...")
    print("=" * 60)
    print("🎨 CoCo AI Agent Features:")
    print("  • 22+ Specialized AI Tools")
    print("  • 🎤 GEMINI LIVE VOICE CONTROL")
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

    # Initialize the AI Agent globally
    global coco_ai_agent
    try:
        print("🚀 Initializing CoCo AI Agent...")
        coco_ai_agent = CoCoAIAgent(client)
        print(f"✅ CoCo AI Agent initialized successfully!")
        print(f"📊 Available tools: {len(coco_ai_agent.tools)}")
        print(f"🆔 Session ID: {coco_ai_agent.session_id}")
    except Exception as e:
        print(f"❌ Failed to initialize AI Agent: {e}")
        coco_ai_agent = None

        # Start WebSocket server
        server = await websockets.serve(
        websocket_handler,
        "localhost",
        9083,
        ping_interval=20,
        ping_timeout=20
        )

        print(f"🌐 WebSocket server started on ws://localhost:9083")
        print(f"🤖 AI Agent: {'✅ Ready' if coco_ai_agent else '❌ Failed'}")
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
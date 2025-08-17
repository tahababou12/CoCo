#!/usr/bin/env python3
"""
CoCo Multimodal Server with Gemini Live Voice Control
Simple integration that enhances your existing Gemini Live session
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

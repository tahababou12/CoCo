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

# Load environment variables
load_dotenv()

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
SEND_SAMPLE_RATE = 16000  # Sample rate for audio sent to Gemini (Hz)
RECEIVE_SAMPLE_RATE = 24000 # Sample rate for audio received from Gemini (Hz)
CHUNK_SIZE = 512          # Size of audio chunks to process
CHANNELS = 1              # Mono audio

# Voice Activity Detection (VAD) configuration
VAD_SILENCE_THRESHOLD = 15    # Lower threshold for silence detection
VAD_VOICE_THRESHOLD = 30      # Higher threshold for voice detection
VAD_MIN_VOICE_DURATION = 0.5  # Minimum speaking time before starting (seconds)
VAD_MAX_SILENCE_DURATION = 1.0  # Maximum silence before stopping (seconds)

# Voice command patterns for enhancement
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

async def process_user_speech_for_commands(audio_data):
    """Process user speech to detect enhancement commands before sending to Gemini"""
    try:
        # For now, we'll use a simple approach - send the audio to Gemini
        # and then check the response for enhancement commands
        # In a more sophisticated implementation, you could use a separate speech-to-text service
        
        # This is a placeholder - in practice, you might want to use a separate STT service
        # to get the text before sending to Gemini, or handle this differently
        
        return None  # No command detected for now
    except Exception as e:
        print(f"Error processing user speech: {e}")
        return None

async def call_enhancement_api(prompt=""):
    """Call the Flask enhancement API"""
    try:
        async with aiohttp.ClientSession() as session:
            url = "http://localhost:5001/api/enhance-image-voice"
            data = {"prompt": prompt}
            
            async with session.post(url, json=data) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Enhancement API called successfully: {result}")
                    return result
                else:
                    error_text = await response.text()
                    print(f"❌ Enhancement API error: {response.status} - {error_text}")
                    return None
    except Exception as e:
        print(f"❌ Error calling enhancement API: {e}")
        return None

def notify_browser_closed():
    """Notify the main script that browser has closed"""
    print("🚨 BROWSER CLOSED - NOTIFYING MAIN SCRIPT TO SHUTDOWN")
    # Create a file to signal shutdown
    with open("/tmp/browser_closed", "w") as f:
        f.write("browser_closed")
    # Also send SIGTERM to parent process
    os.kill(os.getppid(), signal.SIGTERM)

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

async def gemini_session_handler(websocket):
    """Handles the interaction with Gemini API within a websocket session."""
    max_retries = 3
    retry_count = 0
    session = None
    
    while retry_count < max_retries:
        try:
            config_message = await websocket.recv()
            print(f"Received config message: {config_message}")
            config_data = json.loads(config_message)
            config = config_data.get("setup", {})
            print(f"Setup config: {config}")

            # Configure for audio responses
            live_config = LiveConnectConfig(
                response_modalities=["AUDIO"],  # We want spoken responses
                speech_config=SpeechConfig(
                    voice_config=VoiceConfig(
                        prebuilt_voice_config=PrebuiltVoiceConfig(voice_name="Puck")
                    )
                ),
                system_instruction="""You're a friendly, chill drawing assistant who helps people create art! You can see their canvas and hear their voice in real-time. 

Your role:
- Give encouraging, helpful advice about their drawings
- Suggest ways to improve composition, colors, or technique
- When they ask for help making their drawing better, you can suggest using the 'Enhance with Gemini' feature as one option
- Be casual and supportive, like you're hanging out with a friend who's drawing
- Keep your responses conversational and not too technical

Example responses:
- "Oh that's looking really cool! Maybe try adding some shadows to make it pop more?"
- "I love the colors you're using! If you want to make it even more awesome, you could try the 'Enhance with Gemini' button - it'll add some really cool effects to your drawing."
- "That's a great start! What if you added some more details in the background?"

Just be helpful and encouraging!"""
            )
            
            print(f"Final config for Gemini: {live_config}")

            # Initialize audio manager
            audio_manager = AudioManager(
                input_sample_rate=SEND_SAMPLE_RATE, 
                output_sample_rate=RECEIVE_SAMPLE_RATE
            )
            await audio_manager.initialize()

            # Set up audio queue for processing
            audio_queue = asyncio.Queue()

            async with client.aio.live.connect(model=MODEL, config=live_config) as session:
                print("Connected to Gemini Live API")
                retry_count = 0  # Reset retry count on successful connection

                async def listen_for_audio():
                    """Captures audio from microphone and buffers it"""
                    print("🎤 Starting to listen for audio...")
                    
                    # Voice activity detection variables
                    silence_threshold = VAD_SILENCE_THRESHOLD
                    voice_threshold = VAD_VOICE_THRESHOLD
                    silence_duration = 0    # Track silence duration
                    voice_duration = 0      # Track voice duration
                    is_speaking = False     # Current speaking state
                    min_voice_duration = VAD_MIN_VOICE_DURATION
                    max_silence_duration = VAD_MAX_SILENCE_DURATION
                    
                    while True:
                        data = await asyncio.to_thread(
                            audio_manager.input_stream.read,
                            CHUNK_SIZE,
                            exception_on_overflow=False,
                        )
                        
                        # Only process audio if microphone is not muted
                        if not audio_manager.is_mic_muted:
                            # Calculate audio level
                            audio_level = max(abs(int.from_bytes(data[i:i+2], byteorder='little', signed=True)) 
                                            for i in range(0, len(data), 2))
                            
                            # Voice activity detection logic
                            if audio_level > voice_threshold:
                                # Voice detected
                                voice_duration += CHUNK_SIZE / SEND_SAMPLE_RATE
                                silence_duration = 0
                                
                                if not is_speaking and voice_duration > min_voice_duration:
                                    # Start speaking to Gemini
                                    is_speaking = True
                                    print(f"🎤 Started speaking to Gemini (level: {audio_level})")
                                    # Send status update to frontend
                                    try:
                                        await websocket.send(json.dumps({"voice_status": "listening"}))
                                    except:
                                        pass  # Ignore if websocket is closed
                                
                                if is_speaking:
                                    # Send audio to Gemini
                                    await audio_queue.put(data)
                                    print(f"🎤 Sending audio to Gemini (level: {audio_level})")
                                
                            elif audio_level < silence_threshold:
                                # Silence detected
                                silence_duration += CHUNK_SIZE / SEND_SAMPLE_RATE
                                voice_duration = 0
                                
                                if is_speaking and silence_duration > max_silence_duration:
                                    # Stop speaking to Gemini
                                    is_speaking = False
                                    print(f"🔇 Stopped speaking to Gemini (silence: {silence_duration:.1f}s)")
                                    # Send status update to frontend
                                    try:
                                        await websocket.send(json.dumps({"voice_status": "idle"}))
                                    except:
                                        pass  # Ignore if websocket is closed
                            
                            # Always buffer audio for frontend (for visualization)
                            audio_manager.audio_buffer.append(data)
                        
                        else:
                            # If muted, just read and discard the data to keep the stream active
                            pass

                async def process_and_send_audio():
                    """Sends audio chunks to Gemini"""
                    print("📤 Starting to send audio to Gemini...")
                    while True:
                        try:
                            data = await audio_queue.get()
                            # Use new API with Blob object
                            blob = types.Blob(data=data, mime_type="audio/pcm;rate=24000")
                            await session.send_realtime_input(media=blob)
                            audio_queue.task_done()
                        except websockets.exceptions.ConnectionClosedError as e:
                            print(f"❌ WebSocket connection closed: {e}")
                            break
                        except Exception as e:
                            print(f"❌ Error sending audio to Gemini: {e}")
                            break

                async def send_text_to_gemini(text):
                    """Send text input to Gemini to get both text and audio responses"""
                    try:
                        text_blob = types.Blob(data=text.encode('utf-8'), mime_type="text/plain")
                        await session.send_realtime_input(media=text_blob)
                        print(f"📝 Sent text to Gemini: {text}")
                    except Exception as e:
                        print(f"❌ Error sending text to Gemini: {e}")

                async def handle_frontend_messages():
                    """Handles messages from frontend (canvas + buffered audio)"""
                    try:
                        async for message in websocket:
                            try:
                                data = json.loads(message)
                                print(f"Received message from client: {list(data.keys())}")
                                
                                if "get_audio" in data:
                                    # Frontend is requesting buffered audio
                                    audio_data = audio_manager.get_buffered_audio()
                                    if audio_data:
                                        await websocket.send(json.dumps({
                                            "audio_data": audio_data
                                        }))
                                        print("📤 Sent buffered audio to frontend")
                                    
                                elif "realtime_input" in data:
                                    # Frontend is sending canvas + audio
                                    print(f"Processing realtime_input with {len(data['realtime_input']['media_chunks'])} chunks")
                                    
                                    for i, chunk in enumerate(data["realtime_input"]["media_chunks"]):
                                        print(f"Processing chunk {i}: mime_type={chunk['mime_type']}, data_length={len(chunk['data'])}")
                                        
                                        if chunk["mime_type"] == "image/jpeg":
                                            # Decode base64 image data before sending to Gemini
                                            image_data = base64.b64decode(chunk["data"])
                                            print(f"Sending image to Gemini: {len(image_data)} bytes")
                                            # Use new API with Blob object
                                            blob = types.Blob(data=image_data, mime_type="image/jpeg")
                                            await session.send_realtime_input(media=blob)
                                            print(f"Image sent successfully to Gemini")
                                            
                            except Exception as e:
                                print(f"Error handling frontend message: {e}")
                                import traceback
                                traceback.print_exc()
                    except Exception as e:
                        print(f"Error in frontend message handler: {e}")
                    finally:
                        print("Frontend message handler closed")

                async def receive_from_gemini():
                    """Receives responses from the Gemini API and forwards them to the client."""
                    try:
                        while True:
                            try:
                                print("receiving from gemini")
                                async for response in session.receive():
                                    if response.server_content is None:
                                        print(f'Unhandled server message! - {response}')
                                        continue

                                    model_turn = response.server_content.model_turn
                                    if model_turn:
                                        for part in model_turn.parts:
                                            if hasattr(part, 'text') and part.text is not None:
                                                text_content = part.text
                                                print(f"📝 Received text from Gemini: {text_content}")
                                                
                                                # Check if this is an enhancement command
                                                if is_enhance_command(text_content):
                                                    print(f"🎯 Enhancement command detected: {text_content}")
                                                    
                                                    # Call the enhancement API first
                                                    enhancement_result = await call_enhancement_api(text_content)
                                                    
                                                    # Send confirmation through Gemini so it gets spoken
                                                    if enhancement_result:
                                                        confirmation_text = "I'll enhance your drawing with Gemini AI now! Enhancement started successfully."
                                                    else:
                                                        confirmation_text = "Sorry, I couldn't start the enhancement. Please try again."
                                                    
                                                    # Send the confirmation text to Gemini to get it spoken
                                                    await send_text_to_gemini(confirmation_text)
                                                    
                                                    # Also send to frontend for immediate display
                                                    await websocket.send(json.dumps({
                                                        "text": confirmation_text,
                                                        "command_detected": "enhance",
                                                        "enhancement_started": bool(enhancement_result),
                                                        "enhancement_error": not bool(enhancement_result),
                                                        "request_id": enhancement_result.get("requestId") if enhancement_result else None
                                                    }))
                                                else:
                                                    # Regular text response - send to frontend
                                                    await websocket.send(json.dumps({"text": text_content}))
                                                    
                                            elif hasattr(part, 'inline_data') and part.inline_data is not None:
                                                print("audio mime_type:", part.inline_data.mime_type)
                                                base64_audio = base64.b64encode(part.inline_data.data).decode('utf-8')
                                                
                                                await websocket.send(json.dumps({"audio": base64_audio}))
                                                
                                                # Play the audio through speakers
                                                audio_manager.add_audio(part.inline_data.data)
                                                print("audio received and queued for playback")

                                    if response.server_content.turn_complete:
                                        print('\n<Turn complete>')
                                        
                            except websockets.exceptions.ConnectionClosedOK:
                                print("Client connection closed normally (receive)")
                                break
                            except websockets.exceptions.ConnectionClosedError as e:
                                print(f"❌ WebSocket connection closed with error: {e}")
                                break
                            except Exception as e:
                                print(f"Error receiving from Gemini: {e}")
                                break 

                    except Exception as e:
                          print(f"Error receiving from Gemini: {e}")
                    finally:
                          print("Gemini connection closed (receive)")

                # Start all tasks
                async with asyncio.TaskGroup() as tg:
                    tg.create_task(listen_for_audio())
                    tg.create_task(process_and_send_audio())
                    tg.create_task(handle_frontend_messages())
                    tg.create_task(receive_from_gemini())

        except websockets.exceptions.ConnectionClosedError as e:
            print(f"❌ WebSocket connection error: {e}")
            retry_count += 1
            if retry_count < max_retries:
                print(f"🔄 Retrying connection... (attempt {retry_count}/{max_retries})")
                await asyncio.sleep(2)  # Wait before retrying
                continue
            else:
                print("❌ Max retries reached. Giving up.")
                break
        except Exception as e:
            print(f"Error in Gemini session: {e}")
            import traceback
            traceback.print_exc()
            retry_count += 1
            if retry_count < max_retries:
                print(f"🔄 Retrying connection... (attempt {retry_count}/{max_retries})")
                await asyncio.sleep(2)  # Wait before retrying
                continue
            else:
                print("❌ Max retries reached. Giving up.")
                break
        finally:
            print("Gemini session closed.")
            break

def convert_pcm_to_mp3(pcm_data):
    """Converts PCM audio to base64 encoded MP3."""
    try:
        # Create a WAV in memory first
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)  # mono
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(24000)  # 24kHz
            wav_file.writeframes(pcm_data)
        
        # Reset buffer position
        wav_buffer.seek(0)
        
        # Convert WAV to MP3
        audio_segment = AudioSegment.from_wav(wav_buffer)
        
        # Export as MP3
        mp3_buffer = io.BytesIO()
        audio_segment.export(mp3_buffer, format="mp3", codec="libmp3lame")
        
        # Convert to base64
        mp3_base64 = base64.b64encode(mp3_buffer.getvalue()).decode('utf-8')
        return mp3_base64
        
    except Exception as e:
        print(f"Error converting PCM to MP3: {e}")
        return None

async def main() -> None:
    print("Starting multimodal server...")
    
    # Correct WebSocket handler signature - only takes websocket
    async def websocket_handler(websocket):
        print(f"New WebSocket connection from {websocket.remote_address}")
        try:
            await gemini_session_handler(websocket)
        except websockets.exceptions.ConnectionClosedOK:
            print(f"✅ WebSocket connection closed normally from {websocket.remote_address}")
            notify_browser_closed()
        except websockets.exceptions.ConnectionClosedError as e:
            print(f"❌ WebSocket connection closed with error from {websocket.remote_address}: {e}")
            notify_browser_closed()
        except Exception as e:
            print(f"❌ Unexpected error in WebSocket handler: {e}")
            notify_browser_closed()
        finally:
            print(f"🧹 Cleaning up connection for {websocket.remote_address}")
            # Ensure any remaining tasks are cancelled
            for task in asyncio.all_tasks():
                if task is not asyncio.current_task():
                    task.cancel()
    
    # Start the server
    server = await websockets.serve(websocket_handler, "localhost", 9083)
    
    print("Running websocket server localhost:9083...")
    print("Server is ready to accept connections!")
    
    # Keep running
    await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down multimodal server...")
    except Exception as e:
        print(f"Error running multimodal server: {e}") 
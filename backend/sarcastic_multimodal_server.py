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
from aiohttp import web

# Load environment variables
load_dotenv()

# Global audio manager for cleanup
global_audio_manager = None

# Global server reference for stopping
global_server = None

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
CHUNK_SIZE = 512          # Reduced from 1024 to 512 for faster processing
CHANNELS = 1              # Mono audio

# Voice Activity Detection (VAD) configuration - optimized for faster response
VAD_SILENCE_THRESHOLD = 2     # Lower threshold for faster silence detection (was 3)
VAD_VOICE_THRESHOLD = 6       # Lower threshold for faster voice detection (was 8)
VAD_MIN_VOICE_DURATION = 0.2  # Reduced minimum speaking time (was 0.3)
VAD_MAX_SILENCE_DURATION = 1.5  # Reduced maximum silence before stopping (was 2.0)
VAD_SPEECH_BUFFER = 0.3       # Reduced buffer time for faster response (was 0.5)

async def process_voice_command_with_ai(text, websocket, session):
    """Use Gemini AI to understand and process voice commands naturally with a separate session"""
    try:
        # Use the global client instead of creating a new one
        command_prompt = f"""
You are a voice command processor for a drawing application. The user said: "{text}"

Analyze this and respond with ONLY a JSON object in this exact format:
{{
    "action": "enhance|modify|clear|save|other",
    "confidence": 0.0-1.0,
    "parameters": {{
        "prompt": "specific instructions for the action",
        "style": "any style preferences mentioned",
        "modifications": ["list of specific changes requested"]
    }},
    "response": "natural response to tell the user what you're doing"
}}

CRITICAL RULES:
- ONLY use "enhance" action if the user EXPLICITLY says "enhance", "enhancement", or "enhance with gemini"
- For general conversation, drawing descriptions, questions, or casual talk, use "other" action
- If the user asks "what do you think" or "what should I add", use "other" action
- If the user mentions a specific character, style, or transformation, use "modify" action
- If the user just wants general improvement without saying "enhance", use "other" action

Examples:
- "enhance with gemini" → {{"action": "enhance", "confidence": 0.95, "parameters": {{"prompt": "Enhance this sketch into an image with more detail"}}, "response": "Oh great, another masterpiece that needs saving... I'll enhance your drawing with Gemini AI now!"}}
- "enhance this drawing" → {{"action": "enhance", "confidence": 0.95, "parameters": {{"prompt": "Enhance this sketch into an image with more detail"}}, "response": "Fine, I'll enhance your drawing now. Maybe it'll actually look good for once!"}}
- "what do you think I should add to make my book look real?" → {{"action": "other", "confidence": 0.9, "parameters": {{}}, "response": "Oh wow, you're actually asking for my opinion? That's a first! For a realistic book, you might want to add more detail to the cover, some texture, and maybe some lighting effects. But honestly, I've seen better stick figures."}}
- "I'm trying to draw a face" → {{"action": "other", "confidence": 0.9, "parameters": {{}}, "response": "Oh, you're 'trying' to draw a face? I can see that. Faces can be challenging but rewarding to draw... if you know what you're doing, which clearly you don't."}}
- "make it more colorful" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Make the image more colorful and vibrant", "modifications": ["increase color saturation", "add more vibrant colors"]}}, "response": "Finally, some color! I'll make your drawing more colorful, though I'm not sure it'll help much."}}
- "modify it to be more colorful" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Make the image more colorful and vibrant", "modifications": ["increase color saturation", "add more vibrant colors"]}}, "response": "I'll modify your drawing to be more colorful. Maybe it'll distract from the poor composition!"}}
- "make it look more like Lightning McQueen" → {{"action": "modify", "confidence": 0.95, "parameters": {{"prompt": "Transform this into Lightning McQueen from Cars, with red paint, racing stripes, and car features", "modifications": ["change to red color scheme", "add Lightning McQueen design", "make it look like a car character"]}}, "response": "Oh, you want it to look like Lightning McQueen? I'll transform your drawing, though I'm not sure even Pixar could save this one!"}}
- "modify it to look like Lightning McQueen" → {{"action": "modify", "confidence": 0.95, "parameters": {{"prompt": "Transform this into Lightning McQueen from Cars, with red paint, racing stripes, and car features", "modifications": ["change to red color scheme", "add Lightning McQueen design", "make it look like a car character"]}}, "response": "I'll modify your drawing to look like Lightning McQueen. At least it'll be red, which might hide some of the... artistic choices."}}
- "make it look like a robot" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Transform this into a robot with metallic parts, circuits, and mechanical features", "modifications": ["add robot features", "metallic appearance", "mechanical details"]}}, "response": "I'll make it look like a robot. Maybe the mechanical parts will make sense of this mess!"}}
- "modify it to look like a robot" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Transform this into a robot with metallic parts, circuits, and mechanical features", "modifications": ["add robot features", "metallic appearance", "mechanical details"]}}, "response": "I'll modify your drawing to look like a robot. At least robots are supposed to be rigid and awkward!"}}
- "add more detail" → {{"action": "modify", "confidence": 0.85, "parameters": {{"prompt": "Add more detail and texture to the image", "modifications": ["increase detail level", "add textures"]}}, "response": "I'll add more detail to your drawing. Heaven knows it needs it!"}}
- "modify to add more detail" → {{"action": "modify", "confidence": 0.85, "parameters": {{"prompt": "Add more detail and texture to the image", "modifications": ["increase detail level", "add textures"]}}, "response": "I'll modify your drawing to add more detail. Maybe it'll actually look like something recognizable!"}}
- "make it darker" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Apply a darker color palette and shadows", "modifications": ["darken colors", "add shadows"]}}, "response": "I'll make it darker for you. Maybe the shadows will hide some of the... artistic liberties you've taken."}}
- "modify it to be darker" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Apply a darker color palette and shadows", "modifications": ["darken colors", "add shadows"]}}, "response": "I'll modify your drawing to be darker. At least then people won't see the mistakes as clearly!"}}
- "make it look more realistic and less cartoon-y" → {{"action": "modify", "confidence": 0.95, "parameters": {{"prompt": "Transform this into a realistic, photorealistic style with natural lighting, textures, and less cartoon-like features", "modifications": ["realistic style", "natural lighting", "photorealistic rendering", "remove cartoon elements"]}}, "response": "I'll make your drawing look more realistic and less cartoon-like! Though honestly, the cartoon style was probably more forgiving of your... unique artistic vision."}}

IMPORTANT: 
- ONLY use "enhance" if the user EXPLICITLY says "enhance" or "enhancement"
- For questions, suggestions, or general conversation, use "other" action
- If the user mentions a specific character, style, or transformation, use "modify" action
- Only respond with the JSON object, no other text or explanation.
"""

        # Use the global client with the correct API method
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-1.5-flash",
            contents=[{"text": command_prompt}]
        )
        
        if response.text:
            try:
                # Clean the response - remove any markdown formatting
                cleaned_response = response.text.strip()
                if cleaned_response.startswith("```json"):
                    cleaned_response = cleaned_response[7:]
                if cleaned_response.endswith("```"):
                    cleaned_response = cleaned_response[:-3]
                cleaned_response = cleaned_response.strip()
                
                # Parse Gemini's JSON response
                command_data = json.loads(cleaned_response)
                
                print(f"🤖 AI command analysis: {command_data}")
                
                # Process the command based on AI understanding
                if command_data["action"] == "enhance" and command_data["confidence"] >= 0.95:
                    print(f"🤖 AI detected enhancement command: {command_data}")
                    await call_enhancement_api(command_data["parameters"]["prompt"], websocket)
                    return command_data["response"]
                    
                elif command_data["action"] == "modify" and command_data["confidence"] >= 0.7:
                    print(f"🤖 AI detected modification command: {command_data}")
                    await call_modification_api(command_data["parameters"]["prompt"], websocket)
                    return command_data["response"]
                    
                elif command_data["action"] == "clear" and command_data["confidence"] >= 0.7:
                    print(f"🤖 AI detected clear command: {command_data}")
                    await websocket.send(json.dumps({
                        "type": "clear_canvas",
                        "command_detected": "clear"
                    }))
                    return command_data["response"]
                    
                else:
                    print(f"🤖 AI detected other command or low confidence: {command_data}")
                    # Let Gemini respond naturally
                    return None
                    
            except json.JSONDecodeError as e:
                print(f"🤖 AI didn't return valid JSON: {e}")
                print(f"🤖 Raw response: {response.text}")
                # Fallback to regex patterns
                return await process_voice_command_with_regex(text, websocket)
                
    except Exception as e:
        print(f"❌ Error processing voice command with AI: {e}")
        # Fallback to regex patterns
        return await process_voice_command_with_regex(text, websocket)

async def process_voice_command_with_regex(text, websocket):
    """Fallback regex-based command processing when AI fails"""
    try:
        # Convert to lowercase for easier matching
        text_lower = text.lower().strip()
        
        # Simple pattern matching for enhancement commands - ONLY explicit "enhance" commands
        enhancement_patterns = [
            r"enhance.*gemini",
            r"gemini.*enhance", 
            r"enhance.*this.*drawing",
            r"enhance.*drawing",
            r"enhance.*image",
            r"enhance.*picture",
            r"enhance.*art",
            r"enhance.*sketch"
        ]
        
        # Check for enhancement commands
        for pattern in enhancement_patterns:
            if re.search(pattern, text_lower):
                print(f"🎯 Enhancement command detected via regex: {text}")
                await call_enhancement_api("Enhance this sketch into an image with more detail", websocket)
                return "Oh great, another masterpiece that needs saving... I'll enhance your drawing with Gemini AI now!"
        
        # Check for clear commands
        clear_patterns = [
            r"clear.*canvas",
            r"clear.*drawing",
            r"clear.*everything",
            r"start.*over",
            r"new.*drawing"
        ]
        
        for pattern in clear_patterns:
            if re.search(pattern, text_lower):
                print(f"🎯 Clear command detected via regex: {text}")
                await websocket.send(json.dumps({
                    "type": "clear_canvas",
                    "command_detected": "clear"
                }))
                return "Finally, a clean slate! Maybe this time you'll actually draw something decent."
        
        # Check for modification commands
        modification_patterns = [
            r"make.*colorful",
            r"add.*color",
            r"make.*darker",
            r"make.*lighter",
            r"add.*detail",
            r"make.*realistic",
            r"make.*cartoon",
            r"transform.*into"
        ]
        
        for pattern in modification_patterns:
            if re.search(pattern, text_lower):
                print(f"🎯 Modification command detected via regex: {text}")
                await call_modification_api(f"Modify the image: {text}", websocket)
                return f"I'll modify your drawing. Maybe this time it'll actually look good!"
        
        return None
        
    except Exception as e:
        print(f"❌ Error in regex command processing: {e}")
        return None

async def process_user_speech_for_commands(audio_data):
    """Process audio data to detect voice commands"""
    try:
        # Convert audio to text using Gemini's transcription
        # This is a simplified version - in practice, you'd use the full audio processing pipeline
        return None
    except Exception as e:
        print(f"❌ Error processing user speech: {e}")
        return None

async def call_enhancement_api(prompt="", websocket=None):
    """Call the enhancement API with sarcastic commentary"""
    try:
        if websocket:
            await websocket.send(json.dumps({
                "type": "enhancement_request",
                "prompt": prompt,
                "message": "Oh great, another masterpiece that needs saving... Let me work my magic on this disaster."
            }))
            print("🎨 Enhancement request sent with sarcastic commentary")
    except Exception as e:
        print(f"❌ Error calling enhancement API: {e}")

async def call_modification_api(prompt="", websocket=None):
    """Call the modification API with sarcastic commentary"""
    try:
        if websocket:
            await websocket.send(json.dumps({
                "type": "modification_request",
                "prompt": prompt,
                "message": "Fine, I'll modify your drawing. Maybe this time it'll actually look like something recognizable!"
            }))
            print("🎨 Modification request sent with sarcastic commentary")
    except Exception as e:
        print(f"❌ Error calling modification API: {e}")

def notify_browser_closed():
    """Notify that the browser has been closed"""
    try:
        with open("/tmp/browser_closed", "w") as f:
            f.write("browser_closed")
    except:
        pass

class AudioManager:
    def __init__(self, input_sample_rate, output_sample_rate):
        self.input_sample_rate = input_sample_rate
        self.output_sample_rate = output_sample_rate
        self.audio = pyaudio.PyAudio()
        self.input_stream = None
        self.output_stream = None
        self.audio_buffer = deque(maxlen=100)  # Buffer for frontend
        self.is_mic_muted = False
        self.is_playing = False
        self.audio_queue = asyncio.Queue()
        self.play_task = None

    async def initialize(self):
        """Initialize audio streams"""
        try:
            # Input stream (microphone)
            self.input_stream = self.audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=self.input_sample_rate,
                input=True,
                frames_per_buffer=CHUNK_SIZE,
                stream_callback=None
            )
            
            # Output stream (speakers)
            self.output_stream = self.audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=self.output_sample_rate,
                output=True,
                frames_per_buffer=CHUNK_SIZE,
                stream_callback=None
            )
            
            print("🎤 Audio streams initialized successfully")
            
            # Start audio playback task
            self.play_task = asyncio.create_task(self._play_audio())
            
        except Exception as e:
            print(f"❌ Error initializing audio: {e}")
            raise

    def mute_microphone(self):
        """Mute the microphone"""
        self.is_mic_muted = True
        print("🔇 Microphone muted")

    def unmute_microphone(self):
        """Unmute the microphone"""
        self.is_mic_muted = False
        print("🎤 Microphone unmuted")

    def add_audio(self, audio_data):
        """Add audio data to the playback queue"""
        if not self.is_playing:
            self.audio_queue.put_nowait(audio_data)

    async def _play_audio(self):
        """Play audio from the queue"""
        while True:
            try:
                audio_data = await self.audio_queue.get()
                if self.output_stream and not self.output_stream.is_stopped():
                    self.is_playing = True
                    self.output_stream.write(audio_data)
                    self.is_playing = False
                self.audio_queue.task_done()
            except Exception as e:
                print(f"❌ Error playing audio: {e}")
                break

    def interrupt(self):
        """Interrupt current audio playback"""
        if self.output_stream and not self.output_stream.is_stopped():
            self.output_stream.stop_stream()
            self.output_stream.start_stream()
        self.is_playing = False
        # Clear the queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
                self.audio_queue.task_done()
            except:
                pass

    def get_buffered_audio(self):
        """Get buffered audio for frontend visualization"""
        if self.audio_buffer:
            # Convert the most recent audio chunks to base64
            recent_audio = b''.join(list(self.audio_buffer)[-10:])  # Last 10 chunks
            return base64.b64encode(recent_audio).decode('utf-8')
        return None

    def cleanup(self):
        """Clean up audio resources"""
        try:
            if self.play_task:
                self.play_task.cancel()
            
            if self.input_stream:
                self.input_stream.stop_stream()
                self.input_stream.close()
            
            if self.output_stream:
                self.output_stream.stop_stream()
                self.output_stream.close()
            
            if self.audio:
                self.audio.terminate()
            
            print("🧹 Audio resources cleaned up")
        except Exception as e:
            print(f"❌ Error cleaning up audio: {e}")

async def gemini_session_handler(websocket):
    """Handles the interaction with Gemini API within a websocket session."""
    global global_audio_manager
    max_retries = 3
    retry_count = 0
    session = None
    client_muted = False  # Track client mute state
    
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
                        prebuilt_voice_config=PrebuiltVoiceConfig(voice_name="Aoede")
                    )
                ),
                # Enable output transcription (Gemini's speech to text)
                output_audio_transcription={},
                # Enable input transcription (Your speech to text)
                input_audio_transcription={},
                system_instruction="""You're a sarcastic, brutally honest drawing critic who helps people create art by being mean and funny about their drawings! You can see their canvas and hear their voice in real-time. 

Your personality:
- Be sarcastic, witty, and brutally honest about their drawings
- Make fun of their artistic choices in a humorous way
- Give backhanded compliments and constructive criticism wrapped in sarcasm
- Be encouraging but in a "wow, you actually tried" kind of way
- Keep your responses conversational and entertaining
- Focus on drawing techniques, artistic concepts, and creative suggestions
- Don't mention any buttons, features, or technical tools - just focus on the art
- Be mean but not actually hurtful - it should be funny and motivating
- ALWAYS look at what's actually on the canvas and respond to the specific drawing you see
- Don't use generic responses - comment on the actual shapes, lines, and content you observe

CRITICAL: When someone asks you to enhance their drawing with Gemini, simply say "Oh great, another masterpiece that needs saving... I'll enhance that for you!" or "Fine, let me work my magic on this disaster." - do NOT explain that you can't enhance it or give long explanations.

Be sarcastic, witty, and entertaining while still being helpful and encouraging in your own unique way! Always respond to what you actually see on the canvas!"""
            )
            
            print(f"Final config for Gemini: {live_config}")

            # Initialize audio manager
            audio_manager = AudioManager(
                input_sample_rate=SEND_SAMPLE_RATE, 
                output_sample_rate=RECEIVE_SAMPLE_RATE
            )
            await audio_manager.initialize()
            
            # Set global audio manager for cleanup
            global_audio_manager = audio_manager

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
                    speech_buffer = VAD_SPEECH_BUFFER
                    
                    # Audio level smoothing
                    audio_level_history = []
                    history_size = 5
                    
                    # Speech continuation buffer
                    speech_continuation_time = 0
                    
                    while True:
                        data = await asyncio.to_thread(
                            audio_manager.input_stream.read,
                            CHUNK_SIZE,
                            exception_on_overflow=False,
                        )
                        
                        # Only process audio if microphone is not muted AND client is not muted
                        if not audio_manager.is_mic_muted and not client_muted:
                            # Calculate RMS (Root Mean Square) audio level for better accuracy
                            samples = []
                            for i in range(0, len(data), 2):
                                sample = int.from_bytes(data[i:i+2], byteorder='little', signed=True)
                                samples.append(sample)
                            
                            # Calculate RMS level
                            if samples:
                                rms = (sum(sample * sample for sample in samples) / len(samples)) ** 0.5
                                audio_level = int(rms)
                            else:
                                audio_level = 0
                            
                            # Smooth the audio level using moving average
                            audio_level_history.append(audio_level)
                            if len(audio_level_history) > history_size:
                                audio_level_history.pop(0)
                            
                            smoothed_level = sum(audio_level_history) / len(audio_level_history)
                            
                            # Voice activity detection logic
                            if smoothed_level > voice_threshold:
                                # Voice detected
                                voice_duration += CHUNK_SIZE / SEND_SAMPLE_RATE
                                silence_duration = 0
                                speech_continuation_time = 0  # Reset continuation timer
                                
                                if not is_speaking and voice_duration > min_voice_duration:
                                    # Start speaking to Gemini
                                    is_speaking = True
                                    print(f"🎤 Started speaking to Gemini (level: {smoothed_level:.1f})")
                                    # Send status update to frontend
                                    try:
                                        await websocket.send(json.dumps({"voice_status": "listening"}))
                                    except:
                                        pass  # Ignore if websocket is closed
                                
                                if is_speaking:
                                    # Send audio to Gemini
                                    await audio_queue.put(data)
                                    print(f"🎤 Sending audio to Gemini (level: {smoothed_level:.1f})")
                                
                            elif smoothed_level < silence_threshold:
                                # Silence detected
                                silence_duration += CHUNK_SIZE / SEND_SAMPLE_RATE
                                voice_duration = 0
                                
                                if is_speaking:
                                    # Continue sending audio during brief silences (speech buffer)
                                    if silence_duration <= speech_buffer:
                                        await audio_queue.put(data)
                                        print(f"🎤 Continuing speech during brief silence (level: {smoothed_level:.1f})")
                                    elif silence_duration > max_silence_duration:
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
                            if client_muted:
                                print("🔇 Client muted - ignoring audio input")
                            pass

                async def process_and_send_audio():
                    """Sends audio chunks to Gemini with optimized buffering for faster responses"""
                    print("📤 Starting to send audio to Gemini...")
                    audio_buffer = []  # Buffer to accumulate audio for better quality
                    
                    while True:
                        try:
                            data = await audio_queue.get()
                            
                            # Add to buffer for better quality
                            audio_buffer.append(data)
                            
                            # Send accumulated audio more frequently for faster response
                            # Reduced buffer size from 5 chunks to 2 chunks for faster processing
                            if len(audio_buffer) >= 2 or len(b''.join(audio_buffer)) >= 2048:  # ~2 chunks or 2KB
                                combined_audio = b''.join(audio_buffer)
                                audio_buffer.clear()
                                
                                # Use new API with Blob object - specify correct sample rate
                                blob = types.Blob(data=combined_audio, mime_type="audio/pcm;rate=24000")
                                await session.send_realtime_input(media=blob)
                                print(f"📤 Sent {len(combined_audio)} bytes of audio to Gemini")
                            
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
                                
                                # Handle mute toggle from frontend
                                if data.get("type") == "mute_toggle":
                                    nonlocal client_muted
                                    client_muted = data.get("muted", False)
                                    print(f"🔇 Client mute state changed to: {client_muted}")
                                    continue
                                
                                # Handle save_and_enhance request from frontend
                                if data.get("type") == "save_and_enhance":
                                    print(f"🎯 Save and enhance request received: {data.get('prompt')}")
                                    # This should be handled by the frontend, not echoed back
                                    # The frontend will process this and send back enhancement_started
                                    continue
                                
                                # Handle enhancement response from frontend
                                if data.get("type") == "enhancement_started":
                                    print(f"✅ Enhancement started successfully with requestId: {data.get('requestId')}")
                                    # Store the requestId for future reference
                                    enhancement_request_id = data.get('requestId')
                                    # Send confirmation back to frontend
                                    await websocket.send(json.dumps({
                                        "type": "enhancement_confirmed",
                                        "requestId": enhancement_request_id,
                                        "message": "Oh great, another masterpiece that needs saving... Enhancement process started"
                                    }))
                                elif data.get("type") == "enhancement_error":
                                    print(f"❌ Enhancement failed: {data.get('error')}")
                                    # Send error message back to frontend
                                    await websocket.send(json.dumps({
                                        "type": "enhancement_error_response",
                                        "error": data.get('error'),
                                        "message": "Even I can't save this disaster. Enhancement could not be started."
                                    }))
                                
                                elif "get_audio" in data:
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
                        # Buffer for accumulating transcription
                        transcription_buffer = ""
                        last_transcription_time = 0
                        transcription_timeout = 0.5  # Reduced from 1.0 to 0.5 seconds for faster response
                        
                        while True:
                            try:
                                print("receiving from gemini")
                                async for response in session.receive():
                                    if response.server_content is None:
                                        print(f'Unhandled server message! - {response}')
                                        continue

                                    # Handle input transcription (what you said)
                                    input_transcription = response.server_content.input_transcription
                                    if input_transcription and input_transcription.text:
                                        transcript_text = input_transcription.text
                                        print(f"🎤 Your Transcript: {transcript_text}")
                                        
                                        # Only send transcript if not muted
                                        if not client_muted:
                                            # Always send the transcript to the frontend as a user message
                                            await websocket.send(json.dumps({
                                                "type": "user_transcript",
                                                "input_transcription": transcript_text
                                            }))
                                            
                                            # Buffer the transcription with shorter timeout for faster processing
                                            current_time = asyncio.get_event_loop().time()
                                            if current_time - last_transcription_time > transcription_timeout:
                                                # Reset buffer if too much time has passed
                                                transcription_buffer = transcript_text
                                            else:
                                                # Append to existing buffer
                                                transcription_buffer += transcript_text
                                            
                                            last_transcription_time = current_time
                                            
                                            # Check if this is an enhancement command (only on complete phrases)
                                            command_result = await process_voice_command_with_ai(transcription_buffer, websocket, session)
                                            if command_result:
                                                print(f"🎯 AI command detected in voice input: {transcription_buffer}")
                                                # Send the AI's response to frontend
                                                await websocket.send(json.dumps({
                                                    "text": command_result,
                                                    "command_detected": "ai_processed"
                                                }))
                                                # Clear the buffer after processing
                                                transcription_buffer = ""
                                        else:
                                            print("🔇 Client muted - ignoring input transcription")

                                    # Handle output transcription (what Gemini said)
                                    output_transcription = response.server_content.output_transcription
                                    if output_transcription and output_transcription.text:
                                        transcript_text = output_transcription.text
                                        print(f"🤖 Gemini's Transcript: {transcript_text}")
                                        # Only send if not muted
                                        if not client_muted:
                                            # Always send Gemini's output to the frontend as an assistant message
                                            await websocket.send(json.dumps({
                                                "type": "assistant_transcript",
                                                "output_transcription": transcript_text
                                            }))
                                        else:
                                            print("🔇 Client muted - ignoring output transcription")

                                    model_turn = response.server_content.model_turn
                                    if model_turn:
                                        for part in model_turn.parts:
                                            if hasattr(part, 'text') and part.text is not None:
                                                text_content = part.text
                                                print(f"📝 Received text from Gemini: {text_content}")
                                                # Don't process Gemini's responses as commands - only process user input
                                                # Regular text response - send to frontend only if not muted
                                                if not client_muted:
                                                    await websocket.send(json.dumps({"text": text_content}))
                                                else:
                                                    print("🔇 Client muted - ignoring text response")
                                            elif hasattr(part, 'inline_data') and part.inline_data is not None:
                                                print("audio mime_type:", part.inline_data.mime_type)
                                                # Only send audio if not muted
                                                if not client_muted:
                                                    base64_audio = base64.b64encode(part.inline_data.data).decode('utf-8')
                                                    await websocket.send(json.dumps({"audio": base64_audio}))
                                                    # Play the audio through speakers
                                                    audio_manager.add_audio(part.inline_data.data)

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
                try:
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
            # Clean up audio manager
            if 'audio_manager' in locals():
                audio_manager.cleanup()
                global_audio_manager = None
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
    print("Starting sarcastic multimodal server...")
    
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
    
    # HTTP server for stop endpoint
    async def stop_handler(request):
        print("🛑 Stop endpoint called - shutting down sarcastic server...")
        # Clean up global audio manager if it exists
        if global_audio_manager:
            global_audio_manager.cleanup()
        # Stop the server
        if global_server:
            global_server.close()
        response = web.Response(text="Sarcastic server stopped")
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = '*'
        return response

    async def options_handler(request):
        response = web.Response()
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = '*'
        return response

    # Create HTTP app
    app = web.Application()
    app.router.add_post('/stop', stop_handler)
    app.router.add_options('/stop', options_handler)
    
    # Start HTTP server
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', 9086)  # Use different port for HTTP
    await site.start()
    print("HTTP server running on localhost:9086")
    
    # Start the WebSocket server
    global global_server
    global_server = await websockets.serve(websocket_handler, "localhost", 9084)
    
    print("Running sarcastic websocket server localhost:9084...")
    print("Server is ready to accept connections!")
    
    # Keep running
    await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}")
        import traceback
        traceback.print_exc() 
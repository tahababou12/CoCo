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

            async def listen_for_audio():
                """Captures audio from microphone and buffers it"""
                print("🎤 Starting to listen for audio...")
                while True:
                    data = await asyncio.to_thread(
                        audio_manager.input_stream.read,
                        CHUNK_SIZE,
                        exception_on_overflow=False,
                    )
                    
                    # Only process audio if microphone is not muted
                    if not audio_manager.is_mic_muted:
                        # Check if there's actual audio data (not just silence)
                        audio_level = max(abs(int.from_bytes(data[i:i+2], byteorder='little', signed=True)) 
                                        for i in range(0, len(data), 2))
                        if audio_level > 25:  # Threshold for detecting voice
                            print(f"🎤 Audio detected, level: {audio_level}")
                            # Buffer audio for sending to frontend
                            audio_manager.audio_buffer.append(data)
                            # Also send to Gemini directly
                            await audio_queue.put(data)
                    else:
                        # If muted, just read and discard the data to keep the stream active
                        pass

            async def process_and_send_audio():
                """Sends audio chunks to Gemini"""
                print("📤 Starting to send audio to Gemini...")
                while True:
                    data = await audio_queue.get()
                    # Use new API with Blob object
                    blob = types.Blob(data=data, mime_type="audio/pcm;rate=24000")
                    await session.send_realtime_input(media=blob)
                    audio_queue.task_done()

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
                                            await websocket.send(json.dumps({"text": part.text}))
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

    except Exception as e:
        print(f"Error in Gemini session: {e}")
        import traceback
        traceback.print_exc()
    finally:
        print("Gemini session closed.")

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
        await gemini_session_handler(websocket)
    
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
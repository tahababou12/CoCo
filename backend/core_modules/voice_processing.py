"""
Voice Processing Module
Handles all voice-related functionality including VAD, audio processing, and voice commands
"""

import asyncio
import json
import re
import time
from collections import deque
import numpy as np
import pyaudio
import wave
from pydub import AudioSegment
import io

# Audio configuration constants
FORMAT = pyaudio.paInt16
SEND_SAMPLE_RATE = 24000
RECEIVE_SAMPLE_RATE = 24000
CHUNK_SIZE = 512
CHANNELS = 1

# Voice Activity Detection (VAD) configuration
VAD_SILENCE_THRESHOLD = 2
VAD_VOICE_THRESHOLD = 4
VAD_MIN_VOICE_DURATION = 0.1
VAD_MAX_SILENCE_DURATION = 2.0
VAD_SPEECH_BUFFER = 0.5

# Hybrid Command System Configuration
COMMAND_CACHE_SIZE = 100
COMMAND_CACHE_TTL = 3600

# Hybrid Command System - Command Cache
command_cache = {}
command_cache_timestamps = {}
command_cache_hits = 0
command_cache_misses = 0

class AudioManager:
    """
    Manages audio input/output and voice activity detection
    """
    
    def __init__(self):
        self.audio = pyaudio.PyAudio()
        self.stream = None
        self.is_recording = False
        self.audio_buffer = deque(maxlen=int(SEND_SAMPLE_RATE * 2))  # 2 seconds buffer
        self.last_voice_time = 0
        self.voice_start_time = 0
        self.is_speaking = False
        
    def start_stream(self):
        """Start audio input stream"""
        try:
            self.stream = self.audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=SEND_SAMPLE_RATE,
                input=True,
                frames_per_buffer=CHUNK_SIZE
            )
            self.is_recording = True
            print("🎤 Audio stream started")
        except Exception as e:
            print(f"❌ Failed to start audio stream: {e}")
    
    def stop_stream(self):
        """Stop audio input stream"""
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            self.is_recording = False
            print("🎤 Audio stream stopped")
    
    def cleanup(self):
        """Clean up audio resources"""
        self.stop_stream()
        if self.audio:
            self.audio.terminate()
            print("🎤 Audio manager cleaned up")
    
    def detect_voice_activity(self, audio_chunk):
        """Detect voice activity in audio chunk"""
        try:
            # Convert audio chunk to numpy array
            audio_data = np.frombuffer(audio_chunk, dtype=np.int16)
            
            # Calculate RMS (Root Mean Square) for volume detection
            rms = np.sqrt(np.mean(audio_data.astype(np.float32) ** 2))
            
            current_time = time.time()
            
            # Voice activity detection logic
            if rms > VAD_VOICE_THRESHOLD:
                if not self.is_speaking:
                    self.is_speaking = True
                    self.voice_start_time = current_time
                self.last_voice_time = current_time
                return True
            elif rms < VAD_SILENCE_THRESHOLD:
                if self.is_speaking:
                    # Check if silence duration exceeds threshold
                    silence_duration = current_time - self.last_voice_time
                    if silence_duration > VAD_MAX_SILENCE_DURATION:
                        self.is_speaking = False
                        return False
                return False
            else:
                # In between thresholds - maintain current state
                return self.is_speaking
                
        except Exception as e:
            print(f"❌ Error in voice activity detection: {e}")
            return False
    
    def get_audio_buffer(self):
        """Get current audio buffer"""
        return list(self.audio_buffer)

async def process_voice_command_with_ai(text, websocket, session):
    """
    Process voice commands using AI
    """
    try:
        # This would integrate with the AI services for voice command processing
        # For now, return a simple response
        response = f"AI processed voice command: {text}"
        await websocket.send(json.dumps({
            "type": "voice_response",
            "text": response
        }))
        return True
    except Exception as e:
        print(f"❌ Error processing voice command with AI: {e}")
        return False

async def process_voice_command_with_regex(text, websocket):
    """
    Process voice commands using regex patterns
    """
    try:
        # Simple regex-based command processing
        text_lower = text.lower()
        
        # Drawing commands
        if any(pattern in text_lower for pattern in ["draw", "can you draw"]):
            from .drawing_logic import process_drawing_commands
            return await process_drawing_commands(text, websocket)
        
        # App control commands
        if any(pattern in text_lower for pattern in ["stop", "quit", "exit", "close"]):
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "stop"
            }))
            return True
        
        return False
        
    except Exception as e:
        print(f"❌ Error processing voice command with regex: {e}")
        return False

async def process_user_speech_for_commands(audio_data):
    """
    Process user speech to extract commands
    """
    try:
        # This would integrate with speech-to-text and command extraction
        # For now, return a placeholder
        return "placeholder command"
    except Exception as e:
        print(f"❌ Error processing user speech: {e}")
        return None

def get_cache_stats():
    """Get command cache statistics"""
    return {
        "hits": command_cache_hits,
        "misses": command_cache_misses,
        "hit_rate": command_cache_hits / (command_cache_hits + command_cache_misses) if (command_cache_hits + command_cache_misses) > 0 else 0,
        "size": len(command_cache)
    }

def clear_command_cache():
    """Clear the command cache"""
    global command_cache, command_cache_timestamps, command_cache_hits, command_cache_misses
    command_cache.clear()
    command_cache_timestamps.clear()
    command_cache_hits = 0
    command_cache_misses = 0
    print("🗑️ Command cache cleared")

def convert_pcm_to_mp3(pcm_data):
    """
    Convert PCM audio data to MP3 format
    """
    try:
        # Convert PCM to WAV first
        audio = AudioSegment(
            pcm_data,
            frame_rate=SEND_SAMPLE_RATE,
            sample_width=2,  # 16-bit
            channels=CHANNELS
        )
        
        # Convert to MP3
        mp3_data = io.BytesIO()
        audio.export(mp3_data, format="mp3")
        mp3_data.seek(0)
        
        return mp3_data.read()
        
    except Exception as e:
        print(f"❌ Error converting PCM to MP3: {e}")
        return None


#!/usr/bin/env python3
"""
Simple test script to verify Voice Activity Detection (VAD) thresholds
"""

import pyaudio
import numpy as np
import time

# Audio configuration constants
FORMAT = pyaudio.paInt16
SAMPLE_RATE = 16000
CHUNK_SIZE = 512
CHANNELS = 1

# Voice Activity Detection (VAD) configuration
VAD_SILENCE_THRESHOLD = 15    # Lower threshold for silence detection
VAD_VOICE_THRESHOLD = 30      # Higher threshold for voice detection
VAD_MIN_VOICE_DURATION = 0.5  # Minimum speaking time before starting (seconds)
VAD_MAX_SILENCE_DURATION = 1.0  # Maximum silence before stopping (seconds)

def test_vad():
    """Test voice activity detection with microphone input"""
    pya = pyaudio.PyAudio()
    
    try:
        # Get default microphone
        mic_info = pya.get_default_input_device_info()
        print(f"Using microphone: {mic_info['name']}")
        
        # Open audio stream
        stream = pya.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            input=True,
            input_device_index=mic_info["index"],
            frames_per_buffer=CHUNK_SIZE,
        )
        
        print("🎤 Voice Activity Detection Test")
        print("=" * 40)
        print(f"Silence threshold: {VAD_SILENCE_THRESHOLD}")
        print(f"Voice threshold: {VAD_VOICE_THRESHOLD}")
        print(f"Min voice duration: {VAD_MIN_VOICE_DURATION}s")
        print(f"Max silence duration: {VAD_MAX_SILENCE_DURATION}s")
        print("=" * 40)
        print("Speak into your microphone to test...")
        print("Press Ctrl+C to stop")
        print()
        
        # Voice activity detection variables
        silence_duration = 0
        voice_duration = 0
        is_speaking = False
        
        while True:
            # Read audio data
            data = stream.read(CHUNK_SIZE, exception_on_overflow=False)
            
            # Calculate audio level
            audio_level = max(abs(int.from_bytes(data[i:i+2], byteorder='little', signed=True)) 
                            for i in range(0, len(data), 2))
            
            # Voice activity detection logic
            if audio_level > VAD_VOICE_THRESHOLD:
                # Voice detected
                voice_duration += CHUNK_SIZE / SAMPLE_RATE
                silence_duration = 0
                
                if not is_speaking and voice_duration > VAD_MIN_VOICE_DURATION:
                    # Start speaking
                    is_speaking = True
                    print(f"🎤 STARTED SPEAKING (level: {audio_level})")
                
                if is_speaking:
                    print(f"🎤 Speaking... (level: {audio_level})")
                
            elif audio_level < VAD_SILENCE_THRESHOLD:
                # Silence detected
                silence_duration += CHUNK_SIZE / SAMPLE_RATE
                voice_duration = 0
                
                if is_speaking and silence_duration > VAD_MAX_SILENCE_DURATION:
                    # Stop speaking
                    is_speaking = False
                    print(f"🔇 STOPPED SPEAKING (silence: {silence_duration:.1f}s)")
            
            # Show current status
            status = "SPEAKING" if is_speaking else "IDLE"
            print(f"\r[{status}] Level: {audio_level:3d} | Voice: {voice_duration:.1f}s | Silence: {silence_duration:.1f}s", end="", flush=True)
            
            time.sleep(0.1)  # Small delay to make output readable
            
    except KeyboardInterrupt:
        print("\n\nTest stopped by user")
    except Exception as e:
        print(f"\nError: {e}")
    finally:
        if 'stream' in locals():
            stream.stop_stream()
            stream.close()
        pya.terminate()

if __name__ == "__main__":
    test_vad() 
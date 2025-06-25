import asyncio
import os
import wave
from io import BytesIO
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pydub import AudioSegment

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GOOGLE_API_KEY not found in environment variables")

client = genai.Client(api_key=GEMINI_API_KEY, http_options={'api_version': 'v1alpha'})

class MusicGenerator:
    def __init__(self, prompt="minimal techno", duration=30, bpm=120, output_file="generated_music.mp3"):
        self.prompt = prompt
        self.duration = duration
        self.bpm = bpm
        self.output_file = output_file
        
        # Audio configuration
        self.audio_buffer = BytesIO()
        self.sample_rate = 48000
        self.channels = 2
        self.sample_width = 2
        self.generation_complete = False
        
        # Music generation configuration
        self.temperature = 1.0
        self.guidance = 4.0
        self.density = 0.7
        self.brightness = 0.6
    
    async def _receive_audio(self, session):
        """Receive and buffer audio data for specified duration."""
        print(f"Recording for {self.duration} seconds...")
        start_time = asyncio.get_event_loop().time()
        
        try:
            async for message in session.receive():
                if hasattr(message, 'server_content') and hasattr(message.server_content, 'audio_chunks'):
                    for chunk in message.server_content.audio_chunks:
                        if hasattr(chunk, 'data'):
                            self.audio_buffer.write(chunk.data)
                
                elapsed_time = asyncio.get_event_loop().time() - start_time
                if elapsed_time >= self.duration:
                    print("Recording duration reached.")
                    break
                    
        except Exception as e:
            print(f"Audio reception ended: {e}")
        finally:
            self.generation_complete = True

    async def generate(self):
        """Generate music based on current configuration and save to MP3."""
        print(f"Generating music with prompt: '{self.prompt}'")
        print(f"Duration: {self.duration} seconds, BPM: {self.bpm}")
        
        self.audio_buffer = BytesIO()
        self.generation_complete = False
        
        try:
            async with (
                client.aio.live.music.connect(model='models/lyria-realtime-exp') as session,
                asyncio.TaskGroup() as tg,
            ):
                tg.create_task(self._receive_audio(session))
                
                await session.set_weighted_prompts(
                    prompts=[
                        types.WeightedPrompt(text=self.prompt, weight=1.0),
                    ]
                )
                
                await session.set_music_generation_config(
                    config=types.LiveMusicGenerationConfig(
                        bpm=self.bpm,
                        temperature=self.temperature,
                        guidance=self.guidance,
                        density=self.density,
                        brightness=self.brightness
                    )
                )
                
                await session.play()
                print("Music generation started...")
                
                await asyncio.sleep(self.duration + 2)
                
                await session.stop()
                print("Music generation stopped.")
                
        except Exception as e:
            print(f"Error during music generation: {e}")
            return False
        
        return self._save_to_mp3()
    
    def _save_to_mp3(self):
        """Convert raw PCM audio data to MP3 file."""
        try:
            audio_data = self.audio_buffer.getvalue()
            
            if len(audio_data) == 0:
                print("No audio data received!")
                return False
            
            print(f"Received {len(audio_data)} bytes of audio data")
            
            wav_buffer = BytesIO()
            
            with wave.open(wav_buffer, 'wb') as wav_file:
                wav_file.setnchannels(self.channels)
                wav_file.setsampwidth(self.sample_width)
                wav_file.setframerate(self.sample_rate)
                wav_file.writeframes(audio_data)
            
            wav_buffer.seek(0)
            audio_segment = AudioSegment.from_wav(wav_buffer)
            audio_segment.export(self.output_file, format="mp3", bitrate="192k")
            
            print(f"Music successfully saved to: {self.output_file}")
            print(f"Duration: {len(audio_segment) / 1000:.2f} seconds")
            return True
            
        except Exception as e:
            print(f"Error saving audio: {e}")
            return False

# Example usage
async def main():
    generator = MusicGenerator()
    generator.prompt = "intensely spooky music that will shake me to my core"
    generator.duration = 45
    generator.bpm = 140
    generator.output_file = "spooky.mp3"
    
    success = await generator.generate()
    
    if success:
        print("\n✅ Music generation completed successfully!")
    else:
        print("\n❌ Music generation failed!")

if __name__ == "__main__":
    asyncio.run(main())
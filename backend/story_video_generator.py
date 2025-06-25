import os
import cv2
import numpy as np
from PIL import Image
from google import genai
from google.genai import types
from dotenv import load_dotenv
from io import BytesIO
import base64
from elevenlabs.client import ElevenLabs
import moviepy as mp
import json
import time
from pathlib import Path
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

class StoryVideoGenerator:
    def __init__(self, enhanced_dir="enhanced_drawings", output_dir="story_videos"):
        self.enhanced_dir = enhanced_dir
        self.output_dir = output_dir
        self.temp_dir = "temp_processing"
        
        # Create directories
        for directory in [self.output_dir, self.temp_dir]:
            os.makedirs(directory, exist_ok=True)
        
        # Video settings
        self.fps = 30
        self.resolution = (1280, 720)  # HD resolution
        self.transition_duration = 2  # seconds
        self.scene_duration = 5  # seconds per scene
        
        # Initialize Gemini
        if GEMINI_API_KEY:
            self.client = genai.Client(api_key=GEMINI_API_KEY)
        
        # Initialize ElevenLabs
        if ELEVENLABS_API_KEY:
            self.eleven_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        else:
            raise ValueError("ELEVENLABS_API_KEY not set in environment variables")
    
    def get_recent_images(self, image_paths=None):
        """Get images from the provided paths or from the enhanced drawings directory."""
        logging.info(f"get_recent_images called with image_paths: {image_paths}")
        logging.info(f"Type of image_paths: {type(image_paths)}")
        
        if image_paths:
            logging.info(f"Using provided image paths: {image_paths}")
            logging.info(f"Number of provided images: {len(image_paths)}")
            # If paths are provided, use those directly
            return image_paths
        
        logging.warning("No image paths provided, falling back to enhanced directory!")
        # Fallback to getting images from directory if no paths provided
        if not os.path.exists(self.enhanced_dir):
            raise FileNotFoundError(f"Enhanced images directory '{self.enhanced_dir}' not found!")
        
        image_files = [f for f in os.listdir(self.enhanced_dir) 
                      if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        
        # Sort by creation date (newest first)
        image_files.sort(key=lambda x: os.path.getctime(os.path.join(self.enhanced_dir, x)), 
                        reverse=True)
        
        logging.info(f"Found {len(image_files)} images in enhanced directory: {image_files}")
        return [os.path.join(self.enhanced_dir, f) for f in image_files]
    
    def analyze_images(self, image_paths, story_context=None):
        """Use Gemini to analyze images and create a coherent story."""
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not set in environment variables")
        
        logging.info("Starting image analysis with Gemini...")
        
        # First, get detailed descriptions of each image
        image_descriptions = []
        for i, path in enumerate(image_paths):
            logging.info(f"Analyzing image {i+1}/{len(image_paths)}...")
            try:
                # Load image using PIL
                img = Image.open(path)
                
                # Create the prompt for image analysis
                prompt = """Describe this image in a very funny way. Include:
                - What's happening in the scene
                - The main shapes and characters involved
                - Any interesting details or characters
                – Make sure you avoid using very big language. Keep it very simple, a little bit ironic, and humorous!
                Keep it to 2-3 sentences and use very simple, clear language."""
                
                # Generate content using the correct model and API structure
                response = self.client.models.generate_content(
                    model="gemini-2.0-flash",
                    contents=[prompt, img]
                )
                
                description = response.text.strip()
                logging.info(f"Description for image {i+1}: {description}")
                image_descriptions.append(description)
            except Exception as e:
                logging.error(f"Error analyzing image {path}: {e}")
                image_descriptions.append("A mysterious scene unfolds.")
        
        # Now, generate a coherent story connecting all images
        logging.info("Generating coherent story...")
        context_str = story_context or ''
        story_prompt = f"""
        Create a fun and engaging story that connects these {len(image_descriptions)} scenes. Make it exciting and interesting!
        
        Here are some scene descriptions. Use them to create a coherent story script, that is a little bit funny and ironic. Do not use complicated words:
        {chr(10).join(f"Scene {i+1}: {desc}" for i, desc in enumerate(image_descriptions))}
        
        Your response must be a valid JSON object with exactly this structure:
        {{
            "title": "A fun and catchy title",
            "story": "A 1 sentence introduction to the story",
            "scene_narrations": [
                "A 1-2 sentence narration for each scene that describes what's happening and connects to the next scene",
                ...
            ]
        }}
        
        Make each scene narration about 5-7 seconds long when read aloud.
        Use simple words to make it fun and engaging. Make sure the overall story has some general theme. Pick that theme early on and try to stick to it.
        IMPORTANT: Your response must be valid JSON only, with no additional text or markdown formatting.

        Optionally, the user has shared some context about what kind of theme they would want the story to be around. Depending on the amount of detail, make sure the story is inspired by this and relates to the scene descriptions. Here is the context:
        {context_str}
        """

        
        try:
            # Generate story using text-only model
            response = self.client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[story_prompt]
            )
            
            # Clean the response text
            response_text = response.text.strip()
            
            # Remove any markdown code blocks if present
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            
            # Remove any leading/trailing whitespace or characters before the opening brace
            response_text = response_text[response_text.find("{"):response_text.rfind("}")+1]
            
            logging.info("Cleaned response: %s", response_text)
            
            # Parse the response
            story_data = json.loads(response_text)
            logging.info("Generated story: %s", story_data)
            return story_data
        except Exception as e:
            logging.error(f"Error generating story: {e}")
            logging.error("Response text: %s", response.text)
            return {
                "title": "A Story of Imagination",
                "story": "A tale unfolds through these magical scenes.",
                "scene_narrations": ["A magical scene unfolds."] * len(image_descriptions)
            }
    
    def create_audio(self, text, output_path):
        """Generate audio narration using ElevenLabs."""
        try:
            logging.info("Starting audio generation...")
            start_time = time.time()
            voice_ids = ["JBFqnCBsd6RMkjVDRZzb", "7fbQ7yJuEo56rYjrYaEh"]
            # Use ElevenLabs for high-quality voice generation
            audio_generator = self.eleven_client.text_to_speech.convert(
                text=text,
                voice_id="JBFqnCBsd6RMkjVDRZzb",  # You can change this to any voice ID you prefer
                model_id="eleven_multilingual_v2",
                output_format="mp3_44100_128"
            )
            
            # Convert generator to bytes
            audio_bytes = b''.join(audio_generator)
            
            # Save the audio file
            with open(output_path, 'wb') as f:
                f.write(audio_bytes)
            
            duration = time.time() - start_time
            logging.info(f"Audio generation completed in {duration:.2f} seconds")
            return True
        except Exception as e:
            logging.error(f"Error creating audio: {e}")
            return False
    
    def apply_ken_burns_effect(self, frame, progress, direction='zoom_out'):
        """Apply Ken Burns effect to a frame with smoother movement."""
        h, w = frame.shape[:2]
        
        # Smoother zoom using easing function
        if direction == 'zoom_out':
            scale = 1.0 + (progress * progress * 0.2)  # Quadratic easing for smoother zoom
        else:
            scale = 1.2 - (progress * progress * 0.2)  # Quadratic easing for smoother zoom
        
        # Calculate new dimensions
        new_w = int(w * scale)
        new_h = int(h * scale)
        
        # Resize image with better interpolation
        resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        
        # Calculate crop region
        x1 = (new_w - w) // 2
        y1 = (new_h - h) // 2
        x2 = x1 + w
        y2 = y1 + h
        
        # Crop to original size
        return resized[y1:y2, x1:x2]
    
    def apply_pan_effect(self, frame, progress, direction='right'):
        """Apply panning effect to a frame with smoother movement."""
        h, w = frame.shape[:2]
        
        # Smoother pan using easing function
        if direction == 'right':
            offset = int(w * (progress * progress))  # Quadratic easing
            return frame[:, offset:offset+w]
        else:
            offset = int(w * (1 - (progress * progress)))  # Quadratic easing
            return frame[:, offset:offset+w]
    
    def create_scene_clip(self, image_path, duration, effect_type='ken_burns'):
        """Create a video clip for a single scene with effects."""
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        # Resize image to video resolution
        img = cv2.resize(img, self.resolution)
        
        # Create frames for the scene
        frames = []
        for i in range(int(duration * self.fps)):
            progress = i / (duration * self.fps)
            
            if effect_type == 'ken_burns':
                frame = self.apply_ken_burns_effect(img, progress)
            elif effect_type == 'pan':
                frame = self.apply_pan_effect(img, progress)
            else:
                frame = img.copy()
            
            # Ensure frame is the correct size
            frame = cv2.resize(frame, self.resolution)
            frames.append(frame)
        
        return frames
    
    def create_transition(self, frame1, frame2, progress):
        """Create a smooth transition between two frames with easing."""
        # Ensure both frames have the same size and number of channels
        if frame1.shape != frame2.shape:
            frame2 = cv2.resize(frame2, (frame1.shape[1], frame1.shape[0]))
        
        # Use quadratic easing for smoother fade
        eased_progress = progress * progress
        return cv2.addWeighted(frame1, 1 - eased_progress, frame2, eased_progress, 0)
    
    def generate_video(self, image_paths=None, story_context=None):
        """Generate the complete story video."""
        try:
            logging.info(f"generate_video called with image_paths: {image_paths}")
            logging.info(f"Type of image_paths: {type(image_paths)}")
            
            # Get images from provided paths or directory
            image_paths = self.get_recent_images(image_paths)
            logging.info(f"Final image_paths after get_recent_images: {image_paths}")
            
            if not image_paths:
                raise ValueError("No images found!")
            
            logging.info(f"Found {len(image_paths)} images")
            for i, path in enumerate(image_paths):
                logging.info(f"Image {i+1}: {path}")
            
            # Generate story, pass story_context
            story_data = self.analyze_images(image_paths, story_context)
            
            # Create timestamp for unique filenames
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            
            # Generate audio files for each scene
            logging.info("Generating audio narrations...")
            audio_paths = []
            
            # Generate title audio
            title_audio_path = os.path.join(self.temp_dir, f"title_{timestamp}.mp3")
            self.create_audio(story_data["title"], title_audio_path)
            audio_paths.append(title_audio_path)
            
            # Generate story introduction audio
            intro_audio_path = os.path.join(self.temp_dir, f"intro_{timestamp}.mp3")
            self.create_audio(story_data["story"], intro_audio_path)
            audio_paths.append(intro_audio_path)
            
            # Generate scene audio files
            for i, narration in enumerate(story_data["scene_narrations"]):
                scene_audio_path = os.path.join(self.temp_dir, f"scene_{i}_{timestamp}.mp3")
                self.create_audio(narration, scene_audio_path)
                audio_paths.append(scene_audio_path)
            
            # Load all audio clips and calculate durations
            audio_clips = [mp.AudioFileClip(path) for path in audio_paths]
            durations = [clip.duration for clip in audio_clips]
            
            # Calculate total duration and adjust scene durations
            total_duration = sum(durations)
            transition_duration = 1.0  # 1 second transitions
            available_duration = total_duration - (len(durations) - 1) * transition_duration
            
            # Create video frames
            logging.info("Creating video frames...")
            all_frames = []
            current_time = 0
            
            # Add title screen
            title_frames = self.create_scene_clip(image_paths[0], durations[0], 'ken_burns')
            title_text = np.zeros((self.resolution[1], self.resolution[0], 3), dtype=np.uint8)
            cv2.putText(title_text, story_data["title"], 
                       (self.resolution[0]//4, self.resolution[1]//2),
                       cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
            all_frames.extend(title_frames)
            current_time += durations[0]
            
            # Add introduction scene
            intro_frames = self.create_scene_clip(image_paths[0], durations[1], 'ken_burns')
            all_frames.extend(intro_frames)
            current_time += durations[1]
            
            # Add scenes with transitions
            for i, img_path in enumerate(image_paths):
                logging.info(f"Processing scene {i+1}/{len(image_paths)}")
                scene_duration = durations[i + 2]  # +2 because we have title and intro
                
                # Create scene frames with alternating effects
                scene_frames = self.create_scene_clip(img_path, scene_duration, 
                                                    'ken_burns' if i % 2 == 0 else 'pan')
                
                # Add transition
                transition_frames = []
                for j in range(int(transition_duration * self.fps)):
                    progress = j / (transition_duration * self.fps)
                    transition_frame = self.create_transition(
                        all_frames[-1], scene_frames[0], progress)
                    transition_frames.append(transition_frame)
                all_frames.extend(transition_frames)
                
                all_frames.extend(scene_frames)
                current_time += scene_duration + transition_duration
            
            # Create video clip
            logging.info("Creating final video...")
            video_clip = mp.ImageSequenceClip(all_frames, fps=self.fps)
            
            # Combine audio clips
            final_audio = mp.concatenate_audioclips(audio_clips)
            
            # Set audio to video
            final_video = video_clip.with_audio(final_audio)
            
            # Write output file with better quality settings
            output_path = os.path.join(self.output_dir, f"story_{timestamp}.mp4")
            final_video.write_videofile(
                output_path,
                codec='libx264',
                audio_codec='aac',
                temp_audiofile=os.path.join(self.temp_dir, 'temp-audio.m4a'),
                remove_temp=True,
                threads=4,
                preset='medium',
                fps=self.fps,
                bitrate='5000k'  # Higher bitrate for better quality
            )
            
            # Clean up
            video_clip.close()
            for clip in audio_clips:
                clip.close()
            
            logging.info(f"Video saved to: {output_path}")
            return output_path
            
        except Exception as e:
            logging.error(f"Error generating video: {e}")
            import traceback
            traceback.print_exc()
            return None

def main():
    generator = StoryVideoGenerator()
    video_path = generator.generate_video()
    
    if video_path:
        print(f"Successfully created video: {video_path}")
        # Try to open the video
        try:
            import platform
            import subprocess
            
            system = platform.system()
            if system == 'Darwin':  # macOS
                subprocess.call(('open', video_path))
            elif system == 'Windows':
                os.startfile(video_path)
            else:  # Linux
                subprocess.call(('xdg-open', video_path))
        except:
            pass
    else:
        print("Failed to create video")

if __name__ == "__main__":
    main() 
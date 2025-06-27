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
from moviepy import VideoFileClip, AudioFileClip, concatenate_videoclips, ImageSequenceClip, concatenate_audioclips, CompositeAudioClip
import json
import time
import math
import random
from pathlib import Path
import logging
import asyncio
from mvpmusic import MusicGenerator

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)

# Load environment variables
load_dotenv()
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

class EnhancedVideoEffects:
    def __init__(self, resolution=(1280, 720), fps=30):
        self.resolution = resolution
        self.fps = fps
    
    def smooth_ease_in_out(self, t):
        """Smooth easing function for more natural movement"""
        return t * t * (3.0 - 2.0 * t)
    
    def apply_spiral_pan(self, frame, progress, direction='clockwise'):
        """Spiral panning effect for dynamic movement"""
        h, w = frame.shape[:2]
        
        # Scale image up to allow for spiral movement
        scale = 1.4
        scaled_frame = cv2.resize(frame, (int(w * scale), int(h * scale)), 
                                 interpolation=cv2.INTER_LANCZOS4)
        scaled_h, scaled_w = scaled_frame.shape[:2]
        
        # Smooth easing
        eased_progress = self.smooth_ease_in_out(progress)
        
        # Spiral movement - very dynamic
        angle = eased_progress * math.pi * 4  # 2 full rotations
        if direction == 'counterclockwise':
            angle = -angle
            
        radius = min(scaled_w - w, scaled_h - h) // 3
        center_x = (scaled_w - w) // 2
        center_y = (scaled_h - h) // 2
        
        # Add some radius variation for more interesting movement
        radius_variation = radius * 0.3 * math.sin(angle * 2)
        current_radius = radius + radius_variation
        
        start_x = center_x + int(current_radius * math.cos(angle))
        start_y = center_y + int(current_radius * math.sin(angle))
        
        # Clamp values to prevent out-of-bounds
        start_x = max(0, min(start_x, scaled_w - w))
        start_y = max(0, min(start_y, scaled_h - h))
        
        return scaled_frame[start_y:start_y+h, start_x:start_x+w]
    
    def apply_dramatic_zoom(self, frame, progress, zoom_type='punch_in'):
        """Dramatic zoom effects for emphasis"""
        h, w = frame.shape[:2]
        
        if zoom_type == 'punch_in':
            # Quick zoom in, then settle
            if progress < 0.3:
                # Fast zoom phase
                scale = 1.0 + (progress / 0.3) * 0.6  # Zoom to 1.6x quickly
            else:
                # Settle phase
                settle_progress = (progress - 0.3) / 0.7
                scale = 1.6 + settle_progress * 0.4  # Settle to 2.0x
        
        elif zoom_type == 'dolly_zoom':
            # Vertigo/dolly zoom effect (zoom in while "moving back")
            zoom_scale = 1.0 + progress * 0.8
            # Simulate perspective change by slightly adjusting the crop
            perspective_offset = int(progress * 30)
            
            # Resize with zoom
            new_w, new_h = int(w * zoom_scale), int(h * zoom_scale)
            zoomed = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            
            # Crop with perspective offset
            x1 = (new_w - w) // 2 + perspective_offset
            y1 = (new_h - h) // 2
            
            return zoomed[y1:y1+h, x1:x1+w]
        
        elif zoom_type == 'speed_zoom':
            # Very fast zoom in over short duration
            ease_progress = progress ** 3  # Cubic easing for speed
            scale = 1.0 + ease_progress * 1.0
        
        # Standard zoom processing
        new_w, new_h = int(w * scale), int(h * scale)
        zoomed = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        
        # Center crop
        x1 = (new_w - w) // 2
        y1 = (new_h - h) // 2
        
        return zoomed[y1:y1+h, x1:x1+w]
    
    def apply_focus_pull(self, frame, progress, focus_point=(0.5, 0.5)):
        """Simulate focus pull by combining zoom with blur"""
        h, w = frame.shape[:2]
        
        # Split the effect into two phases
        if progress < 0.5:
            # Phase 1: Out of focus, zoom in
            blur_strength = int(20 * (1 - progress * 2))
            zoom_scale = 1.0 + progress * 0.4
        else:
            # Phase 2: Come into focus, continue zoom
            blur_strength = 0
            zoom_scale = 1.2 + (progress - 0.5) * 0.4
        
        # Apply blur if needed
        if blur_strength > 0:
            frame = cv2.GaussianBlur(frame, (blur_strength * 2 + 1, blur_strength * 2 + 1), 0)
        
        # Apply zoom toward focus point
        new_w, new_h = int(w * zoom_scale), int(h * zoom_scale)
        zoomed = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        
        # Calculate crop position based on focus point
        focus_x = int(focus_point[0] * (new_w - w))
        focus_y = int(focus_point[1] * (new_h - h))
        
        return zoomed[focus_y:focus_y+h, focus_x:focus_x+w]
    
    def apply_stretch_effect(self, frame, progress):
        """Apply a stretch effect that distorts the image"""
        h, w = frame.shape[:2]
        
        # Create a stretch effect using different scaling for x and y
        stretch_factor = 1.0 + progress * 0.5  # Stretch up to 1.5x
        
        # Apply different scaling to width and height
        new_w = int(w * stretch_factor)
        new_h = int(h * (2.0 - stretch_factor))  # Compress height as width stretches
        
        # Resize with different interpolation for dramatic effect
        stretched = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        
        # Crop to maintain aspect ratio
        crop_w = min(new_w, w)
        crop_h = min(new_h, h)
        
        # Center crop
        start_x = (new_w - crop_w) // 2
        start_y = (new_h - crop_h) // 2
        
        return stretched[start_y:start_y+crop_h, start_x:start_x+crop_w]
    
    def apply_cool_pan(self, frame, progress):
        """Apply a cool diagonal pan with zoom"""
        h, w = frame.shape[:2]
        
        # Scale image up to allow for movement
        scale = 1.3
        scaled_frame = cv2.resize(frame, (int(w * scale), int(h * scale)), 
                                 interpolation=cv2.INTER_LANCZOS4)
        scaled_h, scaled_w = scaled_frame.shape[:2]
        
        # Smooth easing
        eased_progress = self.smooth_ease_in_out(progress)
        
        # Diagonal movement with zoom
        angle = eased_progress * math.pi * 2  # Full circle
        radius = min(scaled_w - w, scaled_h - h) // 4
        
        # Add zoom effect
        zoom_scale = 1.0 + eased_progress * 0.3
        
        center_x = (scaled_w - w) // 2
        center_y = (scaled_h - h) // 2
        
        # Calculate position with zoom
        start_x = center_x + int(radius * math.cos(angle) * zoom_scale)
        start_y = center_y + int(radius * math.sin(angle) * zoom_scale)
        
        # Clamp values
        start_x = max(0, min(start_x, scaled_w - w))
        start_y = max(0, min(start_y, scaled_h - h))
        
        return scaled_frame[start_y:start_y+h, start_x:start_x+w]

class StoryVideoGenerator:
    def __init__(self, enhanced_dir="enhanced_drawings", output_dir="story_videos"):
        self.enhanced_dir = enhanced_dir
        self.output_dir = output_dir
        self.temp_dir = "temp_processing"
        self.music_dir = "gen_music"
        
        # Create directories
        for directory in [self.output_dir, self.temp_dir, self.music_dir]:
            os.makedirs(directory, exist_ok=True)
        
        # Video settings
        self.fps = 30
        self.resolution = (1280, 720)  # HD resolution
        self.transition_duration = 2  # seconds
        self.scene_duration = 5  # seconds per scene
        
        # Initialize enhanced effects
        self.effects = EnhancedVideoEffects(self.resolution, self.fps)
        
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
                prompt = """Describe this image in an interesting way. As is relevant, include:
                - What's happening in the scene
                - The main shapes and characters involved
                - Any interesting details or characters
                – Make sure you avoid using big or complicated language. Keep it very simple, a little bit ironic, and humorous if appropraite.
                Keep it to 1-2 sentences and use very simple, clear language."""
                
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
        Create an engaging story that connects these {len(image_descriptions)} scenes. Make it exciting, interesting, and constanly make it ironic and unexpected in funny ways. Use simple words throughout, avoid cliches and big words, and never use fancy alliterations. Langauge should be short sweet and to the point.
        
        Here are short descriptions for each scene. Use them to create a coherent story script that is short, engaging, and interesting. These descriptions are simple and very descriptive, but do not get lost in the detail. Here are the descriptions:
        {chr(10).join(f"Scene {i+1}: {desc}" for i, desc in enumerate(image_descriptions))}

        Remember that you only have the specific number of scenes to work with so do not go over 2 sentences per scene.
        
        Your response must be a valid JSON object with exactly this structure:
        {{
            "title": "A fun and catchy title",
            "story": "A 1 sentence introduction to the story",
            "scene_narrations": [
                "A 1-2 sentence narration for each scene that describes what's happening and connects to the next scene",
                ...
            ]
        }}

        SPECIAL INSTRUCTIONS:
        – Do not use overly complicated and cliche words. Keep the language simple and fun. Aim for around a high school level of vocabulary. 
        – The script should not sound like a storybook. It should be a fun and engaging story that is short and to the point. It should be a unique, ironic story based on the scene descriptions and mood.
        – Make each scene narration about 7-15 seconds long when read aloud. Do not go over this limit.
        – Make sure the overall story has some general theme. Pick that theme early on and try to stick to it.
        – IMPORTANT: Your response must be valid JSON only, with no additional text or markdown formatting.

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
            voice_ids = ["JBFqnCBsd6RMkjVDRZzb", "7fbQ7yJuEo56rYjrYaEh", "42ZF7GefiwXbnDaSkPpY"]
            # Use ElevenLabs for high-quality voice generation
            audio_generator = self.eleven_client.text_to_speech.convert(
                text=text,
                voice_id=voice_ids[0],  # You can change this to any voice ID you prefer
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
    
    def create_scene_clip(self, image_path, duration, effect_type='auto', scene_index=0):
        """Create a video clip for a single scene with enhanced effects."""
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Could not read image: {image_path}")
        
        # Convert BGR to RGB to fix color inversion issue
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        
        # Resize image to video resolution
        img = cv2.resize(img, self.resolution)
        
        # Auto-select effect if not specified
        if effect_type == 'auto':
            effect_type = self.get_random_effect_combination(scene_index)
            logging.info(f"Scene {scene_index}: Selected effect '{effect_type}'")
        
        # Create frames for the scene
        frames = []
        for i in range(int(duration * self.fps)):
            progress = i / (duration * self.fps)
            
            # Apply the selected effect
            if effect_type == 'dramatic_zoom_punch':
                frame = self.effects.apply_dramatic_zoom(img, progress, 'punch_in')
            elif effect_type == 'dramatic_zoom_dolly':
                frame = self.effects.apply_dramatic_zoom(img, progress, 'dolly_zoom')
            elif effect_type == 'spiral_pan_clockwise':
                frame = self.effects.apply_spiral_pan(img, progress, 'clockwise')
            elif effect_type == 'spiral_pan_counterclockwise':
                frame = self.effects.apply_spiral_pan(img, progress, 'counterclockwise')
            elif effect_type == 'stretch_effect':
                frame = self.effects.apply_stretch_effect(img, progress)
            elif effect_type == 'focus_pull':
                frame = self.effects.apply_focus_pull(img, progress)
            elif effect_type == 'cool_pan':
                frame = self.effects.apply_cool_pan(img, progress)
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
    
    def get_random_effect_combination(self, scene_index):
        """Get a random effect from the simplified list"""
        effects = [
            'dramatic_zoom_punch',
            'dramatic_zoom_dolly', 
            'spiral_pan_clockwise',
            'spiral_pan_counterclockwise',
            'stretch_effect',
            'stretch_effect',
            'stretch_effect',
            'focus_pull',
            'cool_pan'
        ]
        
        # Truly random selection - no seed for maximum randomness
        return random.choice(effects)
    
    def generate_music_description(self, story_data):
        """Generate a music description based on the story data using Gemini."""
        if not GEMINI_API_KEY:
            logging.warning("GEMINI_API_KEY not set, using default music description")
            return "upbeat and cheerful background music"
        
        try:
            logging.info("Generating music description from story data...")
            
            prompt = f"""
            Based on the following description of a story, generate a brief description of what kind of background music would be appropriate. Make sure you specify that the background music is not distracting. 
            
            Story Title: {story_data.get('title', 'A Story')}
            Story Introduction: {story_data.get('story', 'A tale unfolds')}
            
            Generate a 1-2 sentence description of the music style, mood, and instruments that would fit this story.
            Focus on the emotional tone and atmosphere. Keep it simple and descriptive.
            
            Examples:
            - "gentle acoustic guitar with soft piano melodies, creating a warm and peaceful atmosphere"
            - "upbeat electronic music with driving rhythms and bright synthesizers"
            - "mysterious orchestral music with strings and woodwinds, building tension"
            
            Your response should be just the music description, nothing else.
            """
            
            response = self.client.models.generate_content(
                model="gemini-2.0-flash",
                contents=[prompt]
            )
            
            music_description = response.text.strip()
            logging.info(f"Generated music description: {music_description}")
            return music_description
            
        except Exception as e:
            logging.error(f"Error generating music description: {e}")
            return "upbeat and cheerful background music"
    
    async def generate_background_music(self, story_data, total_duration):
        """Generate background music using the MusicGenerator."""
        try:
            logging.info("Starting background music generation...")
            
            # Generate music description
            music_description = self.generate_music_description(story_data)
            
            # Create timestamp for unique filename
            timestamp = time.strftime("%Y%m%d_%H%M%S")
            music_filename = f"background_music_{timestamp}.mp3"
            music_path = os.path.join(self.music_dir, music_filename)
            
            # Initialize music generator
            music_generator = MusicGenerator(
                prompt=music_description,
                duration=total_duration,
                bpm=120,  # Default BPM, could be made dynamic
                output_file=music_path
            )
            
            # Generate music asynchronously
            success = await music_generator.generate()
            
            if success:
                logging.info(f"Background music generated successfully: {music_path}")
                return music_path
            else:
                logging.error("Failed to generate background music")
                return None
                
        except Exception as e:
            logging.error(f"Error generating background music: {e}")
            return None
    

    
    def merge_audio_with_music(self, narration_audio_path, music_path, output_path, music_volume=0.2):
        """Merge narration audio with background music."""
        try:
            logging.info("Merging narration with background music...")
            
            # Load audio files
            narration_audio = AudioFileClip(narration_audio_path)
            background_music = AudioFileClip(music_path)
            
            # Get duration
            narration_duration = narration_audio.duration
            music_duration = background_music.duration
            
            # Loop music if it's shorter than narration
            if music_duration < narration_duration:
                # Calculate how many loops we need
                loops_needed = int(narration_duration / music_duration) + 1
                background_music = concatenate_audioclips([background_music] * loops_needed)
            
            # Trim music to match narration duration
            background_music = background_music.subclipped(0, narration_duration)
            
            # Reduce music volume BEFORE creating composite
            background_music = background_music.with_volume_scaled(music_volume)
            
            # Combine audio using CompositeAudioClip
            from moviepy import CompositeAudioClip
            combined_audio = CompositeAudioClip([narration_audio, background_music])
            
            # Save combined audio
            combined_audio.write_audiofile(output_path)
            
            # Clean up
            narration_audio.close()
            background_music.close()
            combined_audio.close()
            
            logging.info(f"Audio merged successfully: {output_path}")
            return output_path
            
        except Exception as e:
            logging.error(f"Error merging audio with music: {e}")
            return narration_audio_path  # Fallback to original audio

    def generate_video(self, image_paths=None, story_context=None, include_music=False):
        """Generate the complete story video."""
        try:
            logging.info(f"generate_video called with image_paths: {image_paths}")
            logging.info(f"Type of image_paths: {type(image_paths)}")
            logging.info(f"Include music: {include_music}")
            
            # Get images from provided paths or directory
            image_paths = self.get_recent_images(image_paths)
            logging.info(f"Final image_paths after get_recent_images: {image_paths}")
            
            if not image_paths:
                raise ValueError("No images found!")
            
            # Remove duplicates while preserving order
            seen = set()
            unique_image_paths = []
            for path in image_paths:
                if path not in seen:
                    seen.add(path)
                    unique_image_paths.append(path)
            
            if len(unique_image_paths) != len(image_paths):
                logging.info(f"Removed {len(image_paths) - len(unique_image_paths)} duplicate images")
                logging.info(f"Original count: {len(image_paths)}, Unique count: {len(unique_image_paths)}")
            
            image_paths = unique_image_paths
            
            logging.info(f"Found {len(image_paths)} unique images")
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
            if not self.create_audio(story_data["title"], title_audio_path):
                logging.error("Failed to create title audio")
                raise ValueError("Failed to create title audio - ElevenLabs API quota may be exceeded. Please check your API key and account credits.")
            audio_paths.append(title_audio_path)
            
            # Generate story introduction audio
            intro_audio_path = os.path.join(self.temp_dir, f"intro_{timestamp}.mp3")
            if not self.create_audio(story_data["story"], intro_audio_path):
                logging.error("Failed to create intro audio")
                raise ValueError("Failed to create intro audio - ElevenLabs API quota may be exceeded. Please check your API key and account credits.")
            audio_paths.append(intro_audio_path)
            
            # Generate scene audio files
            for i, narration in enumerate(story_data["scene_narrations"]):
                scene_audio_path = os.path.join(self.temp_dir, f"scene_{i}_{timestamp}.mp3")
                if not self.create_audio(narration, scene_audio_path):
                    logging.error(f"Failed to create scene {i} audio")
                    raise ValueError(f"Failed to create scene {i} audio - ElevenLabs API quota may be exceeded. Please check your API key and account credits.")
                audio_paths.append(scene_audio_path)
            
            # Load all audio clips and calculate durations
            audio_clips = [AudioFileClip(path) for path in audio_paths]
            durations = [clip.duration for clip in audio_clips]
            
            # Calculate total duration and adjust scene durations
            total_duration = sum(durations)
            transition_duration = 1.0  # 1 second transitions
            available_duration = total_duration - (len(durations) - 1) * transition_duration
            
            # Generate background music if requested
            music_path = None
            if include_music:
                logging.info("Music generation requested, starting background music generation...")
                try:
                    # Run music generation asynchronously
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    music_path = loop.run_until_complete(
                        self.generate_background_music(story_data, total_duration)
                    )
                    loop.close()
                    
                    if music_path:
                        logging.info(f"Background music generated: {music_path}")
                    else:
                        logging.warning("Music generation failed, proceeding without music")
                except Exception as e:
                    logging.error(f"Error in music generation: {e}")
                    logging.info("Proceeding without background music")
            
            # Create video frames
            logging.info("Creating video frames...")
            all_frames = []
            current_time = 0
            
            # Add title screen
            title_frames = self.create_scene_clip(image_paths[0], durations[0], 'dramatic_zoom_punch', 0)
            # Overlay title text on each frame
            for i, frame in enumerate(title_frames):
                # Create a copy of the frame to avoid modifying the original
                frame_with_text = frame.copy()
                # Add title text overlay with black color
                cv2.putText(frame_with_text, story_data["title"], 
                           (self.resolution[0]//4, self.resolution[1]//2),
                           cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 0), 3)
                title_frames[i] = frame_with_text

            all_frames.extend(title_frames)
            current_time += durations[0]
            
            # Add introduction scene
            intro_frames = self.create_scene_clip(image_paths[0], durations[1], 'focus_pull', 1)
            all_frames.extend(intro_frames)
            current_time += durations[1]
            
            # Add scenes with transitions
            for i, img_path in enumerate(image_paths):
                logging.info(f"Processing scene {i+1}/{len(image_paths)}")
                scene_duration = durations[i + 2]  # +2 because we have title and intro
                scene_index = i + 2
                
                logging.info(f"Scene {scene_index}: Using image {img_path}")
                # Create scene frames with random enhanced effects
                scene_frames = self.create_scene_clip(img_path, scene_duration, 'auto', scene_index)
                
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
            video_clip = ImageSequenceClip(all_frames, fps=self.fps)
            
            # Combine audio clips
            final_audio = concatenate_audioclips(audio_clips)
            
            # If music was generated, merge it with the narration
            if music_path and os.path.exists(music_path):
                logging.info("Merging narration with background music...")
                combined_audio_path = os.path.join(self.temp_dir, f"combined_audio_{timestamp}.mp3")
                
                # Save the narration audio temporarily
                temp_narration_path = os.path.join(self.temp_dir, f"temp_narration_{timestamp}.mp3")
                final_audio.write_audiofile(temp_narration_path)
                
                # Merge with background music
                merged_path = self.merge_audio_with_music(
                    temp_narration_path,
                    music_path,
                    combined_audio_path
                )
                
                # Check if merge was successful and file exists
                if merged_path and os.path.exists(merged_path):
                    # Use the combined audio for the video
                    final_audio = AudioFileClip(merged_path)
                    logging.info("Successfully loaded combined audio with music")
                else:
                    logging.warning("Music merge failed, using narration-only audio")
                    # Clean up the failed merge attempt
                    if os.path.exists(temp_narration_path):
                        os.remove(temp_narration_path)
            else:
                logging.info("No music generated or music file not found, using narration-only audio")
            
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
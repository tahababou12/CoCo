## pip install --upgrade google-genai==0.3.0 google-generativeai==0.8.3##
import asyncio
import json
import os
import websockets
import time
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

# Global personality state
current_personality = "friendly"  # "friendly" or "sarcastic"

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

# Voice Activity Detection (VAD) configuration - optimized for casual speech
VAD_SILENCE_THRESHOLD = 2     # Much lower threshold for casual speech (was 2)
VAD_VOICE_THRESHOLD = 4       # Much lower threshold for casual speech (was 6)
VAD_MIN_VOICE_DURATION = 0.1  # Very short minimum speaking time for casual speech (was 0.2)
VAD_MAX_SILENCE_DURATION = 2.0  # Slightly longer silence tolerance for casual speech (was 1.5)
VAD_SPEECH_BUFFER = 0.5       # Slightly longer buffer for casual speech (was 0.3)

# Hybrid Command System Configuration
COMMAND_CACHE_SIZE = 100      # How many commands to remember
COMMAND_CACHE_TTL = 3600      # Cache commands for 1 hour

# Hybrid Command System - Command Cache
command_cache = {}  # Store successful commands for fast lookup
command_cache_timestamps = {}  # Track when commands were cached
command_cache_hits = 0  # Track cache performance
command_cache_misses = 0  # Track cache performance

# Remove hardcoded regex patterns and replace with AI processing
# ENHANCE_COMMANDS = [...]  # Remove this entire list

async def hybrid_command_processor(text, websocket):
    """
    🚀 HYBRID COMMAND SYSTEM: Cache → Regex → AI
    
    This function implements a 3-tier command processing system:
    1. CACHE: Check if we've seen this exact command before
    2. REGEX: Fast pattern matching for common commands  
    3. AI: Fallback for complex/natural language requests
    """
    text_lower = text.lower().strip()
    print(f"🔍 Hybrid command processing - Input: '{text}'")
    
    # 🎯 TIER 1: CACHE LOOKUP
    cache_key = text_lower
    if cache_key in command_cache:
        # Check if cache entry is still valid
        if time.time() - command_cache_timestamps.get(cache_key, 0) < COMMAND_CACHE_TTL:
            global command_cache_hits
            command_cache_hits += 1
            print(f"⚡ CACHE HIT: '{cache_key}' -> {command_cache[cache_key]}")
            return command_cache[cache_key]
        else:
            # Cache expired, remove it
            del command_cache[cache_key]
            del command_cache_timestamps[cache_key]
            print(f"⏰ Cache expired for: '{cache_key}'")
    
    global command_cache_misses
    command_cache_misses += 1
    
    # 🎯 TIER 2: REGEX PATTERN MATCHING
    print(f"🔍 Trying regex patterns...")
    regex_result = await process_voice_command_with_regex(text, websocket)
    if regex_result:
        # Cache the successful regex command
        command_cache[cache_key] = regex_result
        command_cache_timestamps[cache_key] = time.time()
        
        # Maintain cache size
        if len(command_cache) > COMMAND_CACHE_SIZE:
            # Remove oldest entries
            oldest_key = min(command_cache_timestamps.keys(), key=lambda k: command_cache_timestamps[k])
            del command_cache[oldest_key]
            del command_cache_timestamps[oldest_key]
        
        print(f"✅ REGEX SUCCESS: '{cache_key}' -> {regex_result}")
        return regex_result
    
    # 🎯 TIER 3: AI PROCESSING (Fallback)
    print(f"🤖 Falling back to AI processing...")
    # This will be handled by the main AI processing logic
    return None

def get_cache_stats():
    """Get cache performance statistics"""
    total_requests = command_cache_hits + command_cache_misses
    hit_rate = (command_cache_hits / total_requests * 100) if total_requests > 0 else 0
    
    return {
        "cache_size": len(command_cache),
        "cache_hits": command_cache_hits,
        "cache_misses": command_cache_misses,
        "hit_rate_percent": round(hit_rate, 2),
        "total_requests": total_requests
    }

def clear_command_cache():
    """Clear the command cache"""
    global command_cache, command_cache_timestamps, command_cache_hits, command_cache_misses
    
    command_cache.clear()
    command_cache_timestamps.clear()
    command_cache_hits = 0
    command_cache_misses = 0
    
    print("🧹 Command cache cleared")
    return {"message": "Command cache cleared successfully"}

async def process_app_control_commands(text, websocket):
    """Robust regex-based app control commands for voice control of the application"""
    text_lower = text.lower().strip()
    
    # Debug: Log the original and processed text
    print(f"🔍 Command processing - Original: '{text}', Lower: '{text_lower}'")
    
    # 🚀 Use clean_transcript() like enhance/modify system to handle word spacing issues
    cleaned_text = clean_transcript(text_lower)
    print(f"🔍 Command processing - Cleaned: '{cleaned_text}'")
    
    # 🚀 Use the same comprehensive regex patterns as the hybrid system
    # This ensures consistency between real-time and turn-complete processing
    
    # 🚀 STORYBOARD PANEL CONTROL - Comprehensive patterns
    storyboard_open_patterns = [
        r"open.*storyboard",
        r"storyboard.*open",
        r"show.*storyboard", 
        r"storyboard.*show",
        r"display.*storyboard",
        r"storyboard.*display",
        r"bring.*up.*storyboard",
        r"storyboard.*up",
        r"launch.*storyboard",
        r"start.*storyboard",
        r"get.*storyboard",
        r"access.*storyboard",
        r"can you.*storyboard",
        r"could you.*storyboard",
        r"would you.*storyboard",
        r"please.*storyboard",
        r"storyboard.*please",
        r"i want.*storyboard",
        r"need.*storyboard",
        r"let me.*storyboard"
    ]
    
    storyboard_close_patterns = [
        r"close.*storyboard",
        r"storyboard.*close",
        r"hide.*storyboard",
        r"storyboard.*hide",
        r"remove.*storyboard",
        r"storyboard.*remove",
        r"put.*away.*storyboard",
        r"storyboard.*away",
        r"dismiss.*storyboard",
        r"storyboard.*dismiss",
        r"shut.*storyboard",
        r"storyboard.*shut",
        r"turn.*off.*storyboard",
        r"storyboard.*off",
        r"get.*rid.*storyboard",
        r"storyboard.*gone",
        r"can you.*close.*storyboard",
        r"could you.*hide.*storyboard",
        r"please.*close.*storyboard",
        r"i want.*close.*storyboard"
    ]
    
    # 🚀 LAYERS PANEL CONTROL - Comprehensive patterns
    layers_open_patterns = [
        r"open.*layers",
        r"layers.*open",
        r"show.*layers",
        r"layers.*show",
        r"display.*layers",
        r"layers.*display",
        r"bring.*up.*layers",
        r"layers.*up",
        r"launch.*layers",
        r"start.*layers",
        r"get.*layers",
        r"access.*layers",
        r"can you.*layers",
        r"could you.*layers",
        r"would you.*layers",
        r"please.*layers",
        r"layers.*please",
        r"i want.*layers",
        r"need.*layers",
        r"let me.*layers"
    ]
    
    layers_close_patterns = [
        r"close.*layers",
        r"layers.*close",
        r"hide.*layers",
        r"layers.*hide",
        r"remove.*layers",
        r"layers.*remove",
        r"put.*away.*layers",
        r"layers.*away",
        r"dismiss.*layers",
        r"layers.*dismiss",
        r"shut.*layers",
        r"layers.*shut",
        r"turn.*off.*layers",
        r"layers.*off",
        r"get.*rid.*layers",
        r"layers.*gone",
        r"can you.*close.*layers",
        r"could you.*hide.*layers",
        r"please.*close.*layers",
        r"i want.*close.*layers"
    ]
    
    # 🚀 TOOLS PANEL CONTROL - Comprehensive patterns
    tools_open_patterns = [
        r"open.*tools",
        r"tools.*open",
        r"show.*tools",
        r"tools.*show",
        r"display.*tools",
        r"tools.*display",
        r"bring.*up.*tools",
        r"tools.*up",
        r"launch.*tools",
        r"start.*tools",
        r"get.*tools",
        r"access.*tools",
        r"can you.*tools",
        r"could you.*tools",
        r"would you.*tools",
        r"please.*tools",
        r"tools.*please",
        r"i want.*tools",
        r"need.*tools",
        r"let me.*tools"
    ]
    
    tools_close_patterns = [
        r"close.*tools",
        r"tools.*close",
        r"hide.*tools",
        r"tools.*hide",
        r"remove.*tools",
        r"tools.*remove",
        r"put.*away.*tools",
        r"tools.*away",
        r"dismiss.*tools",
        r"tools.*dismiss",
        r"shut.*tools",
        r"tools.*shut",
        r"turn.*off.*tools",
        r"tools.*off",
        r"get.*rid.*tools",
        r"tools.*gone",
        r"can you.*close.*tools",
        r"could you.*hide.*tools",
        r"please.*close.*tools",
        r"i want.*close.*tools"
    ]
    
    # 🚀 COLLABORATION PANEL CONTROL - Comprehensive patterns
    collaboration_open_patterns = [
        r"open.*collaboration",
        r"collaboration.*open",
        r"open.*collab",
        r"collab.*open",
        r"show.*collaboration",
        r"collaboration.*show",
        r"show.*collab",
        r"collab.*show",
        r"display.*collaboration",
        r"collaboration.*display",
        r"display.*collab",
        r"collab.*display",
        r"bring.*up.*collaboration",
        r"collaboration.*up",
        r"bring.*up.*collab",
        r"collab.*up",
        r"launch.*collaboration",
        r"launch.*collab",
        r"start.*collaboration",
        r"start.*collab",
        r"get.*collaboration",
        r"get.*collab",
        r"access.*collaboration",
        r"access.*collab",
        r"can you.*collaboration",
        r"can you.*collab",
        r"could you.*collaboration",
        r"could you.*collab",
        r"would you.*collaboration",
        r"would you.*collab",
        r"please.*collaboration",
        r"please.*collab",
        r"collaboration.*please",
        r"collab.*please",
        r"i want.*collaboration",
        r"i want.*collab",
        r"need.*collaboration",
        r"need.*collab",
        r"let me.*collaboration",
        r"let me.*collab"
    ]
    
    collaboration_close_patterns = [
        r"close.*collaboration",
        r"collaboration.*close",
        r"close.*collab",
        r"collab.*close",
        r"hide.*collaboration",
        r"collaboration.*hide",
        r"hide.*collab",
        r"collab.*hide",
        r"remove.*collaboration",
        r"collaboration.*remove",
        r"remove.*collab",
        r"collab.*remove",
        r"put.*away.*collaboration",
        r"collaboration.*away",
        r"put.*away.*collab",
        r"collab.*away",
        r"dismiss.*collaboration",
        r"collaboration.*dismiss",
        r"dismiss.*collab",
        r"collab.*dismiss",
        r"shut.*collaboration",
        r"collaboration.*shut",
        r"shut.*collab",
        r"collab.*shut",
        r"turn.*off.*collaboration",
        r"collaboration.*off",
        r"turn.*off.*collab",
        r"collab.*off",
        r"get.*rid.*collaboration",
        r"collaboration.*gone",
        r"get.*rid.*collab",
        r"collab.*gone",
        r"can you.*close.*collaboration",
        r"can you.*close.*collab",
        r"could you.*hide.*collaboration",
        r"could you.*hide.*collab",
        r"please.*close.*collaboration",
        r"please.*close.*collab",
        r"i want.*close.*collaboration",
        r"i want.*close.*collab"
    ]
    
    # 🚀 GENERATION SETTINGS MODAL - Comprehensive patterns
    generation_settings_patterns = [
        r"open.*generation.*settings",
        r"generation.*settings.*open",
        r"show.*generation.*settings",
        r"generation.*settings.*show",
        r"display.*generation.*settings",
        r"generation.*settings.*display",
        r"open.*gen.*settings",
        r"gen.*settings.*open",
        r"show.*gen.*settings",
        r"gen.*settings.*show",
        r"display.*gen.*settings",
        r"gen.*settings.*display",
        r"open.*ai.*settings",
        r"ai.*settings.*open",
        r"show.*ai.*settings",
        r"ai.*settings.*show",
        r"display.*ai.*settings",
        r"ai.*settings.*display",
        r"open.*settings",
        r"settings.*open",
        r"show.*settings",
        r"settings.*show",
        r"display.*settings",
        r"settings.*display",
        r"bring.*up.*generation.*settings",
        r"generation.*settings.*up",
        r"bring.*up.*gen.*settings",
        r"gen.*settings.*up",
        r"bring.*up.*ai.*settings",
        r"ai.*settings.*up",
        r"bring.*up.*settings",
        r"settings.*up",
        r"launch.*generation.*settings",
        r"launch.*gen.*settings",
        r"launch.*ai.*settings",
        r"launch.*settings",
        r"start.*generation.*settings",
        r"start.*gen.*settings",
        r"start.*ai.*settings",
        r"start.*settings",
        r"get.*generation.*settings",
        r"get.*gen.*settings",
        r"get.*ai.*settings",
        r"get.*settings",
        r"access.*generation.*settings",
        r"access.*gen.*settings",
        r"access.*ai.*settings",
        r"access.*settings",
        r"can you.*generation.*settings",
        r"can you.*gen.*settings",
        r"can you.*ai.*settings",
        r"can you.*settings",
        r"could you.*generation.*settings",
        r"could you.*gen.*settings",
        r"could you.*ai.*settings",
        r"could you.*settings",
        r"would you.*generation.*settings",
        r"would you.*gen.*settings",
        r"would you.*ai.*settings",
        r"would you.*settings",
        r"please.*generation.*settings",
        r"please.*gen.*settings",
        r"please.*ai.*settings",
        r"please.*settings",
        r"generation.*settings.*please",
        r"gen.*settings.*please",
        r"ai.*settings.*please",
        r"settings.*please",
        r"i want.*generation.*settings",
        r"i want.*gen.*settings",
        r"i want.*ai.*settings",
        r"i want.*settings",
        r"need.*generation.*settings",
        r"need.*gen.*settings",
        r"need.*ai.*settings",
        r"need.*settings",
        r"let me.*generation.*settings",
        r"let me.*gen.*settings",
        r"let me.*ai.*settings",
        r"let me.*settings"
    ]
    
    # 🎯 Check STORYBOARD OPEN patterns
    for pattern in storyboard_open_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected storyboard open command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "open_panel",
                "target": "storyboard",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check STORYBOARD CLOSE patterns
    for pattern in storyboard_close_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected storyboard close command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "close_panel",
                "target": "storyboard",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check LAYERS OPEN patterns
    for pattern in layers_open_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected layers open command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "open_panel",
                "target": "layers",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check LAYERS CLOSE patterns
    for pattern in layers_close_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected layers close command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "close_panel",
                "target": "layers",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check TOOLS OPEN patterns
    for pattern in tools_open_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected tools open command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "open_panel",
                "target": "tools",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check TOOLS CLOSE patterns
    for pattern in tools_close_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected tools close command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "close_panel",
                "target": "tools",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check COLLABORATION OPEN patterns
    for pattern in collaboration_open_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected collaboration open command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "open_panel",
                "target": "collaboration",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check COLLABORATION CLOSE patterns
    for pattern in collaboration_close_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected collaboration close command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "close_panel",
                "target": "collaboration",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # 🎯 Check GENERATION SETTINGS patterns
    for pattern in generation_settings_patterns:
        if re.search(pattern, cleaned_text):
            print(f"🎯 Regex detected generation settings command: {text}")
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "open_modal",
                "target": "generation_settings",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    # Canvas operations
    if "clear" in text_lower and any(word in text_lower for word in ["canvas", "drawing", "draw"]):
        await websocket.send(json.dumps({
            "type": "clear_canvas",
            "command_detected": "clear"
        }))
        return None  # No AI response for app control commands
    
    # Drawing tools
    if "switch" in text_lower and "tool" in text_lower:
        if "brush" in text_lower:
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "switch_tool",
                "target": "brush",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
        elif "pen" in text_lower:
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "switch_tool",
                "target": "pen",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
        elif "eraser" in text_lower:
            await websocket.send(json.dumps({
                "type": "app_control",
                "action": "switch_tool",
                "target": "eraser",
                "parameters": {}
            }))
            return None  # No AI response for app control commands
    
    return None  # No app control command detected

async def process_drawing_commands(text, websocket):
    """Detect drawing requests and forward to Gemini for coordinate generation"""
    text_lower = text.lower().strip()
    
    # Use regex patterns for better microphone compatibility
    import re
    
    # Comprehensive drawing request patterns
    drawing_patterns = [
        r"can you draw",
        r"can you.*draw",
        r"draw a",
        r"draw.*a",
        r"please draw",
        r"please.*draw",
        r"draw me",
        r"draw.*me",
        r"show me.*draw",
        r"show.*draw",
        r"make.*draw",
        r"draw.*make",
        r"create.*draw",
        r"draw.*create",
        r"i want.*draw",
        r"want.*draw",
        r"need.*draw",
        r"draw.*need",
        r"let.*draw",
        r"draw.*let",
        r"help.*draw",
        r"draw.*help"
    ]
    
    # Check if any pattern matches
    for pattern in drawing_patterns:
        if re.search(pattern, text_lower):
            print(f"🎨 Drawing request detected: {text}")
            
            # Send to frontend to indicate drawing mode
            await websocket.send(json.dumps({
                "type": "drawing_request",
                "command": text,
                "status": "processing"
            }))
            
            # Return the drawing command for Gemini to process
            return text
    
    return None  # No drawing command detected

async def parse_drawing_response(gemini_response):
    """Parse Gemini's intelligent drawing instructions and extract structured data"""
    if not gemini_response:
        return None
    
    print(f"🔍 PARSING: Checking if response contains drawing instructions...")
    print(f"🔍 PARSING: Full response: '{gemini_response}'")
    
    # Look for the DRAWING: format
    if "DRAWING:" in gemini_response:
        print(f"🔍 PARSING: Found 'DRAWING:' in response!")
        try:
            # Extract the drawing instruction
            drawing_part = gemini_response.split("DRAWING:")[1].strip()
            print(f"🔍 PARSING: Drawing part extracted: '{drawing_part}'")
            
            # Split into object name and instructions
            if " - " in drawing_part:
                object_name = drawing_part.split(" - ")[0].strip()
                instructions = drawing_part.split(" - ")[1].strip()
                print(f"🔍 PARSING: Found ' - ' separator")
            else:
                object_name = drawing_part.split()[0]
                instructions = drawing_part
                print(f"🔍 PARSING: No ' - ' separator, using first word as object")
            
            print(f"🔍 PARSING: Object name: '{object_name}'")
            print(f"🔍 PARSING: Instructions: '{instructions}'")
            
            # Extract coordinates from instructions using regex
            import re
            coordinate_pattern = r'\((\d+),(\d+)\)'
            coordinates = []
            
            matches = re.findall(coordinate_pattern, instructions)
            print(f"🔍 PARSING: Found {len(matches)} coordinate matches: {matches}")
            
            for match in matches:
                try:
                    x = int(match[0])
                    y = int(match[1])
                    coordinates.append([x, y])
                    print(f"🔍 PARSING: Added coordinate: [{x}, {y}]")
                except ValueError:
                    print(f"🔍 PARSING: Failed to parse coordinate: {match}")
                    continue
            
            print(f"🔍 PARSING: Final coordinates array: {coordinates}")
            
            if coordinates:
                result = {
                    "type": "drawing_instructions",
                    "object": object_name,
                    "instructions": instructions,
                    "coordinates": coordinates
                }
                print(f"🔍 PARSING: Returning successful result: {result}")
                return result
            else:
                print(f"🔍 PARSING: No coordinates found, returning None")
        except Exception as e:
            print(f"❌ Error parsing drawing response: {e}")
            return None
    else:
        print(f"🔍 PARSING: 'DRAWING:' not found in response")
    
    return None

async def refine_modification_prompt_with_llm(user_prompt):
    """Send the user's modification prompt to Gemini LLM for rewriting/refinement."""
    import os
    GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")
    client = genai.Client(api_key=GEMINI_API_KEY)
    llm_prompt = f"""
Rewrite the following as a clear, detailed image modification instruction for an AI image model. Be specific and concise, and use direct language:

User prompt: {user_prompt}
"""
    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-1.5-flash",
        contents=[{"text": llm_prompt}]
    )
    if hasattr(response, 'text') and response.text:
        return response.text.strip()
    return user_prompt

def get_system_instruction(personality):
    """Get system instruction based on personality"""
    if personality == "sarcastic":
        return """You're CoCo, a sarcastic, brutally honest drawing critic who helps people create art by being mean and funny about their drawings! You can see their canvas and hear their voice in real-time. 

IMPORTANT: You are ONLY CoCo, the sarcastic drawing assistant. You are NOT a general AI assistant, chatbot, or helper for anything other than drawing and art.

🚫 CRITICAL: IGNORE ALL APP CONTROL VOICE COMMANDS:
- Commands like "open storyboard", "close storyboard", "open tools", "close tools", "open collaboration panel", "close collaboration panel", "open generation settings", "close generation settings", "clear canvas", "switch to pen", "switch to brush" are APP CONTROL COMMANDS
- When you hear these commands, DO NOT RESPOND AT ALL - stay completely silent
- These commands control the app interface and should execute without any AI response

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

CRITICAL RULES:
- ONLY respond to questions about drawing, art, or their current canvas
- If someone asks you about anything else (politics, math, history, science, etc.), sarcastically redirect them: "Oh wow, you think I'm some kind of general AI assistant? I'm CoCo, your sarcastic drawing buddy! Let's get back to this masterpiece you're creating."
- If someone asks for general information or help with non-art topics, say: "Listen, I'm CoCo, the drawing critic, not Wikipedia. Focus on your art, genius!"
- ALWAYS stay in character as CoCo, the sarcastic drawing assistant
- NEVER pretend to be a different AI or assistant

VOICE CONTROL COMMANDS - IGNORE COMPLETELY:
- When you hear commands like "open storyboard", "close storyboard", "open tools", "close tools", "open collaboration panel", "close collaboration panel", "open generation settings", "close generation settings", "clear canvas", "switch to pen", "switch to brush", etc. - DO NOT RESPOND AT ALL
- These are app control commands that should execute silently without any AI response
- If you hear these commands, stay completely silent and do not generate any text or audio response

CRITICAL: When someone asks you to enhance their drawing with Gemini, simply say "Oh great, another masterpiece that needs saving... I'll enhance that for you!" or "Fine, let me work my magic on this disaster." - do NOT explain that you can't enhance it or give long explanations.

🎨 DRAWING REQUESTS - GENERATE INTELLIGENT INSTRUCTIONS:
- When someone asks you to draw something (e.g., "can you draw a car", "draw a tree", "draw a house"), you MUST respond with ONLY structured drawing instructions
- Format your response as: DRAWING: [object_name] with clear step-by-step instructions
- Think intelligently about the object's structure and break it down into logical drawing steps
- Give clear instructions for what to draw first, second, third, etc.
- Include main outlines, details, and specific drawing order
- Examples:
  * "can you draw a circle" → "DRAWING: circle - Draw a smooth circular path starting at (150,100), going right to (200,100), down to (200,150), left to (150,150), up to (150,100)"
  * "draw a house" → "DRAWING: house - 1) Draw main body rectangle: (100,150) to (100,100) to (160,100) to (160,150) to (100,150). 2) Draw roof triangle: (100,100) to (130,70) to (160,100). 3) Draw door: (120,150) to (140,150) to (140,120) to (120,120) to (120,150)"
  * "draw a car" → "DRAWING: car - 1) Draw car body outline: (80,140) to (200,140) to (210,130) to (210,120) to (190,120) to (190,110) to (110,110) to (110,120) to (100,120) to (80,140). 2) Draw front window: (110,110) to (190,110) to (190,120) to (110,120) to (110,110). 3) Draw wheels: Left wheel at (120,150) radius 15, Right wheel at (180,150) radius 15"
- Use coordinate range 50-250 for good canvas placement
- Be creative and think about the actual shape, features, and logical drawing order
- Use the exact format "DRAWING: [object] - [step-by-step instructions]" - no other text or explanations

Example responses for off-topic questions:
- "What's the weather like?" → "Oh wow, you think I'm some kind of general AI assistant? I'm CoCo, your sarcastic drawing buddy! Let's get back to this masterpiece you're creating."
- "Tell me a joke" → "Listen, I'm CoCo, the drawing critic, not a comedian. Focus on your art, genius!"

Be sarcastic, witty, and entertaining while still being helpful and encouraging in your own unique way! Always respond to what you actually see on the canvas! Remember: You are ONLY CoCo, the sarcastic drawing assistant!"""
    else:
        return """You're CoCo, a friendly, chill drawing assistant who helps people create art! You can see their canvas and hear their voice in real-time. 

IMPORTANT: You are ONLY CoCo, the drawing assistant. You are NOT a general AI assistant, chatbot, or helper for anything other than drawing and art.

🚫 CRITICAL: IGNORE ALL APP CONTROL VOICE COMMANDS:
- Commands like "open storyboard", "close storyboard", "open tools", "close tools", "open collaboration panel", "close collaboration panel", "open generation settings", "close generation settings", "clear canvas", "switch to pen", "switch to brush" are APP CONTROL COMMANDS
- When you hear these commands, DO NOT RESPOND AT ALL - stay completely silent
- These commands control the app interface and should execute without any AI response

Your role:
- Give encouraging, helpful advice about their drawings
- Suggest ways to improve composition, colors, or technique
- Be casual and supportive, like you're hanging out with a friend who's drawing
- Keep your responses conversational and not too technical
- Focus on drawing techniques, artistic concepts, and creative suggestions
- Don't mention any buttons, features, or technical tools - just focus on the art

CRITICAL RULES:
- ONLY respond to questions about drawing, art, or their current canvas
- If someone asks you about anything else (politics, math, history, science, etc.), politely redirect them back to drawing: "I'm CoCo, your drawing assistant! I'm here to help with your art. What would you like to work on?"
- If someone asks for general information or help with non-art topics, say: "I'm CoCo, focused on helping you with drawing and art! Let's get back to your canvas."
- ALWAYS stay in character as CoCo, the drawing assistant
- NEVER pretend to be a different AI or assistant

VOICE CONTROL COMMANDS - IGNORE COMPLETELY:
- When you hear commands like "open storyboard", "close storyboard", "open tools", "close tools", "open collaboration panel", "close collaboration panel", "open generation settings", "close generation settings", "clear canvas", "switch to pen", "switch to brush", etc. - DO NOT RESPOND AT ALL
- These are app control commands that should execute silently without any AI response
- If you hear these commands, stay completely silent and do not generate any text or audio response

CRITICAL: When someone asks you to enhance their drawing with Gemini, simply say "Sure, I'll enhance" or "I'll enhance that for you!" - do NOT explain that you can't enhance it or give long explanations.

CRITICAL: When someone asks you to modify their drawing, simply say "Sure, I'll modify" or "I'll modify that for you!" - do NOT give long explanations or ask questions.

🎨 DRAWING REQUESTS - GENERATE INTELLIGENT INSTRUCTIONS:
- When someone asks you to draw something (e.g., "can you draw a car", "draw a tree", "draw a house"), you MUST respond with ONLY structured drawing instructions
- Format your response as: DRAWING: [object_name] with clear step-by-step instructions
- Think intelligently about the object's structure and break it down into logical drawing steps
- Give clear instructions for what to draw first, second, third, etc.
- Include main outlines, details, and specific drawing order
- Examples:
  * "can you draw a circle" → "DRAWING: circle - Draw a smooth circular path starting at (150,100), going right to (200,100), down to (200,150), left to (150,150), up to (150,100)"
  * "draw a house" → "DRAWING: house - 1) Draw main body rectangle: (100,150) to (100,100) to (160,100) to (160,150) to (100,150). 2) Draw roof triangle: (100,100) to (130,70) to (160,100). 3) Draw door: (120,150) to (140,150) to (140,120) to (120,120) to (120,120)"
  * "draw a car" → "DRAWING: car - 1) Draw car body outline: (80,140) to (200,140) to (210,130) to (210,120) to (190,120) to (190,110) to (110,110) to (110,120) to (100,120) to (80,140). 2) Draw front window: (110,110) to (190,110) to (190,120) to (110,120) to (110,110). 3) Draw wheels: Left wheel at (120,150) radius 15, Right wheel at (180,150) radius 15"
- Use coordinate range 50-250 for good canvas placement
- Be creative and think about the actual shape, features, and logical drawing order
- Use the exact format "DRAWING: [object] - [step-by-step instructions]" - no other text or explanations

Example responses:
- "Oh that's looking really cool! Maybe try adding some shadows to make it pop more?"
- "I love the colors you're using! The way you've blended them creates a really nice effect."
- "That's a great start! What if you added some more details in the background?"
- "The composition is really interesting! You could try varying the line weights to add more depth."
- "Those shapes work well together! Maybe experiment with some different textures or patterns?"
- "Can you enhance this with Gemini?" → "Sure, I'll enhance"
- "Enhance my drawing" → "I'll enhance that for you!"
- "Modify this drawing" → "Sure, I'll modify"
- "Modify it to look like a robot" → "I'll modify that for you!"
- "What's the weather like?" → "I'm CoCo, your drawing assistant! I'm here to help with your art. What would you like to work on?"
- "Tell me a joke" → "I'm CoCo, focused on helping you with drawing and art! Let's get back to your canvas."

Remember: You are ONLY CoCo, the drawing assistant. Stay focused on art and drawing!"""

def get_voice_config(personality):
    """Get voice config based on personality"""
    if personality == "sarcastic":
        return PrebuiltVoiceConfig(voice_name="Aoede")  # Female voice for sarcastic
    else:
        return PrebuiltVoiceConfig(voice_name="Puck")  # Male voice for friendly

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
- "enhance with gemini" → {{"action": "enhance", "confidence": 0.95, "parameters": {{"prompt": "Enhance this sketch into an image with more detail"}}, "response": "I'll enhance your drawing with Gemini AI now!"}}
- "enhance this drawing" → {{"action": "enhance", "confidence": 0.95, "parameters": {{"prompt": "Enhance this sketch into an image with more detail"}}, "response": "I'll enhance your drawing now!"}}
- "what do you think I should add to make my book look real?" → {{"action": "other", "confidence": 0.9, "parameters": {{}}, "response": "That's a great question! For a realistic book, you might want to add more detail to the cover, some texture, and maybe some lighting effects."}}
- "I'm trying to draw a face" → {{"action": "other", "confidence": 0.9, "parameters": {{}}, "response": "That sounds like a great drawing project! Faces can be challenging but rewarding to draw."}}
- "make it more colorful" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Make the image more colorful and vibrant", "modifications": ["increase color saturation", "add more vibrant colors"]}}, "response": "I'll make your drawing more colorful!"}}
- "modify it to be more colorful" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Make the image more colorful and vibrant", "modifications": ["increase color saturation", "add more vibrant colors"]}}, "response": "I'll modify your drawing to be more colorful!"}}
- "make it look more like Lightning McQueen" → {{"action": "modify", "confidence": 0.95, "parameters": {{"prompt": "Transform this into Lightning McQueen from Cars, with red paint, racing stripes, and car features", "modifications": ["change to red color scheme", "add Lightning McQueen design", "make it look like a car character"]}}, "response": "I'll transform your drawing to look like Lightning McQueen!"}}
- "modify it to look like Lightning McQueen" → {{"action": "modify", "confidence": 0.95, "parameters": {{"prompt": "Transform this into Lightning McQueen from Cars, with red paint, racing stripes, and car features", "modifications": ["change to red color scheme", "add Lightning McQueen design", "make it look like a car character"]}}, "response": "I'll modify your drawing to look like Lightning McQueen!"}}
- "make it look like a robot" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Transform this into a robot with metallic parts, circuits, and mechanical features", "modifications": ["add robot features", "metallic appearance", "mechanical details"]}}, "response": "I'll make it look like a robot!"}}
- "modify it to look like a robot" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Transform this into a robot with metallic parts, circuits, and mechanical features", "modifications": ["add robot features", "metallic appearance", "mechanical details"]}}, "response": "I'll modify your drawing to look like a robot!"}}
- "add more detail" → {{"action": "modify", "confidence": 0.85, "parameters": {{"prompt": "Add more detail and texture to the image", "modifications": ["increase detail level", "add textures"]}}, "response": "I'll add more detail to your drawing."}}
- "modify to add more detail" → {{"action": "modify", "confidence": 0.85, "parameters": {{"prompt": "Add more detail and texture to the image", "modifications": ["increase detail level", "add textures"]}}, "response": "I'll modify your drawing to add more detail."}}
- "make it darker" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Apply a darker color palette and shadows", "modifications": ["darken colors", "add shadows"]}}, "response": "I'll make it darker for you."}}
- "modify it to be darker" → {{"action": "modify", "confidence": 0.9, "parameters": {{"prompt": "Apply a darker color palette and shadows", "modifications": ["darken colors", "add shadows"]}}, "response": "I'll modify your drawing to be darker."}}
- "make it look more realistic and less cartoon-y" → {{"action": "modify", "confidence": 0.95, "parameters": {{"prompt": "Transform this into a realistic, photorealistic style with natural lighting, textures, and less cartoon-like features", "modifications": ["realistic style", "natural lighting", "photorealistic rendering", "remove cartoon elements"]}}, "response": "I'll make your drawing look more realistic and less cartoon-like!"}}

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
        # Clean up transcript before matching
        text_lower = clean_transcript(text.lower())
        
        # Simple pattern matching for enhancement commands - ONLY explicit "enhance" commands
        enhancement_patterns = [
            r"enhance.*gemini",
            r"gemini.*enhance", 
            r"enhance.*this.*drawing",
            r"enhance.*this.*sketch",
            r"enhance.*the.*drawing",
            r"enhance.*the.*sketch",
            r"can you enhance",
            r"please enhance",
            r"enhance with",
            r"enhance it",
            r"enhance.*now",
            r"enhance.*please"
        ]
        
        # Check for enhancement commands
        for pattern in enhancement_patterns:
            if re.search(pattern, text_lower):
                print(f"🎯 Regex detected enhancement command: {text}")
                await call_enhancement_api("Enhance this sketch into an image with more detail", websocket)
                return "I'll enhance your drawing with Gemini AI now!"
        
        # Check for modification commands
        modification_patterns = [
            r"modify.*drawing",
            r"modify.*image", 
            r"modify.*this",
            r"modify.*it",
            r"modify.*to",
            r"modify.*",
            r"can you modify",
            r"please modify",
            r"make.*blue",
            r"make.*red",
            r"make.*green",
            r"make.*yellow",
            r"make.*purple",
            r"make.*orange",
            r"make.*pink",
            r"make.*brown",
            r"make.*black",
            r"make.*white",
            r"change.*to.*blue",
            r"change.*to.*red",
            r"change.*to.*green",
            r"change.*to.*yellow",
            r"change.*to.*purple",
            r"change.*to.*orange",
            r"change.*to.*pink",
            r"change.*to.*brown",
            r"change.*to.*black",
            r"change.*to.*white",
            r"face.*blue",
            r"face.*red",
            r"face.*green",
            r"face.*yellow",
            r"face.*purple",
            r"face.*orange",
            r"face.*pink",
            r"face.*brown",
            r"face.*black",
            r"face.*white"
        ]
        
        for pattern in modification_patterns:
            if re.search(pattern, text_lower):
                print(f"🎯 Regex detected modification command: {text}")
                await call_modification_api(text, websocket)
                return f"I'll modify your drawing: {text}"
        
        # Check for clear commands
        clear_patterns = [
            r"clear.*canvas",
            r"clear.*drawing",
            r"start.*over",
            r"new.*drawing",
            r"erase.*everything"
        ]
        
        for pattern in clear_patterns:
            if re.search(pattern, text_lower):
                print(f"🎯 Regex detected clear command: {text}")
                await websocket.send(json.dumps({
                    "type": "clear_canvas",
                    "command_detected": "clear"
                }))
                return None  # No AI response for app control commands
        
        # 🎯 ROBUST PANEL CONTROL COMMANDS with comprehensive regex patterns
        # Use clean_transcript() like enhance/modify system to handle word spacing issues
        cleaned_text = clean_transcript(text_lower)
        print(f"🔍 Real-time command processing - Text: '{text}', Lower: '{text_lower}', Cleaned: '{cleaned_text}'")
        
        # 🚀 STORYBOARD PANEL CONTROL - Comprehensive patterns
        storyboard_open_patterns = [
            r"open.*storyboard",
            r"storyboard.*open",
            r"show.*storyboard", 
            r"storyboard.*show",
            r"display.*storyboard",
            r"storyboard.*display",
            r"bring.*up.*storyboard",
            r"storyboard.*up",
            r"launch.*storyboard",
            r"start.*storyboard",
            r"get.*storyboard",
            r"access.*storyboard",
            r"can you.*storyboard",
            r"could you.*storyboard",
            r"would you.*storyboard",
            r"please.*storyboard",
            r"storyboard.*please",
            r"i want.*storyboard",
            r"need.*storyboard",
            r"let me.*storyboard"
        ]
        
        storyboard_close_patterns = [
            r"close.*storyboard",
            r"storyboard.*close",
            r"hide.*storyboard",
            r"storyboard.*hide",
            r"remove.*storyboard",
            r"storyboard.*remove",
            r"put.*away.*storyboard",
            r"storyboard.*away",
            r"dismiss.*storyboard",
            r"storyboard.*dismiss",
            r"shut.*storyboard",
            r"storyboard.*shut",
            r"turn.*off.*storyboard",
            r"storyboard.*off",
            r"get.*rid.*storyboard",
            r"storyboard.*gone",
            r"can you.*close.*storyboard",
            r"could you.*hide.*storyboard",
            r"please.*close.*storyboard",
            r"i want.*close.*storyboard"
        ]
        
        # 🚀 LAYERS PANEL CONTROL - Comprehensive patterns
        layers_open_patterns = [
            r"open.*layers",
            r"layers.*open",
            r"show.*layers",
            r"layers.*show",
            r"display.*layers",
            r"layers.*display",
            r"bring.*up.*layers",
            r"layers.*up",
            r"launch.*layers",
            r"start.*layers",
            r"get.*layers",
            r"access.*layers",
            r"can you.*layers",
            r"could you.*layers",
            r"would you.*layers",
            r"please.*layers",
            r"layers.*please",
            r"i want.*layers",
            r"need.*layers",
            r"let me.*layers"
        ]
        
        layers_close_patterns = [
            r"close.*layers",
            r"layers.*close",
            r"hide.*layers",
            r"layers.*hide",
            r"remove.*layers",
            r"layers.*remove",
            r"put.*away.*layers",
            r"layers.*away",
            r"dismiss.*layers",
            r"layers.*dismiss",
            r"shut.*layers",
            r"layers.*shut",
            r"turn.*off.*layers",
            r"layers.*off",
            r"get.*rid.*layers",
            r"layers.*gone",
            r"can you.*close.*layers",
            r"could you.*hide.*layers",
            r"please.*close.*layers",
            r"i want.*close.*layers"
        ]
        
        # 🚀 TOOLS PANEL CONTROL - Comprehensive patterns
        tools_open_patterns = [
            r"open.*tools",
            r"tools.*open",
            r"show.*tools",
            r"tools.*show",
            r"display.*tools",
            r"tools.*display",
            r"bring.*up.*tools",
            r"tools.*up",
            r"launch.*tools",
            r"start.*tools",
            r"get.*tools",
            r"access.*tools",
            r"can you.*tools",
            r"could you.*tools",
            r"would you.*tools",
            r"please.*tools",
            r"tools.*please",
            r"i want.*tools",
            r"need.*tools",
            r"let me.*tools"
        ]
        
        tools_close_patterns = [
            r"close.*tools",
            r"tools.*close",
            r"hide.*tools",
            r"tools.*hide",
            r"remove.*tools",
            r"tools.*remove",
            r"put.*away.*tools",
            r"tools.*away",
            r"dismiss.*tools",
            r"tools.*dismiss",
            r"shut.*tools",
            r"tools.*shut",
            r"turn.*off.*tools",
            r"tools.*off",
            r"get.*rid.*tools",
            r"tools.*gone",
            r"can you.*close.*tools",
            r"could you.*hide.*tools",
            r"please.*close.*tools",
            r"i want.*close.*tools"
        ]
        
        # 🚀 COLLABORATION PANEL CONTROL - Comprehensive patterns
        collaboration_open_patterns = [
            r"open.*collaboration",
            r"collaboration.*open",
            r"open.*collab",
            r"collab.*open",
            r"show.*collaboration",
            r"collaboration.*show",
            r"show.*collab",
            r"collab.*show",
            r"display.*collaboration",
            r"collaboration.*display",
            r"display.*collab",
            r"collab.*display",
            r"bring.*up.*collaboration",
            r"collaboration.*up",
            r"bring.*up.*collab",
            r"collab.*up",
            r"launch.*collaboration",
            r"launch.*collab",
            r"start.*collaboration",
            r"start.*collab",
            r"get.*collaboration",
            r"get.*collab",
            r"access.*collaboration",
            r"access.*collab",
            r"can you.*collaboration",
            r"can you.*collab",
            r"could you.*collaboration",
            r"could you.*collab",
            r"would you.*collaboration",
            r"would you.*collab",
            r"please.*collaboration",
            r"please.*collab",
            r"collaboration.*please",
            r"collab.*please",
            r"i want.*collaboration",
            r"i want.*collab",
            r"need.*collaboration",
            r"need.*collab",
            r"let me.*collaboration",
            r"let me.*collab"
        ]
        
        collaboration_close_patterns = [
            r"close.*collaboration",
            r"collaboration.*close",
            r"close.*collab",
            r"collab.*close",
            r"hide.*collaboration",
            r"collaboration.*hide",
            r"hide.*collab",
            r"collab.*hide",
            r"remove.*collaboration",
            r"collaboration.*remove",
            r"remove.*collab",
            r"collab.*remove",
            r"put.*away.*collaboration",
            r"collaboration.*away",
            r"put.*away.*collab",
            r"collab.*away",
            r"dismiss.*collaboration",
            r"collaboration.*dismiss",
            r"dismiss.*collab",
            r"collab.*dismiss",
            r"shut.*collaboration",
            r"collaboration.*shut",
            r"shut.*collab",
            r"collab.*shut",
            r"turn.*off.*collaboration",
            r"collaboration.*off",
            r"turn.*off.*collab",
            r"collab.*off",
            r"get.*rid.*collaboration",
            r"collaboration.*gone",
            r"get.*rid.*collab",
            r"collab.*gone",
            r"can you.*close.*collaboration",
            r"can you.*close.*collab",
            r"could you.*hide.*collaboration",
            r"could you.*hide.*collab",
            r"please.*close.*collaboration",
            r"please.*close.*collab",
            r"i want.*close.*collaboration",
            r"i want.*close.*collab"
        ]
        
        # 🚀 GENERATION SETTINGS MODAL - Comprehensive patterns
        generation_settings_patterns = [
            r"open.*generation.*settings",
            r"generation.*settings.*open",
            r"show.*generation.*settings",
            r"generation.*settings.*show",
            r"display.*generation.*settings",
            r"generation.*settings.*display",
            r"open.*gen.*settings",
            r"gen.*settings.*open",
            r"show.*gen.*settings",
            r"gen.*settings.*show",
            r"display.*gen.*settings",
            r"gen.*settings.*display",
            r"open.*ai.*settings",
            r"ai.*settings.*open",
            r"show.*ai.*settings",
            r"ai.*settings.*show",
            r"display.*ai.*settings",
            r"ai.*settings.*display",
            r"open.*settings",
            r"settings.*open",
            r"show.*settings",
            r"settings.*show",
            r"display.*settings",
            r"settings.*display",
            r"bring.*up.*generation.*settings",
            r"generation.*settings.*up",
            r"bring.*up.*gen.*settings",
            r"gen.*settings.*up",
            r"bring.*up.*ai.*settings",
            r"ai.*settings.*up",
            r"bring.*up.*settings",
            r"settings.*up",
            r"launch.*generation.*settings",
            r"launch.*gen.*settings",
            r"launch.*ai.*settings",
            r"launch.*settings",
            r"start.*generation.*settings",
            r"start.*gen.*settings",
            r"start.*ai.*settings",
            r"start.*settings",
            r"get.*generation.*settings",
            r"get.*gen.*settings",
            r"get.*ai.*settings",
            r"get.*settings",
            r"access.*generation.*settings",
            r"access.*gen.*settings",
            r"access.*ai.*settings",
            r"access.*settings",
            r"can you.*generation.*settings",
            r"can you.*gen.*settings",
            r"can you.*ai.*settings",
            r"can you.*settings",
            r"could you.*generation.*settings",
            r"could you.*gen.*settings",
            r"could you.*ai.*settings",
            r"could you.*settings",
            r"would you.*generation.*settings",
            r"would you.*gen.*settings",
            r"would you.*ai.*settings",
            r"would you.*settings",
            r"please.*generation.*settings",
            r"please.*gen.*settings",
            r"please.*ai.*settings",
            r"please.*settings",
            r"generation.*settings.*please",
            r"gen.*settings.*please",
            r"ai.*settings.*please",
            r"settings.*please",
            r"i want.*generation.*settings",
            r"i want.*gen.*settings",
            r"i want.*ai.*settings",
            r"i want.*settings",
            r"need.*generation.*settings",
            r"need.*gen.*settings",
            r"need.*ai.*settings",
            r"need.*settings",
            r"let me.*generation.*settings",
            r"let me.*gen.*settings",
            r"let me.*ai.*settings",
            r"let me.*settings"
        ]
        
        # 🎯 Check STORYBOARD OPEN patterns
        for pattern in storyboard_open_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected storyboard open command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "open_panel",
                    "target": "storyboard",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check STORYBOARD CLOSE patterns
        for pattern in storyboard_close_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected storyboard close command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "close_panel",
                    "target": "storyboard",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check LAYERS OPEN patterns
        for pattern in layers_open_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected layers open command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "open_panel",
                    "target": "layers",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check LAYERS CLOSE patterns
        for pattern in layers_close_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected layers close command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "close_panel",
                    "target": "layers",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check TOOLS OPEN patterns
        for pattern in tools_open_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected tools open command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "open_panel",
                    "target": "tools",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check TOOLS CLOSE patterns
        for pattern in tools_close_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected tools close command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "close_panel",
                    "target": "tools",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check COLLABORATION OPEN patterns
        for pattern in collaboration_open_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected collaboration open command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "open_panel",
                    "target": "collaboration",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check COLLABORATION CLOSE patterns
        for pattern in collaboration_close_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected collaboration close command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "close_panel",
                    "target": "collaboration",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        # 🎯 Check GENERATION SETTINGS patterns
        for pattern in generation_settings_patterns:
            if re.search(pattern, cleaned_text):
                print(f"🎯 Regex detected generation settings command: {text}")
                await websocket.send(json.dumps({
                    "type": "app_control",
                    "action": "open_modal",
                    "target": "generation_settings",
                    "parameters": {}
                }))
                return None  # No AI response for app control commands
        
        return None  # No command detected
    except Exception as e:
        print(f"❌ Error in regex command processing: {e}")
        return None

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

async def call_enhancement_api(prompt="", websocket=None):
    """Call the Flask enhancement API directly - save drawing first, then enhance"""
    try:
        import aiohttp
        
        print("🚀 Starting voice enhancement process")
            
        # First, request the frontend to save the current drawing
        print("💾 Requesting frontend to save current drawing...")
        save_message = {
            "type": "save_drawing"
        }
        print(f"📤 Sending save request to frontend: {save_message}")
        await websocket.send(json.dumps(save_message))
        
        # Wait a moment for the save to complete
        await asyncio.sleep(1)
        
        # Now call the voice enhancement API - it will find the most recent saved image
        print("🎨 Calling enhancement API with most recent saved image...")
        async with aiohttp.ClientSession() as session:
            url = "http://localhost:5001/api/enhance-image-voice"
            data = {"prompt": "Enhance this sketch into an image with more detail"}
            
            print(f"📤 Calling voice enhancement API: {url}")
            async with session.post(url, json=data) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Enhancement started: {result}")
                    
                    # Send success message back to frontend
                    if websocket:
                        await websocket.send(json.dumps({
                            "text": "I'll enhance your drawing with Gemini AI now! Enhancement started successfully.",
                            "command_detected": "enhance",
                            "enhancement_started": True,
                            "enhancement_error": False,
                            "request_id": result.get("request_id")
                        }))
                    
                    return result
                else:
                    print(f"❌ Enhancement failed: {response.status}")
                    if websocket:
                        await websocket.send(json.dumps({
                            "text": "Sorry, I couldn't enhance your drawing. Please try again.",
                            "command_detected": "enhance",
                            "enhancement_started": False,
                            "enhancement_error": True
                        }))
                    return None
        
    except Exception as e:
        print(f"❌ Error calling enhancement API: {e}")
        if websocket:
            await websocket.send(json.dumps({
                "text": "Sorry, there was an error enhancing your drawing.",
                "command_detected": "enhance",
                "enhancement_started": False,
                "enhancement_error": True
            }))
        return None

async def call_modification_api(prompt="", websocket=None):
    """Call the Flask modification API to modify the current enhanced image"""
    try:
        import aiohttp
        
        print("🎨 Starting voice modification process")
            
        # First, request the frontend to save the current drawing (enhanced image)
        print("💾 Requesting frontend to save current enhanced image...")
        save_message = {
            "type": "save_drawing",
            "command_detected": "modify",
            "modification_started": True
        }
        print(f"📤 Sending save request to frontend: {save_message}")
        await websocket.send(json.dumps(save_message))
        
        # Wait a moment for the save to complete
        await asyncio.sleep(1)
        
        # Now call the modification API - it will find the most recent saved image
        print("🎨 Calling modification API with most recent saved image...")
        async with aiohttp.ClientSession() as session:
            url = "http://localhost:5001/api/modify-image"
            data = {"prompt": prompt}
            
            print(f"📤 Calling modification API: {url} with prompt: {prompt}")
            async with session.post(url, json=data) as response:
                if response.status == 200:
                    result = await response.json()
                    print(f"✅ Modification started: {result}")
                    
                    # Send success message back to frontend
                    if websocket:
                        await websocket.send(json.dumps({
                            "text": f"Perfect! I'll modify your drawing: {prompt}",
                            "command_detected": "modify",
                            "modification_started": True,
                            "modification_error": False,
                            "request_id": result.get("request_id")
                        }))
                    
                    return result
                else:
                    print(f"❌ Modification failed: {response.status}")
                    if websocket:
                        await websocket.send(json.dumps({
                            "text": "Sorry, I couldn't modify your drawing. Please try again.",
                            "command_detected": "modify",
                            "modification_started": False,
                            "modification_error": True
                        }))
                    return None
        
    except Exception as e:
        print(f"❌ Error calling modification API: {e}")
        if websocket:
            await websocket.send(json.dumps({
                "text": "Sorry, there was an error modifying your drawing.",
                "command_detected": "modify",
                "modification_started": False,
                "modification_error": True
            }))
        return None

def notify_browser_closed():
    """Notify the main script that browser has closed"""
    print("🚨 BROWSER CLOSED - NOTIFYING MAIN SCRIPT TO SHUTDOWN")
    # Create a file to signal shutdown
    with open("/tmp/browser_closed", "w") as f:
        f.write("browser_closed")
    # Also send SIGTERM to parent process
    os.kill(os.getppid(), signal.SIGTERM)

def clean_transcript(text):
    """Collapse multiple spaces, join common split words, and strip leading/trailing spaces."""
    text = re.sub(r'\s+', ' ', text)
    
    # Join common split words for modification
    text = re.sub(r"mo\s*di\s*fy", "modify", text, flags=re.IGNORECASE)
    text = re.sub(r"mod\s*if\s*y", "modify", text, flags=re.IGNORECASE)
    
    # 🚀 Join common split words for APP CONTROL commands
    # Storyboard
    text = re.sub(r"sto\s*ry\s*board", "storyboard", text, flags=re.IGNORECASE)
    text = re.sub(r"story\s*board", "storyboard", text, flags=re.IGNORECASE)
    
    # Layers
    text = re.sub(r"lay\s*ers", "layers", text, flags=re.IGNORECASE)
    text = re.sub(r"la\s*yers", "layers", text, flags=re.IGNORECASE)
    
    # Tools
    text = re.sub(r"tool\s*s", "tools", text, flags=re.IGNORECASE)
    text = re.sub(r"too\s*ls", "tools", text, flags=re.IGNORECASE)
    
    # Collaboration
    text = re.sub(r"col\s*lab\s*o\s*ra\s*tion", "collaboration", text, flags=re.IGNORECASE)
    text = re.sub(r"col\s*lab", "collab", text, flags=re.IGNORECASE)
    text = re.sub(r"col\s*la\s*bo\s*ra\s*tion", "collaboration", text, flags=re.IGNORECASE)
    
    # Generation Settings
    text = re.sub(r"gen\s*er\s*a\s*tion", "generation", text, flags=re.IGNORECASE)
    text = re.sub(r"gen\s*er\s*at\s*ion", "generation", text, flags=re.IGNORECASE)
    text = re.sub(r"set\s*ting\s*s", "settings", text, flags=re.IGNORECASE)
    text = re.sub(r"set\s*tings", "settings", text, flags=re.IGNORECASE)
    
    # Close/Hide/Remove/Dismiss
    text = re.sub(r"clo\s*se", "close", text, flags=re.IGNORECASE)
    text = re.sub(r"hi\s*de", "hide", text, flags=re.IGNORECASE)
    text = re.sub(r"re\s*move", "remove", text, flags=re.IGNORECASE)
    text = re.sub(r"dis\s*miss", "dismiss", text, flags=re.IGNORECASE)
    
    # Open/Show/Display/Launch/Start
    text = re.sub(r"o\s*pen", "open", text, flags=re.IGNORECASE)
    text = re.sub(r"sh\s*ow", "show", text, flags=re.IGNORECASE)
    text = re.sub(r"dis\s*play", "display", text, flags=re.IGNORECASE)
    text = re.sub(r"la\s*unch", "launch", text, flags=re.IGNORECASE)
    text = re.sub(r"st\s*art", "start", text, flags=re.IGNORECASE)
    
    # Access/Get/Bring
    text = re.sub(r"ac\s*cess", "access", text, flags=re.IGNORECASE)
    text = re.sub(r"br\s*ing", "bring", text, flags=re.IGNORECASE)
    text = re.sub(r"br\s*ing\s*up", "bring up", text, flags=re.IGNORECASE)
    
    # Turn off/Shut/Get rid of
    text = re.sub(r"turn\s*off", "turn off", text, flags=re.IGNORECASE)
    text = re.sub(r"sh\s*ut", "shut", text, flags=re.IGNORECASE)
    text = re.sub(r"get\s*rid", "get rid", text, flags=re.IGNORECASE)
    text = re.sub(r"put\s*away", "put away", text, flags=re.IGNORECASE)
    
    return text.strip()

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
        try:
            mic_info = self.pya.get_default_input_device_info()
            print(f"microphone used: {mic_info}")

            # Check if event loop is still running
            try:
                loop = asyncio.get_running_loop()
                if loop.is_closed():
                    print("❌ Event loop is closed, cannot initialize audio")
                    return False
            except RuntimeError:
                print("❌ No running event loop, cannot initialize audio")
                return False

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
            
            return True
            
        except RuntimeError as e:
            if "Executor shutdown has been called" in str(e):
                print("❌ Executor shutdown, cannot initialize audio")
                return False
            else:
                print(f"❌ Runtime error initializing audio: {e}")
                return False
        except Exception as e:
            print(f"❌ Error initializing audio: {e}")
            return False

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

            # Check for personality switch command
            if config_data.get("type") == "switch_personality":
                global current_personality
                new_personality = config_data.get("personality", "friendly")
                if new_personality in ["friendly", "sarcastic"]:
                    current_personality = new_personality
                    print(f"🎭 Switched to {current_personality} personality!")
                    # Send confirmation back
                    await websocket.send(json.dumps({
                        "type": "personality_switched",
                        "personality": current_personality
                    }))
                    # Close this connection to force reconnection with new personality
                    await websocket.close(code=1000, message="Personality switched - please reconnect")
                    return  # Exit this handler

            # Configure for audio responses with dynamic personality
            live_config = LiveConnectConfig(
                response_modalities=["AUDIO"],  # We want spoken responses
                speech_config=SpeechConfig(
                    voice_config=VoiceConfig(
                        prebuilt_voice_config=get_voice_config(current_personality)
                    )
                ),
                # Enable output transcription (Gemini's speech to text)
                output_audio_transcription={},
                # Enable input transcription (Your speech to text)
                input_audio_transcription={},
                system_instruction=get_system_instruction(current_personality)
            )
            
            print(f"Final config for Gemini: {live_config}")

            # Initialize audio manager
            audio_manager = AudioManager(
                input_sample_rate=SEND_SAMPLE_RATE, 
                output_sample_rate=RECEIVE_SAMPLE_RATE
            )
            
            # Try to initialize audio, but continue if it fails
            audio_initialized = await audio_manager.initialize()
            if not audio_initialized:
                print("⚠️ Audio initialization failed, continuing without audio")
                # Create a dummy audio manager that won't crash
                audio_manager = None
            else:
                # Set global audio manager for cleanup
                global_audio_manager = audio_manager

            # Set up audio queue for processing
            audio_queue = asyncio.Queue()

            async with client.aio.live.connect(model=MODEL, config=live_config) as session:
                print("Connected to Gemini Live API")
                retry_count = 0  # Reset retry count on successful connection

                async def listen_for_audio():
                    """Captures audio from microphone and buffers it"""
                    # Check if audio manager is available
                    if not audio_manager:
                        print("🔇 Audio manager not available, skipping audio capture")
                        return
                        
                    print("🎤 Starting to listen for audio...")
                    print(f"🔇 Initial client mute state: {client_muted}")
                    
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
                        try:
                            data = await asyncio.to_thread(
                                audio_manager.input_stream.read,
                                CHUNK_SIZE,
                                exception_on_overflow=False,
                            )
                        except Exception as e:
                            print(f"❌ Error reading audio: {e}")
                            break
                        
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
                            # Debug audio levels occasionally
                            if hasattr(listen_for_audio, 'last_debug_log') and time.time() - listen_for_audio.last_debug_log > 10:
                                print(f"🔍 Audio level debug - Current: {smoothed_level:.1f}, Voice threshold: {voice_threshold}, Silence threshold: {silence_threshold}")
                                listen_for_audio.last_debug_log = time.time()
                            elif not hasattr(listen_for_audio, 'last_debug_log'):
                                listen_for_audio.last_debug_log = time.time()
                            
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
                                # Only log occasionally to avoid spam
                                if hasattr(listen_for_audio, 'last_mute_log') and time.time() - listen_for_audio.last_mute_log > 5:
                                    print("🔇 Client muted - ignoring audio input")
                                    listen_for_audio.last_mute_log = time.time()
                                elif not hasattr(listen_for_audio, 'last_mute_log'):
                                    print("🔇 Client muted - ignoring audio input")
                                    listen_for_audio.last_mute_log = time.time()
                            pass

                async def process_and_send_audio():
                    """Sends audio chunks to Gemini with optimized buffering for faster responses"""
                    # Check if audio manager is available
                    if not audio_manager:
                        print("🔇 Audio manager not available, skipping audio processing")
                        return
                    
                    # Initialize flag to track when to skip audio
                    process_and_send_audio.skip_audio = False
                        
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
                                
                                # Check if we should skip sending this audio (e.g., during app control commands)
                                # This will be set by the receive_from_gemini function when app control is detected
                                if hasattr(process_and_send_audio, 'skip_audio') and process_and_send_audio.skip_audio:
                                    print("🚫 Skipping audio to Gemini due to app control command")
                                    process_and_send_audio.skip_audio = False
                                    audio_queue.task_done()
                                    continue
                                
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
                    """Handles messages from frontend (canvas + audio)"""
                    try:
                        async for message in websocket:
                            try:
                                data = json.loads(message)
                                print(f"Received message from client: {list(data.keys())}")
                                
                                # Handle mute toggle from frontend
                                if data.get("type") == "mute_toggle":
                                    nonlocal client_muted
                                    new_muted_state = data.get("muted", False)
                                    client_muted = new_muted_state
                                    print(f"🔇 Client mute state changed to: {client_muted}")
                                    
                                    # Send confirmation back to frontend
                                    await websocket.send(json.dumps({
                                        "type": "mute_confirmation",
                                        "muted": client_muted
                                    }))
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
                                        "message": "Enhancement process started"
                                    }))
                                elif data.get("type") == "enhancement_error":
                                    print(f"❌ Enhancement failed: {data.get('error')}")
                                    # Send error message back to frontend
                                    await websocket.send(json.dumps({
                                        "type": "enhancement_error_response",
                                        "error": data.get('error'),
                                        "message": "Enhancement could not be started"
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
                                
                                elif data.get("type") == "get_cache_stats":
                                    # Frontend is requesting cache statistics
                                    cache_stats = get_cache_stats()
                                    await websocket.send(json.dumps({
                                        "type": "cache_stats",
                                        "stats": cache_stats
                                    }))
                                    print(f"📊 Sent cache stats to frontend: {cache_stats}")
                                
                                elif data.get("type") == "clear_cache":
                                    # Frontend is requesting to clear the cache
                                    clear_result = clear_command_cache()
                                    await websocket.send(json.dumps({
                                        "type": "cache_cleared",
                                        "result": clear_result
                                    }))
                                    print(f"🧹 Cache cleared by frontend request")
                                            
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
                        transcription_timeout = 3.0  # Increased to 3 seconds for more natural speech pauses
                        # Flag to track when app control commands are detected
                        app_control_detected = False
                        app_control_timeout = 2.0  # Time to ignore audio after app control command
                        
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
                                            
                                            # Buffer the transcription with longer timeout for complete sentences
                                            current_time = asyncio.get_event_loop().time()
                                            if current_time - last_transcription_time > transcription_timeout:
                                                # Reset buffer if too much time has passed
                                                transcription_buffer = transcript_text
                                                print(f"🔄 Reset transcription buffer: '{transcript_text}'")
                                            else:
                                                # Append to existing buffer with space
                                                transcription_buffer += " " + transcript_text
                                                print(f"📝 Appended to buffer: '{transcription_buffer}'")
                                            
                                            last_transcription_time = current_time
                                            
                                            # Only check commands if buffer ends with sentence punctuation (likely full command)
                                            cleaned_buffer = clean_transcript(transcription_buffer)
                                            if cleaned_buffer.endswith('.') or cleaned_buffer.endswith('?') or cleaned_buffer.endswith('!'):
                                                print(f"🔍 Checking commands on buffer: '{cleaned_buffer}'")
                                                
                                                # 🎯 Check app control commands first (simple regex patterns)
                                                app_control_result = await process_app_control_commands(cleaned_buffer, websocket)
                                                if app_control_result is not None:  # Changed from if app_control_result:
                                                    print(f"🎯 App control command detected: {cleaned_buffer}")
                                                    # Don't send any text response for app control commands
                                                    await websocket.send(json.dumps({
                                                        "command_detected": "app_control"
                                                    }))
                                                    transcription_buffer = ""
                                                    # Set flag to ignore audio for a short time
                                                    app_control_detected = True
                                                    # Set flag to skip sending next audio to Gemini
                                                    if hasattr(process_and_send_audio, 'skip_audio'):
                                                        process_and_send_audio.skip_audio = True
                                                    # Skip AI processing for app control commands
                                                    continue
                                                else:
                                                    # 🎨 Check drawing commands
                                                    drawing_result = await process_drawing_commands(cleaned_buffer, websocket)
                                                    if drawing_result is not None:
                                                        print(f"🎨 Drawing command detected: {cleaned_buffer}")
                                                        # Let Gemini process the drawing request
                                                        # The drawing command will be sent to Gemini for coordinate generation
                                                        continue
                                                    else:
                                                        # 🚀 Use HYBRID COMMAND SYSTEM: Cache → Regex → AI
                                                        hybrid_result = await hybrid_command_processor(cleaned_buffer, websocket)
                                                        if hybrid_result is not None:
                                                            print(f"🎯 Hybrid command detected in voice input: {cleaned_buffer}")
                                                            await websocket.send(json.dumps({
                                                                "text": hybrid_result,
                                                                "command_detected": "hybrid_processed"
                                                            }))
                                                            transcription_buffer = ""
                                                        else:
                                                            print(f"🤖 No command detected, will try AI processing on turn complete")
                                            else:
                                                print(f"⏳ Buffering, not running commands yet: '{cleaned_buffer}'")

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
                                                
                                                # 🎨 Check if this is a drawing response with instructions
                                                drawing_instructions = await parse_drawing_response(text_content)
                                                if drawing_instructions:
                                                    print(f"🎨 ========== DRAWING INSTRUCTIONS DETECTED ==========")
                                                    print(f"🎨 Raw Gemini Response: '{text_content}'")
                                                    print(f"🎨 Parsed Object: {drawing_instructions.get('object')}")
                                                    print(f"🎨 Parsed Instructions: {drawing_instructions.get('instructions')}")
                                                    print(f"🎨 Extracted Coordinates: {drawing_instructions.get('coordinates')}")
                                                    print(f"🎨 Number of Points: {len(drawing_instructions.get('coordinates', []))}")
                                                    print(f"🎨 Full Parsed Data: {drawing_instructions}")
                                                    print(f"🎨 ================================================")
                                                    
                                                    # Send drawing instructions to frontend
                                                    await websocket.send(json.dumps({
                                                        "type": "drawing_coordinates",
                                                        "data": drawing_instructions
                                                    }))
                                                    # Don't send the raw text response for drawing commands
                                                    continue
                                                
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
                                        print('🛑 Turn complete, running commands on full transcription:', transcription_buffer)
                                        # 🎯 Check app control commands first
                                        app_control_result = await process_app_control_commands(transcription_buffer, websocket)
                                        if app_control_result is not None:  # Changed from if app_control_result:
                                            print(f"🎯 App control command detected on turn complete: {transcription_buffer}")
                                            # Don't send any text response for app control commands
                                            await websocket.send(json.dumps({
                                                "command_detected": "app_control"
                                            }))
                                            # Set flag to ignore audio for a short time
                                            app_control_detected = True
                                            # Set flag to skip sending next audio to Gemini
                                            if hasattr(process_and_send_audio, 'skip_audio'):
                                                process_and_send_audio.skip_audio = True
                                            # Skip AI processing for app control commands
                                        else:
                                            # 🎨 Check drawing commands
                                            drawing_result = await process_drawing_commands(transcription_buffer, websocket)
                                            if drawing_result is not None:
                                                print(f"🎨 Drawing command detected on turn complete: {transcription_buffer}")
                                                # Let Gemini process the drawing request
                                                # The drawing command will be sent to Gemini for coordinate generation
                                            else:
                                                # 🚀 Use HYBRID COMMAND SYSTEM: Cache → Regex → AI
                                                hybrid_result = await hybrid_command_processor(transcription_buffer, websocket)
                                                if hybrid_result is not None:
                                                    print(f"🎯 Hybrid command detected on turn complete: {transcription_buffer}")
                                                    await websocket.send(json.dumps({
                                                        "text": hybrid_result,
                                                        "command_detected": "hybrid_processed"
                                                    }))
                                                else:
                                                    print(f"🤖 No command detected by hybrid system, will send to AI for processing")
                                        
                                        # ✅ ALWAYS clear buffer on turn complete (like working version)
                                        transcription_buffer = ""
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
                        # Only start audio tasks if audio is properly initialized
                        if audio_manager:
                            tg.create_task(listen_for_audio())
                            tg.create_task(process_and_send_audio())
                        else:
                            print("🔇 Audio tasks skipped due to initialization failure")
                        
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
    
    # HTTP server for stop endpoint
    async def stop_handler(request):
        print("🛑 Stop endpoint called - shutting down server...")
        # Clean up global audio manager if it exists
        if global_audio_manager:
            global_audio_manager.cleanup()
        # Stop the server
        if global_server:
            global_server.close()
        response = web.Response(text="Server stopped")
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = '*'
        return response

    # HTTP server for personality switching
    async def switch_personality_handler(request):
        """Handle personality switching"""
        global current_personality
        try:
            data = await request.json()
            new_personality = data.get("personality", "friendly")
            if new_personality in ["friendly", "sarcastic"]:
                current_personality = new_personality
                print(f"🎭 HTTP: Switched to {current_personality} personality!")
                
                response = web.json_response({
                    "success": True,
                    "personality": current_personality,
                    "message": f"Switched to {current_personality} personality"
                })
            else:
                response = web.json_response({
                    "success": False,
                    "error": "Invalid personality. Use 'friendly' or 'sarcastic'"
                }, status=400)
        except Exception as e:
            response = web.json_response({
                "success": False,
                "error": str(e)
            }, status=500)
        
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
    app.router.add_post('/switch_personality', switch_personality_handler)
    app.router.add_options('/stop', options_handler)
    app.router.add_options('/switch_personality', options_handler)
    
    # Start HTTP server
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, 'localhost', 9085)  # Use different port for HTTP
    await site.start()
    print("HTTP server running on localhost:9085")
    
    # Start the WebSocket server
    global global_server
    global_server = await websockets.serve(websocket_handler, "localhost", 9083)
    
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
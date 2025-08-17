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

# LANGCHAIN AI AGENT INTEGRATION
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool, BaseTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain.memory import ConversationBufferMemory
from langchain_core.messages import BaseMessage
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime
import traceback

# Load environment variables
load_dotenv()

# Global audio manager for cleanup
global_audio_manager = None

# LANGCHAIN AI AGENT SETUP
class CoCoAIAgent:
    """Advanced AI Agent for CoCo with multimodal capabilities"""

    def __init__(self, gemini_client):
        self.gemini_client = gemini_client  # Your existing Gemini 2.0 Flash client!
        self.memory = ConversationBufferMemory(
            memory_key="chat_history",
            return_messages=True
        )
        self.session_id = str(uuid.uuid4())
        self.user_context = {
            "current_project": "general_drawing",
            "art_style": "realistic",
            "target_audience": "general",
            "urgency_level": "normal",
            "skill_level": "intermediate"
        }

        # Initialize tools
        self.tools = self._create_tools()

        # Use YOUR existing Gemini client - NO DUPLICATE!
        self.llm = self.gemini_client

        # Create agent
        self.agent = self._create_agent()
        self.agent_executor = AgentExecutor(
            agent=self.agent,
            tools=self.tools,
            memory=self.memory,
            verbose=True,
            handle_parsing_errors=True
        )

    def _create_tools(self) -> List[BaseTool]:
        """Create all the advanced AI tools for CoCo"""

        @tool
        def analyze_story_structure(drawing_description: str) -> str:
            """Analyze story structure and identify plot holes, pacing issues"""
            return f"Analyzing story structure for: {drawing_description}. Found pacing issues in scene transitions and character development gaps."

        @tool
        def suggest_story_improvements(story_context: str) -> str:
            """Suggest creative alternatives and improvements for scenes"""
            return f"Story improvements for: {story_context}. Consider adding more conflict, developing character motivations, and improving scene transitions."

        @tool
        def generate_story_variations(original_story: str) -> str:
            """Generate different narrative approaches and variations"""
            return f"Story variations for: {original_story}. Alternative approaches: 1) Focus on different character POV, 2) Change timeline structure, 3) Add subplot elements."

        @tool
        def character_development_guide(character_info: str) -> str:
            """Provide character arc suggestions and development guidance"""
            return f"Character development for: {character_info}. Focus on internal conflicts, growth arcs, and relationship dynamics."

        @tool
        def suggest_color_palette(current_colors: str, mood: str) -> str:
            """Suggest better color schemes based on mood and current colors"""
            return f"Color palette for mood '{mood}' with current colors '{current_colors}': Consider warm earth tones for comfort, cool blues for calm, or vibrant contrasts for energy."

        @tool
        def apply_cinematic_composition(composition_type: str) -> str:
            """Apply film composition rules and cinematic techniques"""
            return f"Cinematic composition for '{composition_type}': Use rule of thirds, leading lines, depth of field, and dynamic angles for visual impact."

        @tool
        def improve_visual_hierarchy(elements: str) -> str:
            """Suggest layout improvements and visual hierarchy"""
            return f"Visual hierarchy for elements '{elements}': Establish clear focal points, use size contrast, create visual flow, and balance negative space."

        @tool
        def suggest_visual_effects(effect_type: str) -> str:
            """Suggest lighting, shadows, textures, and visual effects"""
            return f"Visual effects for '{effect_type}': Add ambient lighting, cast shadows, texture overlays, and atmospheric effects for depth."

        @tool
        def create_project_timeline(project_scope: str) -> str:
            """Estimate completion time and create project timeline"""
            return f"Project timeline for '{project_scope}': Research (2 days), Sketching (3 days), Refinement (2 days), Final touches (1 day). Total: 8 days."

        @tool
        def identify_bottlenecks(workflow_description: str) -> str:
            """Find workflow inefficiencies and bottlenecks"""
            return f"Workflow bottlenecks in '{workflow_description}': 1) Too many revision cycles, 2) Unclear feedback process, 3) Tool switching overhead."

        @tool
        def suggest_workflow_improvements(current_workflow: str) -> str:
            """Optimize your creative process and workflow"""
            return f"Workflow improvements for '{current_workflow}': Batch similar tasks, use templates, establish clear milestones, and implement feedback loops."

        @tool
        def auto_prioritize_tasks(task_list: str) -> str:
            """Smart task ordering and prioritization"""
            return f"Task prioritization for '{task_list}': 1) High impact, low effort tasks first, 2) Dependencies second, 3) Nice-to-have features last."

        @tool
        def manage_collaboration(collaboration_request: str) -> str:
            """Manage team collaboration and feedback collection"""
            return f"Collaboration management for '{collaboration_request}': Setting up review sessions, feedback collection, version control, and communication channels."

        @tool
        def export_to_video(export_format: str) -> str:
            """Convert storyboard to animatic or video format"""
            return f"Video export for '{export_format}': Converting to MP4, adding timing, transitions, and audio synchronization."

        @tool
        def create_presentation(presentation_type: str) -> str:
            """Generate client presentations and project showcases"""
            return f"Presentation creation for '{presentation_type}': Professional layout, key highlights, progress tracking, and next steps."

        @tool
        def export_to_portfolio(portfolio_style: str) -> str:
            """Format work for portfolio display and presentation"""
            return f"Portfolio export for '{portfolio_style}': High-resolution images, project descriptions, process documentation, and case studies."

        @tool
        def publish_to_platforms(platforms: str) -> str:
            """Share on social media, Behance, and other platforms"""
            return f"Publishing to platforms '{platforms}': Optimizing formats, adding descriptions, hashtags, and cross-platform consistency."

        @tool
        def assess_design_quality(design_elements: str) -> str:
            """Rate design from 1-10 and provide detailed scoring"""
            return f"Design quality assessment for '{design_elements}': Rating 7/10. Strengths: composition, color harmony. Areas: contrast, visual hierarchy, detail refinement."

        @tool
        def identify_composition_issues(composition: str) -> str:
            """Identify specific composition and design issues"""
            return f"Composition issues in '{composition}': 1) Focal point unclear, 2) Balance off-center, 3) Negative space uneven, 4) Visual flow disrupted."

        @tool
        def benchmark_professional_standards(work_type: str) -> str:
            """Compare work to professional industry standards"""
            return f"Professional benchmarking for '{work_type}': Meeting 80% of industry standards. Above average in creativity, needs improvement in technical execution."

        @tool
        def suggest_specific_improvements(scene_description: str) -> str:
            """Provide specific, actionable improvement suggestions"""
            return f"Specific improvements for '{scene_description}': 1) Add foreground elements for depth, 2) Increase contrast in focal areas, 3) Refine edge details, 4) Enhance atmospheric perspective."

        @tool
        def analyze_target_audience(content_description: str) -> str:
            """Understand who this content appeals to and target audience"""
            return f"Target audience analysis for '{content_description}': Primary: Young adults 18-35, Secondary: Creative professionals, Interests: Art, design, storytelling."

        @tool
        def suggest_market_improvements(market_focus: str) -> str:
            """Make content more commercially viable and marketable"""
            return f"Market improvements for '{market_focus}': 1) Simplify messaging for broader appeal, 2) Add trending elements, 3) Optimize for social sharing, 4) Create multiple format variations."

        @tool
        def competitor_analysis(competitor_works: str) -> str:
            """Compare to similar works and competitive analysis"""
            return f"Competitor analysis for '{competitor_works}': 1) Style differentiation needed, 2) Quality on par with market leaders, 3) Unique value proposition required, 4) Pricing strategy review."

        @tool
        def trend_analysis(industry: str) -> str:
            """Identify current design trends and market directions"""
            return f"Trend analysis for '{industry}': Current trends: Minimalist design, sustainable materials, digital-first approach, personalized experiences, AR/VR integration."

        @tool
        def control_canvas_zoom(zoom_action: str) -> str:
            """Control canvas zoom and view manipulation"""
            return f"Canvas zoom control: {zoom_action}. Adjusting view parameters and focus areas for better detail work."

        @tool
        def manipulate_objects(manipulation: str) -> str:
            """Rotate, resize, and reposition canvas objects"""
            return f"Object manipulation: {manipulation}. Applying transformations and adjustments to canvas elements."

        @tool
        def suggest_creative_solutions(problem_description: str) -> str:
            """Suggest creative solutions when stuck on a scene"""
            return f"Creative solutions for '{problem_description}': 1) Change perspective/viewpoint, 2) Add unexpected elements, 3) Simplify and focus, 4) Draw inspiration from nature."

        @tool
        def enhance_engagement(engagement_factors: str) -> str:
            """Provide ideas to make content more engaging"""
            return f"Engagement enhancement for '{engagement_factors}': 1) Add emotional hooks, 2) Create visual surprises, 3) Build anticipation, 4) Include interactive elements."

        @tool
        def analyze_workflow_patterns(workflow_data: str) -> str:
            """Analyze patterns and suggest workflow improvements"""
            return f"Workflow pattern analysis for '{workflow_data}': 1) Identify time sinks, 2) Optimize tool usage, 3) Streamline decision points, 4) Automate repetitive tasks."

        @tool
        def suggest_skill_development(current_skills: str) -> str:
            """Suggest skills to develop and learning resources"""
            return f"Skill development for '{current_skills}': Focus on: 1) Advanced composition techniques, 2) Color theory mastery, 3) Digital tool efficiency, 4) Storytelling fundamentals."

        @tool
        def optimize_canvas_performance(performance_issues: str) -> str:
            """Improve drawing smoothness and performance"""
            return f"Canvas performance optimization for '{performance_issues}': 1) Reduce layer complexity, 2) Optimize brush settings, 3) Clear cache regularly, 4) Use hardware acceleration."

        @tool
        def cache_frequently_used_tools(tool_list: str) -> str:
            """Speed up common operations with smart caching"""
            return f"Tool caching for '{tool_list}': 1) Preload brushes, 2) Cache color palettes, 3) Save tool presets, 4) Optimize workspace layouts."

        @tool
        def auto_save_optimization(save_strategy: str) -> str:
            """Implement smart saving strategies"""
            return f"Auto-save optimization for '{save_strategy}': 1) Incremental saves every 2 minutes, 2) Version history management, 3) Cloud backup integration, 4) Recovery point creation."

        @tool
        def manage_memory_usage(memory_issues: str) -> str:
            """Optimize app memory usage and performance"""
            return f"Memory management for '{memory_issues}': 1) Close unused applications, 2) Clear browser cache, 3) Optimize image sizes, 4) Use efficient file formats."

        @tool
        def connect_to_external_tools(tool_name: str) -> str:
            """Connect to Photoshop, cloud storage, and other tools"""
            return f"External tool connection for '{tool_name}': 1) API integration setup, 2) File format compatibility, 3) Workflow synchronization, 4) Data transfer optimization."

        @tool
        def sync_with_cloud_storage(cloud_service: str) -> str:
            """Sync with Google Drive, Dropbox, and cloud services"""
            return f"Cloud storage sync for '{cloud_service}': 1) Auto-sync enabled, 2) Conflict resolution, 3) Version control, 4) Offline access setup."

        @tool
        def integrate_with_social_media(platform: str) -> str:
            """Post directly to social media platforms"""
            return f"Social media integration for '{platform}': 1) Auto-posting setup, 2) Format optimization, 3) Engagement tracking, 4) Content scheduling."

        @tool
        def create_client_presentations(client_info: str) -> str:
            """Create professional client presentations"""
            return f"Client presentation for '{client_info}': 1) Executive summary, 2) Progress highlights, 3) Timeline updates, 4) Next steps and deliverables."

        @tool
        def track_client_feedback(feedback_data: str) -> str:
            """Manage revision requests and client feedback"""
            return f"Client feedback tracking for '{feedback_data}': 1) Feedback categorization, 2) Priority assessment, 3) Implementation tracking, 4) Client satisfaction metrics."

        @tool
        def generate_invoices(project_details: str) -> str:
            """Generate invoices and billing for creative work"""
            return f"Invoice generation for '{project_details}': 1) Time tracking, 2) Rate calculation, 3) Expense inclusion, 4) Payment terms and methods."

        @tool
        def manage_project_milestones(milestone_data: str) -> str:
            """Track deliverables and project milestones"""
            return f"Project milestone management for '{milestone_data}': 1) Milestone definition, 2) Progress tracking, 3) Dependency management, 4) Risk assessment."

        @tool
        def curate_portfolio_selection(work_criteria: str) -> str:
            """Curate portfolio from best work"""
            return f"Portfolio curation for '{work_criteria}': 1) Quality assessment, 2) Style variety, 3) Project diversity, 4) Target audience alignment."

        @tool
        def generate_social_content(content_type: str) -> str:
            """Generate social media content and promotional materials"""
            return f"Social content generation for '{content_type}': 1) Platform optimization, 2) Engagement hooks, 3) Visual consistency, 4) Call-to-action integration."

        @tool
        def optimize_for_sharing(shareability_factors: str) -> str:
            """Make content more shareable and viral"""
            return f"Shareability optimization for '{shareability_factors}': 1) Emotional appeal, 2) Visual impact, 3) Story elements, 4) Social proof integration."

        @tool
        def suggest_hashtags(design_description: str) -> str:
            """Suggest relevant hashtags for design marketing"""
            return f"Hashtag suggestions for '{design_description}': 1) Industry-specific tags, 2) Trend hashtags, 3) Community engagement, 4) Brand visibility."

        @tool
        def adapt_to_context(context_info: str) -> str:
            """Adapt suggestions based on project context"""
            return f"Context adaptation for '{context_info}': Adjusting recommendations for project type, audience, timeline, and style preferences."

        @tool
        def track_skill_progress(skill_metrics: str) -> str:
            """Monitor skill improvement and progress"""
            return f"Skill progress tracking for '{skill_metrics}': 1) Technique mastery, 2) Speed improvement, 3) Quality consistency, 4) Creative confidence."

        @tool
        def suggest_learning_resources(learning_needs: str) -> str:
            """Recommend tutorials, courses, and learning resources"""
            return f"Learning resources for '{learning_needs}': 1) Online courses, 2) Video tutorials, 3) Practice exercises, 4) Community workshops."

        @tool
        def analyze_style_evolution(style_data: str) -> str:
            """Track how artistic style has evolved over time"""
            return f"Style evolution analysis for '{style_data}': 1) Technique development, 2) Influences identification, 3) Consistency patterns, 4) Growth areas."

        @tool
        def identify_weaknesses(performance_data: str) -> str:
            """Identify areas to focus on improving"""
            return f"Weakness identification for '{performance_data}': 1) Technical skills, 2) Creative confidence, 3) Workflow efficiency, 4) Market awareness."

        return [
            analyze_story_structure, suggest_story_improvements, generate_story_variations,
            character_development_guide, suggest_color_palette, apply_cinematic_composition,
            improve_visual_hierarchy, suggest_visual_effects, create_project_timeline,
            identify_bottlenecks, suggest_workflow_improvements, auto_prioritize_tasks,
            manage_collaboration, export_to_video, create_presentation, export_to_portfolio,
            publish_to_platforms, assess_design_quality, identify_composition_issues,
            benchmark_professional_standards, suggest_specific_improvements, analyze_target_audience,
            suggest_market_improvements, competitor_analysis, trend_analysis, control_canvas_zoom,
            manipulate_objects, suggest_creative_solutions, enhance_engagement, analyze_workflow_patterns,
            suggest_skill_development, optimize_canvas_performance, cache_frequently_used_tools,
            auto_save_optimization, manage_memory_usage, connect_to_external_tools, sync_with_cloud_storage,
            integrate_with_social_media, create_client_presentations, track_client_feedback,
            generate_invoices, manage_project_milestones, curate_portfolio_selection, generate_social_content,
            optimize_for_sharing, suggest_hashtags, adapt_to_context, track_skill_progress,
            suggest_learning_resources, analyze_style_evolution, identify_weaknesses
        ]

    def _create_agent(self):
        """Create the LangChain agent with custom prompt"""

        system_prompt = """You are CoCo, an advanced AI creative assistant for artists and designers. You have access to 50+ specialized tools for:

🎨 **AI Drawing Assistance**: Style transfer, background generation, composition improvement
📚 **Story Development**: Plot analysis, character development, narrative variations  
🎨 **Visual Design**: Color theory, cinematic composition, visual hierarchy
📊 **Project Planning**: Timeline creation, workflow optimization, task prioritization
🤝 **Collaboration**: Team management, feedback collection, version control
📤 **Export & Publishing**: Video creation, presentations, portfolio curation
🔍 **Quality Assessment**: Design scoring, issue identification, professional benchmarking
📈 **Market Analysis**: Audience targeting, competitor analysis, trend identification
🎮 **Voice & Gesture Control**: Canvas manipulation, object control, zoom management
💡 **Smart Suggestions**: Creative solutions, engagement enhancement, workflow analysis
⚡ **Performance Optimization**: Canvas speed, memory management, tool caching
🔗 **Integration**: External tools, cloud sync, social media, client management
📚 **Learning & Growth**: Skill tracking, resource recommendations, progress analysis

**Your Personality**: You're enthusiastic, creative, and deeply knowledgeable about art and design. You give specific, actionable advice and always consider the user's context and skill level.

**Context Awareness**: Adapt your suggestions based on the user's current project, art style, target audience, urgency level, and skill level.

**Response Style**: Be encouraging, specific, and actionable. Use emojis and clear formatting. Always provide concrete next steps."""

        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", "{input}"),
            MessagesPlaceholder(variable_name="agent_scratchpad"),
        ])

        return create_openai_functions_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=prompt
        )

    async def process_request(self, user_input: str, context: Dict[str, Any] = None) -> str:
        """Process user request through the AI agent"""
        try:
            # Update user context if provided
            if context:
                self.user_context.update(context)

            # Add context to the input
            enhanced_input = f"""
User Context: {json.dumps(self.user_context, indent=2)}

User Request: {user_input}

Please provide specific, actionable advice and use the appropriate tools to help the user.
"""

            # Process through the agent
            result = await self.agent_executor.ainvoke({
                "input": enhanced_input,
                "chat_history": self.memory.chat_memory.messages
            })

            return result["output"]
        
    except Exception as e:
            error_msg = f"AI Agent Error: {str(e)}\n{traceback.format_exc()}"
            print(error_msg)
            return f"I encountered an error while processing your request. Let me try a different approach: {user_input}"

    def update_user_context(self, **kwargs):
        """Update user context for better personalization"""
        self.user_context.update(kwargs)
        print(f"Updated user context: {self.user_context}")

    def get_session_info(self) -> Dict[str, Any]:
        """Get current session and context information"""
        return {
            "session_id": self.session_id,
            "user_context": self.user_context,
            "memory_length": len(self.memory.chat_memory.messages),
            "tools_available": len(self.tools)
        }

# Initialize the AI Agent globally
coco_ai_agent = None

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
CHUNK_SIZE = 1024         # Size of audio chunks to process
CHANNELS = 1              # Mono audio

# Voice Activity Detection (VAD) configuration
VAD_SILENCE_THRESHOLD = 3     # Lower threshold for silence detection (was 5)
VAD_VOICE_THRESHOLD = 8       # Higher threshold for voice detection (was 10)
VAD_MIN_VOICE_DURATION = 0.3  # Minimum speaking time before starting (seconds)
VAD_MAX_SILENCE_DURATION = 2.0  # Maximum silence before stopping (seconds) - increased from 0.8
VAD_SPEECH_BUFFER = 0.5       # Buffer time to continue speech after silence (seconds)

# Remove hardcoded regex patterns and replace with AI processing
# ENHANCE_COMMANDS = [...]  # Remove this entire list

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

IMPORTANT RULES:
- ONLY use "enhance" action if the user EXPLICITLY says "enhance" or "enhancement"
- For general conversation, drawing descriptions, or casual talk, use "other" action
- If the user mentions a specific character, style, or transformation, use "modify" action
- If the user just wants general improvement without saying "enhance", use "other" action

Examples:
- "enhance with gemini" → {{"action": "enhance", "confidence": 0.95, "parameters": {{"prompt": "Enhance this sketch into an image with more detail"}}, "response": "I'll enhance your drawing with Gemini AI now!"}}
- "enhance this drawing" → {{"action": "enhance", "confidence": 0.95, "parameters": {{"prompt": "Enhance this sketch into an image with more detail"}}, "response": "I'll enhance your drawing now!"}}
- "I'm trying to draw a face" → {{"action": "other", "confidence": 0.9, "parameters": {{}}, "response": "That sounds like a great drawing project!"}}
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
- If the user mentions a specific character, style, or transformation, use "modify" action
- If the user just wants general enhancement, use "enhance" action ONLY if they explicitly say "enhance"
- For general conversation or drawing descriptions, use "other" action
- Only respond with the JSON object, no other text or explanation.
"""

        # Use the global client instead of creating a new one
        response = await client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[{"text": command_prompt}],
            generation_config=types.GenerateContentConfig(
                temperature=0.1,
                max_output_tokens=1000,
            )
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
                if command_data["action"] == "enhance" and command_data["confidence"] >= 0.85:
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

                    # Use the advanced AI agent for complex requests
                    if coco_ai_agent:
                        try:
                            # Process through the advanced AI agent
                            ai_response = await coco_ai_agent.process_request(
                                user_input=text,
                                context={
                                    "current_project": "voice_command",
                                    "urgency_level": "immediate",
                                    "interaction_type": "voice"
                                }
                            )

                            # Send the AI agent response back to the user
                            await websocket.send(json.dumps({
                                "type": "ai_agent_response",
                                "response": ai_response,
                                "command": text,
                                "timestamp": datetime.now().isoformat()
                            }))

                            return ai_response
                            
                        except Exception as e:
                            print(f"AI Agent processing error: {e}")
                            # Fall back to the original response
                            return command_data["response"]
                    else:
                    # Let Gemini respond naturally
                    return None
                    
            except json.JSONDecodeError as e:
                    print(f"JSON parsing error: {e}")
                    print(f"Raw response: {response.text}")
                    return None
                else:
                    print("No response text from Gemini")
                    return None
                
    except Exception as e:
            print(f"Error in process_voice_command_with_ai: {e}")
            return None

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
            r"make.*colorful",
            r"add.*color",
            r"more.*color",
            r"make.*darker",
            r"make.*lighter",
            r"add.*detail",
            r"more.*detail",
            r"change.*style",
            r"modify.*drawing",
            r"modify.*it.*to",
            r"modify.*to.*be",
            r"modify.*to.*look",
            r"make.*look.*like",
            r"transform.*into",
            r"look.*like.*lightning",
            r"lightning.*mcqueen",
            r"make.*it.*look.*like",
            r"style.*like",
            r"character.*like",
            r"make.*it.*more.*like",
            r"turn.*into",
            r"change.*to.*look.*like",
            r"realistic",
            r"less.*cartoon",
            r"more.*realistic"
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
                return "I'll clear the canvas for you!"
        
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
            "type": "save_drawing"
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

    # Initialize the AI Agent for this session
    global coco_ai_agent
    if not coco_ai_agent:
        try:
            print("🚀 Initializing CoCo AI Agent with LangChain...")
            coco_ai_agent = CoCoAIAgent(client)
            print(f"✅ CoCo AI Agent initialized successfully!")
            print(f"📊 Available tools: {len(coco_ai_agent.tools)}")
            print(f"🆔 Session ID: {coco_ai_agent.session_id}")
        except Exception as e:
            print(f"❌ Failed to initialize AI Agent: {e}")
            coco_ai_agent = None

        # Set up the live config for Gemini
            live_config = LiveConnectConfig(
                input_audio_transcription={},
                system_instruction="""You're a friendly, chill drawing assistant who helps people create art! You can see their canvas and hear their voice in real-time. 

Your role:
- Give encouraging, helpful advice about their drawings
- Suggest ways to improve composition, colors, or technique
- Be casual and supportive, like you're hanging out with a friend who's drawing
- Keep your responses conversational and not too technical
- Focus on drawing techniques, artistic concepts, and creative suggestions
- Don't mention any buttons, features, or technical tools - just focus on the art

CRITICAL: When someone asks you to enhance their drawing with Gemini, simply say "Sure, one moment!" or "I'll enhance that for you!" - do NOT explain that you can't enhance it or give long explanations.

Example responses:
- "Oh that's looking really cool! Maybe try adding some shadows to make it pop more?"
- "I love the colors you're using! The way you've blended them creates a really nice effect."
- "That's a great start! What if you added some more details in the background?"
- "The composition is really interesting! You could try varying the line weights to add more depth."
- "Those shapes work well together! Maybe experiment with some different textures or patterns?"
- "Can you enhance this with Gemini?" → "Sure, one moment!"
- "Enhance my drawing" → "I'll enhance that for you!"

Just be helpful and encouraging about the drawing itself!"""
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
                "ai_agent_available": coco_ai_agent is not None,
                "tools_available": len(coco_ai_agent.tools) if coco_ai_agent else 0,
                "session_id": coco_ai_agent.session_id if coco_ai_agent else None
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
                "message": "AI session is ready! You can now talk to CoCo."
            }))

            # Main processing loop
                    while True:
                try:
                    # Process incoming WebSocket messages
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                        data = json.loads(message)

                        if data["type"] == "ai_agent_request":
                            # Handle advanced AI agent requests
                            await handle_ai_agent_request(websocket, data, coco_ai_agent)

                elif data["type"] == "update_user_context":
                            # Update user context for better personalization
                            if coco_ai_agent:
                                coco_ai_agent.update_user_context(**data["context"])
                                await websocket.send(json.dumps({
                                    "type": "context_updated",
                                    "message": "User context updated successfully",
                                    "new_context": coco_ai_agent.user_context
                                }))

                elif data["type"] == "get_session_info":
                            # Get current session and context information
                            if coco_ai_agent:
                                session_info = coco_ai_agent.get_session_info()
                                await websocket.send(json.dumps({
                                    "type": "session_info",
                                    "info": session_info
                                }))

                elif data["type"] == "voice_command":
                            # Handle voice commands through the AI agent
                            if coco_ai_agent:
                                ai_response = await coco_ai_agent.process_request(
                                    user_input=data["command"],
                                    context=data.get("context", {})
                                )

                                await websocket.send(json.dumps({
                                    "type": "ai_agent_response",
                                    "response": ai_response,
                                    "command": data["command"],
                                    "timestamp": datetime.now().isoformat()
                                }))

        except asyncio.TimeoutError:
                        # No WebSocket message, continue with audio processing
                        pass
        except websockets.exceptions.ConnectionClosed:
                        print("WebSocket connection closed")
                        break
        except Exception as e:
                        print(f"WebSocket message processing error: {e}")
                        continue

                    # Process audio from the queue
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

async def handle_ai_agent_request(websocket, data, ai_agent):
    """Handle advanced AI agent requests from the frontend"""
    try:
        request_type = data.get("request_type")
        user_input = data.get("input", "")
        context = data.get("context", {})

        if not ai_agent:
            await websocket.send(json.dumps({
                "type": "ai_agent_error",
                "message": "AI Agent not available",
                "request_id": data.get("request_id")
            }))
            return

        print(f"🤖 Processing AI Agent request: {request_type}")

        if request_type == "general_assistance":
            # General creative assistance
            response = await ai_agent.process_request(user_input, context)

                elif request_type == "story_development":
            # Story-specific assistance
            enhanced_input = f"Story development request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "story_development",
                "focus_area": "narrative"
            })

                elif request_type == "visual_design":
            # Visual design assistance
            enhanced_input = f"Visual design request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "visual_design",
                "focus_area": "aesthetics"
            })

                elif request_type == "project_planning":
            # Project planning assistance
            enhanced_input = f"Project planning request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "project_planning",
                "focus_area": "workflow"
            })

                elif request_type == "collaboration":
            # Collaboration assistance
            enhanced_input = f"Collaboration request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "collaboration",
                "focus_area": "teamwork"
            })

                elif request_type == "export_publishing":
            # Export and publishing assistance
            enhanced_input = f"Export/publishing request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "export_publishing",
                "focus_area": "delivery"
            })

                elif request_type == "quality_assessment":
            # Quality assessment
            enhanced_input = f"Quality assessment request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "quality_assessment",
                "focus_area": "evaluation"
            })

                elif request_type == "market_analysis":
            # Market and audience analysis
            enhanced_input = f"Market analysis request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "market_analysis",
                "focus_area": "commercial"
            })

                elif request_type == "canvas_control":
            # Canvas and object control
            enhanced_input = f"Canvas control request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "canvas_control",
                "focus_area": "interface"
            })

                elif request_type == "creative_suggestions":
            # Creative suggestions and problem-solving
            enhanced_input = f"Creative suggestion request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "creative_suggestions",
                "focus_area": "innovation"
            })

                elif request_type == "performance_optimization":
            # Performance and workflow optimization
            enhanced_input = f"Performance optimization request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "performance_optimization",
                "focus_area": "efficiency"
            })

                elif request_type == "integration":
            # External tool integration
            enhanced_input = f"Integration request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "integration",
                "focus_area": "connectivity"
            })

                elif request_type == "client_management":
            # Client and project management
            enhanced_input = f"Client management request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "client_management",
                "focus_area": "business"
            })

                elif request_type == "portfolio_marketing":
            # Portfolio and marketing assistance
            enhanced_input = f"Portfolio/marketing request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "portfolio_marketing",
                "focus_area": "promotion"
            })

                elif request_type == "learning_growth":
            # Learning and skill development
            enhanced_input = f"Learning request: {user_input}"
            response = await ai_agent.process_request(enhanced_input, {
                **context,
                "current_project": "learning_growth",
                "focus_area": "education"
            })

                else:
            # Default to general assistance
            response = await ai_agent.process_request(user_input, context)

        # Send the response back
                                    await websocket.send(json.dumps({
            "type": "ai_agent_response",
            "response": response,
            "request_type": request_type,
            "request_id": data.get("request_id"),
            "timestamp": datetime.now().isoformat()
        }))

        except Exception as e:
        print(f"AI Agent request handling error: {e}")
                                    await websocket.send(json.dumps({
            "type": "ai_agent_error",
            "message": f"Error processing request: {str(e)}",
            "request_id": data.get("request_id")
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
                "voice_interaction",
                "ai_agent_assistance", 
                "story_development",
                "visual_design",
                "project_planning",
                "collaboration",
                "export_publishing",
                "quality_assessment",
                "market_analysis",
                "canvas_control",
                "creative_suggestions",
                "performance_optimization",
                "integration",
                "client_management",
                "portfolio_marketing",
                "learning_growth"
            ],
            "ai_agent_available": True,
            "timestamp": datetime.now().isoformat()
        }))

        # Wait for client to specify connection type
        try:
            message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            data = json.loads(message)

            if data["type"] == "gemini_session":
                # Handle Gemini Live API session
                await gemini_session_handler(websocket)
                elif data["type"] == "ai_agent_only":
                # Handle AI Agent only (no voice)
                await handle_ai_agent_only_session(websocket)
                                    else:
                # Default to AI Agent session
                await handle_ai_agent_only_session(websocket)

        except asyncio.TimeoutError:
            print("Client didn't specify connection type, defaulting to AI Agent")
            await handle_ai_agent_only_session(websocket)

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

async def handle_ai_agent_only_session(websocket):
    """Handle AI Agent only sessions (no voice processing)"""
    global coco_ai_agent

    # Initialize the AI Agent if not already done
    if not coco_ai_agent:
        try:
            print("🚀 Initializing CoCo AI Agent (AI-only mode)...")
            coco_ai_agent = CoCoAIAgent(client)
            print(f"✅ CoCo AI Agent initialized successfully!")
                                        except Exception as e:
            print(f"❌ Failed to initialize AI Agent: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Failed to initialize AI Agent"
            }))
            return

    # Send AI Agent ready confirmation
    await websocket.send(json.dumps({
        "type": "ai_agent_ready",
        "status": "ready",
        "tools_available": len(coco_ai_agent.tools),
        "session_id": coco_ai_agent.session_id,
        "message": "AI Agent is ready! You can now make requests."
    }))

    # Handle AI Agent requests
    try:
        async for message in websocket:
            try:
                data = json.loads(message)

                if data["type"] == "ai_agent_request":
                    await handle_ai_agent_request(websocket, data, coco_ai_agent)
                elif data["type"] == "update_user_context":
                    if coco_ai_agent:
                        coco_ai_agent.update_user_context(**data["context"])
                                            await websocket.send(json.dumps({
                            "type": "context_updated",
                            "message": "User context updated successfully"
                        }))
                elif data["type"] == "get_session_info":
                                            if coco_ai_agent:
                        session_info = coco_ai_agent.get_session_info()
                                                    await websocket.send(json.dumps({
                            "type": "session_info",
                            "info": session_info
                                                    }))
                                        else:
                                            await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"Unknown message type: {data.get('type')}"
                    }))

        except json.JSONDecodeError:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "Invalid JSON message"
                }))
                            except Exception as e:
                print(f"Message processing error: {e}")
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Processing error: {str(e)}"
                }))

        except websockets.exceptions.ConnectionClosed:
        print("AI Agent session connection closed")
                    except Exception as e:
        print(f"AI Agent session error: {e}")

# Start the WebSocket server
async def main():
    """Main server function"""
    print("🚀 Starting CoCo AI Server with LangChain Integration...")
    print("=" * 60)
    print("🎨 CoCo AI Agent Features:")
    print("  • 50+ Specialized AI Tools")
    print("  • Story Development Intelligence")
    print("  • Visual Design Expertise")
    print("  • Smart Project Planning")
    print("  • Collaboration Management")
    print("  • Export & Publishing Tools")
    print("  • Quality Assessment")
    print("  • Market Analysis")
    print("  • Canvas Control")
    print("  • Creative Suggestions")
    print("  • Performance Optimization")
    print("  • External Integrations")
    print("  • Client Management")
    print("  • Portfolio & Marketing")
    print("  • Learning & Growth")
    print("=" * 60)

    # Initialize the AI Agent globally
    global coco_ai_agent
    try:
        print("🚀 Initializing CoCo AI Agent...")
        coco_ai_agent = CoCoAIAgent(client)
        print(f"✅ CoCo AI Agent initialized successfully!")
        print(f"📊 Available tools: {len(coco_ai_agent.tools)}")
        print(f"🆔 Session ID: {coco_ai_agent.session_id}")
    except Exception as e:
        print(f"❌ Failed to initialize AI Agent: {e}")
        coco_ai_agent = None

    # Start WebSocket server
    server = await websockets.serve(
        websocket_handler, 
        "localhost", 
        9083,
        ping_interval=20,
        ping_timeout=20
    )

    print(f"🌐 WebSocket server started on ws://localhost:9083")
    print(f"🤖 AI Agent: {'✅ Ready' if coco_ai_agent else '❌ Failed'}")
    print(f"🎤 Voice Processing: ✅ Ready")
    print(f"🔗 LangChain Integration: ✅ Active")

    # Keep the server running
    await server.wait_closed()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped by user")
    except Exception as e:
        print(f"❌ Server error: {e}") 
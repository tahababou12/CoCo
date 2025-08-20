# 🏗️ Code Refactoring Plan: From Monolith to Modular

## **🎯 Current Problem**
The `multimodal_server_context_aware.py` file is **~2400 lines** with everything mixed together:
- WebSocket handling
- Audio processing
- AI drawing logic
- Command processing
- State management
- Utility functions
- Configuration

## **🚀 Proposed Solution: Modular Architecture**

### **Target Structure:**
```
backend/
├── multimodal_server.py              # Main entry point (50 lines)
├── config/
│   ├── __init__.py
│   ├── settings.py                   # All constants and config
│   └── voice_config.py               # Voice/personality settings
├── core/
│   ├── __init__.py
│   ├── websocket_handler.py          # WebSocket connection management
│   ├── session_manager.py            # Gemini session lifecycle
│   └── audio_manager.py              # Audio input/output handling
├── commands/
│   ├── __init__.py
│   ├── command_processor.py          # Main command router
│   ├── app_control.py                # App control commands
│   ├── ai_drawing.py                 # AI drawing logic
│   └── hybrid_processor.py           # Hybrid command system
├── ai/
│   ├── __init__.py
│   ├── gemini_client.py              # Gemini API interactions
│   ├── drawing_planner.py            # Drawing plan generation
│   └── context_manager.py            # AI context and state
├── state/
│   ├── __init__.py
│   ├── app_state.py                  # Application state management
│   └── session_state.py              # Session-specific state
├── communication/
│   ├── __init__.py
│   ├── message_handler.py            # WebSocket message handling
│   ├── frontend_commands.py          # Frontend command sending
│   └── ai_messages.py                # AI-specific messages
└── utils/
    ├── __init__.py
    ├── text_processing.py            # Text cleaning, regex patterns
    ├── json_utils.py                 # JSON parsing utilities
    └── logging.py                    # Centralized logging
```

---

## **🔧 Step-by-Step Refactoring**

### **Phase 1: Extract Configuration**

#### **Current (Mixed in main file):**
```python
# Lines 150-200 in multimodal_server_context_aware.py
GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
MODEL = "gemini-2.0-flash-exp"
FORMAT = pyaudio.paInt16
SEND_SAMPLE_RATE = 24000
VAD_SILENCE_THRESHOLD = 2
# ... 50+ more constants
```

#### **New (config/settings.py):**
```python
# config/settings.py
import os
from dataclasses import dataclass

@dataclass
class AudioConfig:
    FORMAT = pyaudio.paInt16
    SEND_SAMPLE_RATE = 24000
    RECEIVE_SAMPLE_RATE = 24000
    CHUNK_SIZE = 512
    CHANNELS = 1

@dataclass
class VADConfig:
    SILENCE_THRESHOLD = 2
    VOICE_THRESHOLD = 4
    MIN_VOICE_DURATION = 0.1
    MAX_SILENCE_DURATION = 2.0
    SPEECH_BUFFER = 0.5

@dataclass
class GeminiConfig:
    API_KEY = os.getenv('GOOGLE_API_KEY')
    MODEL = "gemini-2.0-flash-exp"

@dataclass
class ServerConfig:
    WEBSOCKET_PORT = 9083
    HTTP_PORT = 9085
    HOST = "localhost"

# Usage:
from config.settings import AudioConfig, VADConfig, GeminiConfig
```

### **Phase 2: Extract Core Components**

#### **Current (Mixed functions):**
```python
# Lines 100-200 in multimodal_server_context_aware.py
async def send_ai_cursor(websocket, x, y):
async def send_ai_draw(websocket, ops, cursor=None):
def generate_circle_ops(center_x, center_y, radius=20, color="#3B82F6"):
# ... scattered throughout file
```

#### **New (communication/ai_messages.py):**
```python
# communication/ai_messages.py
import json
import logging
from typing import List, Dict, Any

class AIMessageSender:
    def __init__(self, websocket):
        self.websocket = websocket
        self.logger = logging.getLogger(__name__)
    
    async def send_cursor_update(self, x: int, y: int):
        """Send AI cursor position update"""
        message = {
            "type": "ai_cursor_update",
            "x": x,
            "y": y
        }
        await self._send_message(message)
        self.logger.info(f"🎯 Sent AI cursor update: ({x}, {y})")
    
    async def send_draw_operation(self, operations: List[Dict], cursor: Dict = None):
        """Send AI drawing operations"""
        message = {
            "type": "ai_draw",
            "operations": operations,
            "cursor": cursor or {"x": 0, "y": 0}
        }
        await self._send_message(message)
        self.logger.info(f"🎨 Sent AI draw: {len(operations)} operations")
    
    async def _send_message(self, message: Dict[str, Any]):
        """Internal message sending with error handling"""
        try:
            await self.websocket.send(json.dumps(message))
        except Exception as e:
            self.logger.error(f"❌ Error sending message: {e}")
            raise

# Usage:
ai_sender = AIMessageSender(websocket)
await ai_sender.send_cursor_update(100, 200)
```

### **Phase 3: Extract Command Processing**

#### **Current (Mixed in main file):**
```python
# Lines 270-400 in multimodal_server_context_aware.py
async def process_app_control_commands(transcript, websocket, session=None):
    # 100+ lines of mixed logic
    # App control, AI drawing, hybrid processing all mixed together
```

#### **New (commands/command_processor.py):**
```python
# commands/command_processor.py
from typing import Optional, Dict, Any
from .app_control import AppControlProcessor
from .ai_drawing import AIDrawingProcessor
from .hybrid_processor import HybridProcessor

class CommandProcessor:
    def __init__(self, websocket, session=None):
        self.websocket = websocket
        self.session = session
        self.app_control = AppControlProcessor(websocket)
        self.ai_drawing = AIDrawingProcessor(websocket, session)
        self.hybrid = HybridProcessor(websocket)
    
    async def process_command(self, transcript: str) -> Optional[str]:
        """Main command router - clean and organized"""
        
        # 1. Check app control commands first
        result = await self.app_control.process(transcript)
        if result:
            return result
        
        # 2. Check AI drawing commands
        result = await self.ai_drawing.process(transcript)
        if result:
            return result
        
        # 3. Fallback to hybrid system
        return await self.hybrid.process(transcript)

# Usage:
processor = CommandProcessor(websocket, session)
result = await processor.process_command("draw a flower")
```

### **Phase 4: Extract AI Drawing Logic**

#### **Current (Mixed in main file):**
```python
# Lines 2240-2385 in multimodal_server_context_aware.py
async def process_ai_drawing_commands(transcript, websocket, session=None):
async def gemini_generate_drawing_plan(transcript, session=None):
async def execute_ai_drawing_plan(drawing_plan, websocket):
async def animate_cursor_along_line(operation, websocket):
def extract_drawing_plan_from_response(response_text):
# ... scattered throughout file
```

#### **New (commands/ai_drawing.py):**
```python
# commands/ai_drawing.py
from typing import Optional, Dict, Any
from ai.drawing_planner import DrawingPlanner
from ai.context_manager import ContextManager
from communication.ai_messages import AIMessageSender
from utils.json_utils import extract_drawing_plan_from_response

class AIDrawingProcessor:
    def __init__(self, websocket, session=None):
        self.websocket = websocket
        self.session = session
        self.message_sender = AIMessageSender(websocket)
        self.drawing_planner = DrawingPlanner(session)
        self.context_manager = ContextManager()
    
    async def process(self, transcript: str) -> Optional[str]:
        """Process AI drawing commands"""
        
        # Check if AI collaboration is enabled
        if not self.context_manager.is_ai_collab_enabled():
            return "AI collaboration is not enabled. Say 'draw with me' to start!"
        
        # Generate drawing plan using unified session
        drawing_plan = await self.drawing_planner.generate_plan(transcript)
        if not drawing_plan:
            return "Sorry, I couldn't understand how to draw that. Try being more specific!"
        
        # Execute the drawing plan
        return await self._execute_drawing_plan(drawing_plan)
    
    async def _execute_drawing_plan(self, drawing_plan: Dict[str, Any]) -> str:
        """Execute the AI-generated drawing plan with animated cursor"""
        
        if not self._validate_drawing_plan(drawing_plan):
            return "Invalid drawing plan from AI"
        
        operations = drawing_plan["drawing_operations"]
        
        for i, operation in enumerate(operations):
            await self._execute_operation(operation, i + 1)
        
        return f"✅ Drew {drawing_plan.get('description', 'your request')} based on AI instructions!"
    
    async def _execute_operation(self, operation: Dict[str, Any], operation_num: int):
        """Execute a single drawing operation"""
        
        # Move AI cursor to position
        if "x" in operation and "y" in operation:
            await self.message_sender.send_cursor_update(operation["x"], operation["y"])
            await asyncio.sleep(0.3)
        
        # Send drawing operation
        await self.message_sender.send_draw_operation([operation])
        
        # Animate cursor for lines
        if operation["type"] == "line":
            await self._animate_cursor_along_line(operation)
        
        await asyncio.sleep(0.2)
    
    async def _animate_cursor_along_line(self, operation: Dict[str, Any]):
        """Animate AI cursor along line drawing paths"""
        
        if not all(key in operation for key in ["start_x", "start_y", "end_x", "end_y"]):
            return
        
        start_x, start_y = operation["start_x"], operation["start_y"]
        end_x, end_y = operation["end_x"], operation["end_y"]
        
        steps = 20
        for i in range(steps + 1):
            progress = i / steps
            x = start_x + (end_x - start_x) * progress
            y = start_y + (end_y - start_y) * progress
            
            await self.message_sender.send_cursor_update(x, y)
            await asyncio.sleep(0.05)
    
    def _validate_drawing_plan(self, drawing_plan: Dict[str, Any]) -> bool:
        """Validate the drawing plan structure"""
        return (
            drawing_plan 
            and "drawing_operations" in drawing_plan 
            and isinstance(drawing_plan["drawing_operations"], list)
        )

# Usage:
ai_processor = AIDrawingProcessor(websocket, session)
result = await ai_processor.process("draw a flower")
```

### **Phase 5: Extract State Management**

#### **Current (Global variables):**
```python
# Lines 40-60 in multimodal_server_context_aware.py
app_state = {
    "panels": {...},
    "current_tool": "pencil",
    "cursor": {"x": 0, "y": 0},
    # ... scattered throughout file
}

def update_app_state(**kwargs):
def update_app_state_from_frontend(panels=None, current_tool=None, cursor=None):
# ... mixed with other functions
```

#### **New (state/app_state.py):**
```python
# state/app_state.py
from dataclasses import dataclass, field
from typing import Dict, Any, Optional
import logging

@dataclass
class PanelState:
    storyboard: bool = False
    layers: bool = False
    tools: bool = False
    collaboration: bool = False
    generation_settings: bool = False

@dataclass
class CursorState:
    x: int = 0
    y: int = 0

@dataclass
class AIState:
    collab_enabled: bool = False
    cursor: CursorState = field(default_factory=CursorState)
    last_user_cursor: CursorState = field(default_factory=CursorState)

@dataclass
class AppState:
    panels: PanelState = field(default_factory=PanelState)
    current_tool: str = "pencil"
    cursor: CursorState = field(default_factory=CursorState)
    ai: AIState = field(default_factory=AIState)
    
    def update_panels(self, panel_updates: Dict[str, bool]):
        """Update panel states"""
        for panel, is_open in panel_updates.items():
            if hasattr(self.panels, panel):
                setattr(self.panels, panel, is_open)
    
    def update_tool(self, tool: str):
        """Update current tool"""
        self.current_tool = tool
    
    def update_cursor(self, x: int, y: int):
        """Update cursor position"""
        self.cursor.x = x
        self.cursor.y = y
        self.ai.last_user_cursor.x = x
        self.ai.last_user_cursor.y = y
    
    def enable_ai_collab(self):
        """Enable AI collaboration"""
        self.ai.collab_enabled = True
    
    def disable_ai_collab(self):
        """Disable AI collaboration"""
        self.ai.collab_enabled = False

class AppStateManager:
    def __init__(self):
        self.state = AppState()
        self.logger = logging.getLogger(__name__)
    
    def get_state(self) -> AppState:
        """Get current app state"""
        return self.state
    
    def update_from_frontend(self, panels: Optional[Dict] = None, 
                           current_tool: Optional[str] = None,
                           cursor: Optional[Dict] = None):
        """Update state from frontend data"""
        
        if panels:
            self.state.update_panels(panels)
        
        if current_tool:
            self.state.update_tool(current_tool)
        
        if cursor:
            self.state.update_cursor(cursor["x"], cursor["y"])
        
        self.logger.info(f"🧠 Updated app state: {self.state}")
    
    def is_ai_collab_enabled(self) -> bool:
        """Check if AI collaboration is enabled"""
        return self.state.ai.collab_enabled

# Usage:
state_manager = AppStateManager()
state_manager.update_from_frontend(panels={"storyboard": True})
```

### **Phase 6: Extract WebSocket Handler**

#### **Current (Mixed in main file):**
```python
# Lines 2139-2200 in multimodal_server_context_aware.py
async def websocket_handler(websocket):
    # 100+ lines of mixed logic
    # Connection handling, session management, message processing all mixed
```

#### **New (core/websocket_handler.py):**
```python
# core/websocket_handler.py
import asyncio
import websockets
import logging
from typing import Callable
from core.session_manager import SessionManager
from commands.command_processor import CommandProcessor
from communication.message_handler import MessageHandler

class WebSocketHandler:
    def __init__(self, command_processor: CommandProcessor):
        self.command_processor = command_processor
        self.logger = logging.getLogger(__name__)
    
    async def handle_connection(self, websocket, path):
        """Handle new WebSocket connection"""
        self.logger.info(f"New WebSocket connection from {websocket.remote_address}")
        
        try:
            await self._handle_session(websocket)
        except websockets.exceptions.ConnectionClosedOK:
            self.logger.info(f"✅ WebSocket connection closed normally from {websocket.remote_address}")
        except websockets.exceptions.ConnectionClosedError as e:
            self.logger.error(f"❌ WebSocket connection closed with error: {e}")
        except Exception as e:
            self.logger.error(f"❌ Unexpected error in WebSocket handler: {e}")
        finally:
            await self._cleanup_connection(websocket)
    
    async def _handle_session(self, websocket):
        """Handle the main session logic"""
        session_manager = SessionManager(websocket)
        message_handler = MessageHandler(websocket, self.command_processor)
        
        async with session_manager.create_session() as session:
            await self._run_session(websocket, session, message_handler)
    
    async def _run_session(self, websocket, session, message_handler):
        """Run the main session loop"""
        # Start audio listening task
        audio_task = asyncio.create_task(
            session_manager.start_audio_listening()
        )
        
        try:
            # Handle Gemini responses
            async for response in session:
                await message_handler.handle_gemini_response(response, session)
        finally:
            audio_task.cancel()
    
    async def _cleanup_connection(self, websocket):
        """Clean up connection resources"""
        self.logger.info(f"🧹 Cleaning up connection for {websocket.remote_address}")
        
        # Cancel any remaining tasks
        for task in asyncio.all_tasks():
            if task is not asyncio.current_task():
                task.cancel()

# Usage:
handler = WebSocketHandler(command_processor)
start_server = websockets.serve(handler.handle_connection, "localhost", 9083)
```

---

## **🚀 Benefits of This Refactoring**

### **1. Maintainability**
- **Single responsibility** - each module has one clear purpose
- **Easy to find** specific functionality
- **Simple to modify** without affecting other parts

### **2. Testability**
- **Unit tests** for each module independently
- **Mock dependencies** easily
- **Isolated testing** of specific features

### **3. Extensibility**
- **Add new commands** by creating new processor classes
- **Modify AI behavior** without touching WebSocket code
- **Change state management** without affecting commands

### **4. Readability**
- **Clear file structure** - know where to look for things
- **Focused modules** - each file does one thing well
- **Better documentation** - easier to understand each component

### **5. Team Development**
- **Multiple developers** can work on different modules
- **Clear interfaces** between components
- **Reduced merge conflicts** - less overlap

---

## **📋 Implementation Order**

### **Phase 1: Configuration & Utils (1-2 hours)**
1. Extract all constants to `config/settings.py`
2. Create utility functions in `utils/`
3. Set up logging system

### **Phase 2: State Management (2-3 hours)**
1. Create `state/app_state.py` with proper data classes
2. Move state update functions
3. Test state management independently

### **Phase 3: Communication Layer (2-3 hours)**
1. Extract WebSocket message handling
2. Create AI message sender
3. Test communication independently

### **Phase 4: Command Processing (3-4 hours)**
1. Extract command processor
2. Create individual command modules
3. Test command processing independently

### **Phase 5: Core Components (2-3 hours)**
1. Extract WebSocket handler
2. Create session manager
3. Extract audio manager

### **Phase 6: AI Components (2-3 hours)**
1. Extract drawing planner
2. Create context manager
3. Test AI functionality independently

### **Phase 7: Main Server (1 hour)**
1. Create clean main entry point
2. Wire up all components
3. Test complete system

---

## **🎯 Result: Clean, Professional Code**

### **Before:**
```
multimodal_server_context_aware.py (2400 lines)
├── Configuration (50 lines)
├── WebSocket handling (200 lines)
├── Audio processing (300 lines)
├── Command processing (400 lines)
├── AI drawing (300 lines)
├── State management (100 lines)
├── Utility functions (150 lines)
└── Main logic (900 lines)
```

### **After:**
```
backend/ (organized modules)
├── multimodal_server.py (50 lines - main entry point)
├── config/ (100 lines - all configuration)
├── core/ (400 lines - core functionality)
├── commands/ (500 lines - command processing)
├── ai/ (300 lines - AI-specific logic)
├── state/ (150 lines - state management)
├── communication/ (200 lines - messaging)
└── utils/ (100 lines - utilities)
```

**Total: Same functionality, but organized into logical, maintainable modules!** 🎯✨

This refactoring transforms your **monolithic file** into a **professional, enterprise-grade codebase** that's easy to understand, maintain, and extend!

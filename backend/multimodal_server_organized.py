"""
Organized Multimodal Server
Main entry point that imports from organized core modules
"""

import asyncio
import signal
import os
import websockets
from core_modules import gemini_session_handler, AudioManager

# Global references for cleanup
global_audio_manager = None
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

async def main():
    """Main server function"""
    global global_audio_manager, global_server
    
    try:
        print("🚀 Starting Organized Multimodal Server...")
        
        # Initialize audio manager
        global_audio_manager = AudioManager()
        
        # Start WebSocket server
        server = await websockets.serve(
            gemini_session_handler,
            "localhost",
            8765,
            ping_interval=20,
            ping_timeout=10
        )
        
        global_server = server
        print("✅ WebSocket server started on ws://localhost:8765")
        print("🏗️ Using organized core modules architecture")
        
        # Keep server running
        await asyncio.Future()  # Run forever
        
    except KeyboardInterrupt:
        print("\n🛑 Keyboard interrupt received")
    except Exception as e:
        print(f"❌ Error in main server: {e}")
    finally:
        # Cleanup
        if global_audio_manager:
            global_audio_manager.cleanup()
        if global_server:
            global_server.close()
            await global_server.wait_closed()
        print("✅ Server shutdown complete")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutting down organized multimodal server...")
    except Exception as e:
        print(f"Error running organized multimodal server: {e}")


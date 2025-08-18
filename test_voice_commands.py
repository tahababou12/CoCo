#!/usr/bin/env python3
"""
Test script to verify all voice commands work by simulating WebSocket messages
"""

import json
import asyncio
import websockets
import time

async def test_voice_commands():
    """Test all voice commands by simulating backend messages"""
    
    uri = "ws://localhost:8765"
    
    try:
        async with websockets.connect(uri) as websocket:
            print("🔌 Connected to WebSocket server")
            
            # Test all the commands
            test_commands = [
                # Panel Control - OPEN
                {"type": "app_control", "action": "open_panel", "target": "layers"},
                {"type": "app_control", "action": "open_panel", "target": "storyboard"},
                {"type": "app_control", "action": "open_panel", "target": "tools"},
                {"type": "app_control", "action": "open_panel", "target": "collaboration"},
                {"type": "app_control", "action": "open_panel", "target": "grid"},
                
                # Panel Control - CLOSE
                {"type": "app_control", "action": "close_panel", "target": "layers"},
                {"type": "app_control", "action": "close_panel", "target": "storyboard"},
                {"type": "app_control", "action": "close_panel", "target": "tools"},
                {"type": "app_control", "action": "close_panel", "target": "collaboration"},
                {"type": "app_control", "action": "close_panel", "target": "grid"},
                
                # Tool Switching
                {"type": "app_control", "action": "switch_tool", "target": "brush"},
                {"type": "app_control", "action": "switch_tool", "target": "pen"},
                {"type": "app_control", "action": "switch_tool", "target": "eraser"},
                {"type": "app_control", "action": "switch_tool", "target": "pencil"},
                
                # Canvas Operations
                {"type": "app_control", "action": "undo"},
                {"type": "app_control", "action": "redo"},
                {"type": "app_control", "action": "save_drawing"},
                {"type": "clear_canvas", "command_detected": "clear"},
                
                # Personality Switching
                {"type": "switch_personality", "personality": "sarcastic"},
                {"type": "switch_personality", "personality": "friendly"},
            ]
            
            print(f"\n🧪 Testing {len(test_commands)} voice commands...")
            
            for i, command in enumerate(test_commands, 1):
                print(f"\n{i:2d}. Testing: {command['type']} - {command.get('action', 'N/A')} - {command.get('target', 'N/A')}")
                
                # Send the command
                await websocket.send(json.dumps(command))
                print(f"    ✅ Sent command")
                
                # Wait a bit for processing
                await asyncio.sleep(0.5)
                
                # Try to receive any response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    print(f"    📨 Response: {response}")
                except asyncio.TimeoutError:
                    print(f"    ⏰ No response (timeout)")
                except Exception as e:
                    print(f"    ❌ Error receiving response: {e}")
            
            print(f"\n🎉 Voice command testing completed!")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🧪 Voice Command Test Script")
    print("=" * 40)
    print("This script tests all voice commands by simulating")
    print("the WebSocket messages that would be sent from the backend.")
    print("\nMake sure:")
    print("1. Backend server is running on port 8765")
    print("2. Frontend is connected to the WebSocket")
    print("3. You're watching the frontend console for responses")
    print("\nStarting tests in 3 seconds...")
    
    time.sleep(3)
    asyncio.run(test_voice_commands())

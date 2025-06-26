#!/usr/bin/env python3
"""
Test script to verify the voice enhancement workflow
"""

import asyncio
import websockets
import json
import time

async def test_voice_enhancement_workflow():
    """Test the complete voice enhancement workflow"""
    
    print("🧪 Testing Voice Enhancement Workflow")
    print("=" * 50)
    
    # Test 1: Check if multimodal server is running
    print("\n1️⃣ Testing multimodal server connection...")
    try:
        async with websockets.connect('ws://localhost:9083') as websocket:
            print("✅ Connected to multimodal server")
            
            # Send setup message
            setup_message = {
                "setup": {
                    "generation_config": { "response_modalities": ["AUDIO", "TEXT"] }
                }
            }
            await websocket.send(json.dumps(setup_message))
            print("✅ Sent setup message")
            
            # Wait for initial response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"✅ Received response: {response[:100]}...")
            except asyncio.TimeoutError:
                print("⚠️ No initial response received (this might be normal)")
            
            # Test 2: Send a save_and_enhance message (simulating voice command)
            print("\n2️⃣ Testing save_and_enhance message...")
            enhance_message = {
                "type": "save_and_enhance",
                "prompt": "Enhance this drawing with more detail"
            }
            await websocket.send(json.dumps(enhance_message))
            print("✅ Sent save_and_enhance message")
            
            # Wait for enhancement response
            try:
                response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                response_data = json.loads(response)
                print(f"✅ Received enhancement response: {response_data}")
                
                if response_data.get("type") == "enhancement_started":
                    print("🎉 Enhancement started successfully!")
                    print(f"   Request ID: {response_data.get('requestId')}")
                elif response_data.get("type") == "enhancement_error":
                    print(f"❌ Enhancement failed: {response_data.get('error')}")
                else:
                    print(f"⚠️ Unexpected response type: {response_data.get('type')}")
                    
            except asyncio.TimeoutError:
                print("❌ No enhancement response received within timeout")
            except json.JSONDecodeError:
                print(f"⚠️ Received non-JSON response: {response}")
            
            # Test 3: Check enhancement status
            print("\n3️⃣ Testing enhancement status...")
            if 'requestId' in locals() and response_data.get("type") == "enhancement_started":
                request_id = response_data.get('requestId')
                print(f"   Checking status for request ID: {request_id}")
                
                # Wait a bit for processing
                await asyncio.sleep(2)
                
                # This would normally be done by the frontend polling
                print("   (Frontend would poll for status here)")
            
    except Exception as e:
        print(f"❌ Error testing multimodal server: {e}")
        return False
    
    print("\n✅ Voice enhancement workflow test completed!")
    return True

if __name__ == "__main__":
    asyncio.run(test_voice_enhancement_workflow()) 
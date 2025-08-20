#!/usr/bin/env python3
"""
Test script to connect to the real server and see what Gemini actually generates for a dragon
"""

import asyncio
import websockets
import json
import os

async def test_real_dragon_generation():
    """Connect to real server and test dragon generation"""
    
    print("🐉 Testing Real Dragon Generation with Gemini Live API")
    print("=" * 60)
    
    try:
        # Connect to the server
        uri = "ws://localhost:9083"
        print(f"Connecting to {uri}...")
        
        async with websockets.connect(uri) as websocket:
            print("✅ Connected to server!")
            
            # Enable AI collaboration first
            print("\n1. Enabling AI collaboration...")
            await asyncio.sleep(1)
            
            # Simulate the drawing request (this would normally come from voice)
            # We'll directly call the AI drawing functions to see what Gemini generates
            print("2. Testing dragon generation...")
            
            # Import the function to test directly
            import sys
            sys.path.append('/Users/sakethpoori/Documents/hacks/CoCo/backend')
            
            try:
                from multimodal_server_context_aware import gemini_generate_drawing_plan
                
                # Test what Gemini actually generates for a dragon
                print("🧠 Calling Gemini to generate dragon plan...")
                
                # Import and set up Gemini client directly
                import google.generativeai as genai
                import os
                
                GOOGLE_API_KEY = os.getenv('GOOGLE_API_KEY')
                if not GOOGLE_API_KEY:
                    print("❌ No Google API key found")
                    return
                
                genai.configure(api_key=GOOGLE_API_KEY)
                model = genai.GenerativeModel('gemini-1.5-flash')
                
                prompt = """
                The user wants to draw: "dragon"
                
                You are an AI artist. Generate a complete drawing plan with EXACT coordinates, drawing operations, AND a cursor path.
                Don't just describe it - give me the actual drawing commands to execute.
                
                Output this exact JSON format:
                {
                    "drawing_operations": [
                        {"type": "circle", "x": 100, "y": 100, "radius": 25, "color": "#FF6B6B", "description": "what this creates"},
                        {"type": "line", "start_x": 100, "start_y": 100, "end_x": 200, "end_y": 200, "color": "#4ECDC4", "width": 2, "description": "what this creates"},
                        {"type": "rectangle", "x": 50, "y": 50, "width": 100, "height": 80, "color": "#45B7D1", "description": "what this creates"}
                    ],
                    "cursor_path": [
                        {"x": 100, "y": 100, "delay": 0.3, "description": "move to center"},
                        {"x": 200, "y": 200, "delay": 0.2, "description": "move to petal end"},
                        {"x": 50, "y": 50, "delay": 0.2, "description": "move to rectangle start"}
                    ]
                }
                
                The cursor_path shows where the AI cursor should move and how long to wait at each point.
                Use coordinates that make sense for an 800x600 canvas.
                Be creative and specific about what to draw.
                Include colors, sizes, and descriptions for each operation.
                
                For drawing a dragon:
                - Create a detailed dragon with multiple parts
                - Use various colors (reds, browns, oranges for fire effects)
                - Include head, body, wings, tail, maybe horns or spikes
                - Make it look impressive, not just a stick figure
                - Use at least 8-12 operations for good detail
                """
                
                try:
                    response = model.generate_content(prompt)
                    
                    # Extract JSON from response
                    import re
                    json_match = re.search(r'\{.*"drawing_operations".*\}', response.text, re.DOTALL)
                    if json_match:
                        json_str = json_match.group(0)
                        drawing_plan = json.loads(json_str)
                    else:
                        print("❌ No JSON found in Gemini's response")
                        print(f"Raw response: {response.text}")
                        drawing_plan = None
                        
                except Exception as e:
                    print(f"❌ Error calling Gemini: {e}")
                    drawing_plan = None
                
                if drawing_plan:
                    print("\n🎨 Gemini Generated Dragon Plan:")
                    print("=" * 50)
                    
                    operations = drawing_plan.get("drawing_operations", [])
                    cursor_path = drawing_plan.get("cursor_path", [])
                    
                    print(f"Drawing Operations: {len(operations)}")
                    for i, op in enumerate(operations, 1):
                        print(f"  {i}. {op.get('type', 'unknown')} - {op.get('description', 'no description')}")
                        if op.get('type') == 'circle':
                            print(f"     Position: ({op.get('x', 0)}, {op.get('y', 0)}), Radius: {op.get('radius', 0)}")
                        elif op.get('type') == 'line':
                            print(f"     From: ({op.get('start_x', 0)}, {op.get('start_y', 0)}) To: ({op.get('end_x', 0)}, {op.get('end_y', 0)})")
                        elif op.get('type') == 'rectangle':
                            print(f"     Position: ({op.get('x', 0)}, {op.get('y', 0)}), Size: {op.get('width', 0)}x{op.get('height', 0)}")
                        print(f"     Color: {op.get('color', 'none')}")
                    
                    print(f"\nCursor Path: {len(cursor_path)} points")
                    for i, point in enumerate(cursor_path, 1):
                        print(f"  {i}. Move to ({point.get('x', 0)}, {point.get('y', 0)}) - {point.get('description', 'no description')} - Delay: {point.get('delay', 0)}s")
                    
                    print("\n🎯 Dragon Quality Assessment:")
                    print("=" * 40)
                    
                    # Analyze the complexity
                    total_operations = len(operations)
                    unique_colors = len(set(op.get('color', '#000000') for op in operations))
                    has_details = any('eye' in op.get('description', '').lower() or 
                                    'wing' in op.get('description', '').lower() or
                                    'scale' in op.get('description', '').lower() for op in operations)
                    
                    print(f"Complexity: {total_operations} operations")
                    print(f"Color variety: {unique_colors} unique colors")
                    print(f"Has details: {'Yes' if has_details else 'No'}")
                    
                    if total_operations >= 10:
                        print("✅ Good complexity - detailed dragon")
                    elif total_operations >= 5:
                        print("⚠️ Medium complexity - basic dragon")
                    else:
                        print("❌ Low complexity - very simple dragon")
                    
                    if unique_colors >= 3:
                        print("✅ Good color variety")
                    else:
                        print("⚠️ Limited color variety")
                    
                    # Show the complete JSON for inspection
                    print(f"\n📋 Complete Dragon Plan JSON:")
                    print(json.dumps(drawing_plan, indent=2))
                    
                else:
                    print("❌ No dragon plan generated")
                    
            except Exception as e:
                print(f"❌ Error testing dragon generation: {e}")
                import traceback
                traceback.print_exc()
                
    except Exception as e:
        print(f"❌ Connection error: {e}")
        print("Make sure the server is running: python multimodal_server_context_aware.py")

if __name__ == "__main__":
    try:
        asyncio.run(test_real_dragon_generation())
    except KeyboardInterrupt:
        print("\n⏹️ Test interrupted")
    except Exception as e:
        print(f"\n💥 Test failed: {e}")

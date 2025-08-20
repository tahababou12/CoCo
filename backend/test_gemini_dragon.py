#!/usr/bin/env python3
"""
Direct test of what Gemini generates for a dragon drawing
"""

import json
import os
import re

def test_gemini_dragon():
    """Test what Gemini actually generates for a dragon"""
    
    print("🐉 Testing Real Gemini Dragon Generation")
    print("=" * 50)
    
    try:
        import google.generativeai as genai
        
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
        - Create a detailed dragon with multiple parts (head, body, wings, tail, horns, eyes, etc.)
        - Use various colors (reds, browns, oranges for fire effects, greens for scales)
        - Make it look impressive and detailed, not just a stick figure
        - Use at least 10-15 operations for good detail
        - Include interesting features like fire breath, detailed wings, spikes, etc.
        - Position elements realistically for dragon anatomy
        """
        
        print("🧠 Calling Gemini to generate dragon...")
        response = model.generate_content(prompt)
        
        print(f"📝 Raw Gemini Response:")
        print("-" * 30)
        print(response.text)
        print("-" * 30)
        
        # Extract JSON from response
        json_match = re.search(r'\{.*"drawing_operations".*\}', response.text, re.DOTALL)
        if json_match:
            json_str = json_match.group(0)
            drawing_plan = json.loads(json_str)
            
            print("\n🎨 Parsed Dragon Plan:")
            print("=" * 40)
            
            operations = drawing_plan.get("drawing_operations", [])
            cursor_path = drawing_plan.get("cursor_path", [])
            
            print(f"📊 Stats:")
            print(f"  - Drawing Operations: {len(operations)}")
            print(f"  - Cursor Path Points: {len(cursor_path)}")
            
            # Analyze complexity
            unique_colors = len(set(op.get('color', '#000000') for op in operations))
            shape_types = set(op.get('type', 'unknown') for op in operations)
            
            print(f"  - Unique Colors: {unique_colors}")
            print(f"  - Shape Types: {', '.join(shape_types)}")
            
            print(f"\n🐉 Dragon Parts:")
            for i, op in enumerate(operations, 1):
                shape_type = op.get('type', 'unknown')
                desc = op.get('description', 'no description')
                color = op.get('color', 'no color')
                
                if shape_type == 'circle':
                    pos = f"({op.get('x', 0)}, {op.get('y', 0)})"
                    size = f"radius {op.get('radius', 0)}"
                    print(f"  {i}. {shape_type.title()} at {pos}, {size} - {desc} ({color})")
                elif shape_type == 'line':
                    start = f"({op.get('start_x', 0)}, {op.get('start_y', 0)})"
                    end = f"({op.get('end_x', 0)}, {op.get('end_y', 0)})"
                    width = f"width {op.get('width', 1)}"
                    print(f"  {i}. {shape_type.title()} from {start} to {end}, {width} - {desc} ({color})")
                elif shape_type == 'rectangle':
                    pos = f"({op.get('x', 0)}, {op.get('y', 0)})"
                    size = f"{op.get('width', 0)}x{op.get('height', 0)}"
                    print(f"  {i}. {shape_type.title()} at {pos}, {size} - {desc} ({color})")
            
            print(f"\n🎯 Quality Assessment:")
            if len(operations) >= 12:
                print("✅ Excellent complexity - very detailed dragon!")
            elif len(operations) >= 8:
                print("✅ Good complexity - detailed dragon")
            elif len(operations) >= 5:
                print("⚠️ Medium complexity - basic dragon")
            else:
                print("❌ Low complexity - very simple dragon")
            
            if unique_colors >= 4:
                print("✅ Excellent color variety")
            elif unique_colors >= 3:
                print("✅ Good color variety")
            else:
                print("⚠️ Limited color variety")
            
            # Check for interesting features
            descriptions = [op.get('description', '').lower() for op in operations]
            features = []
            
            if any('eye' in desc for desc in descriptions):
                features.append("eyes")
            if any('wing' in desc for desc in descriptions):
                features.append("wings")
            if any('fire' in desc or 'flame' in desc for desc in descriptions):
                features.append("fire effects")
            if any('horn' in desc or 'spike' in desc for desc in descriptions):
                features.append("horns/spikes")
            if any('tail' in desc for desc in descriptions):
                features.append("tail")
            
            if features:
                print(f"✅ Includes: {', '.join(features)}")
            else:
                print("⚠️ Basic shapes only")
            
            print(f"\n📋 Complete JSON:")
            print(json.dumps(drawing_plan, indent=2))
            
        else:
            print("❌ No valid JSON found in Gemini's response")
            print("This means Gemini didn't follow the format correctly")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_gemini_dragon()

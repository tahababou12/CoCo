#!/usr/bin/env python3
"""
Test script for voice command detection patterns
"""

import re

# Voice command patterns for enhancement
ENHANCE_COMMANDS = [
    r'\b(?:enhance|improve|make better|upgrade)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)\b',
    r'\b(?:enhance|improve|make better|upgrade)\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)\b',
    r'\b(?:gemini|ai|artificial intelligence)\s+(?:enhance|improve|make better|upgrade)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\b',
    r'\b(?:enhance|improve|make better|upgrade)\s+(?:drawing|image|sketch|picture)\b',
    r'\b(?:enhance|improve|make better|upgrade)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\b',
    r'\b(?:enhance|improve|make better|upgrade)\s+(?:with\s+)?(?:more\s+)?(?:detail|artistic|style)\b'
]

def is_enhance_command(text):
    """Check if the given text matches any enhancement command pattern"""
    text_lower = text.lower().strip()
    for pattern in ENHANCE_COMMANDS:
        if re.search(pattern, text_lower):
            return True
    return False

def test_voice_commands():
    """Test various voice command phrases"""
    test_phrases = [
        "enhance this drawing with gemini",
        "enhance with gemini",
        "gemini enhance this drawing",
        "improve this image with ai",
        "make this sketch better with artificial intelligence",
        "upgrade this picture",
        "enhance drawing",
        "can you help me with this drawing",  # Should not match
        "what is this drawing about",  # Should not match
        "enhance this drawing with more detail",  # Should match
        "make this better with gemini",
        "ai enhance this image",
        "artificial intelligence improve this sketch"
    ]
    
    print("Testing voice command detection patterns:")
    print("=" * 50)
    
    for phrase in test_phrases:
        is_command = is_enhance_command(phrase)
        status = "✅ MATCH" if is_command else "❌ NO MATCH"
        print(f"{status}: '{phrase}'")
    
    print("\n" + "=" * 50)
    print("Voice command detection test complete!")

if __name__ == "__main__":
    test_voice_commands() 
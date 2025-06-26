#!/usr/bin/env python3
"""
Test script for voice command detection patterns
"""

import re

# Voice command patterns for enhancement
ENHANCE_COMMANDS = [
    # Handle common speech recognition errors (enhanced vs enhance)
    r'\b(?:enhance[d]?|improve[d]?|make better|upgrade[d]?)\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)\b',
    r'\b(?:gemini|ai|artificial intelligence)\s+(?:enhance[d]?|improve[d]?|make better|upgrade[d]?)\b',
    # More specific patterns with speech recognition variations
    r'\b(?:enhance[d]?|improve[d]?|make better|upgrade[d]?)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)\b',
    r'\b(?:gemini|ai|artificial intelligence)\s+(?:enhance[d]?|improve[d]?|make better|upgrade[d]?)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\b',
    r'\b(?:enhance[d]?|improve[d]?|make better|upgrade[d]?)\s+(?:drawing|image|sketch|picture)\b',
    r'\b(?:enhance[d]?|improve[d]?|make better|upgrade[d]?)\s+(?:this\s+)?(?:drawing|image|sketch|picture)\b',
    r'\b(?:enhance[d]?|improve[d]?|make better|upgrade[d]?)\s+(?:with\s+)?(?:more\s+)?(?:detail|artistic|style)\b',
    # Additional variations for common speech recognition errors
    r'\b(?:enhance[d]?\s+with\s+gemini|enhance[d]?\s+gemini)\b',
    r'\b(?:gemini\s+enhance[d]?|enhance[d]?\s+with\s+gemini)\b',
    r'\b(?:enhance[d]?\s+this\s+drawing|enhance[d]?\s+drawing)\b',
    r'\b(?:enhance[d]?\s+this\s+image|enhance[d]?\s+image)\b',
    r'\b(?:enhance[d]?\s+this\s+sketch|enhance[d]?\s+sketch)\b',
    r'\b(?:enhance[d]?\s+this\s+picture|enhance[d]?\s+picture)\b'
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
        "enhanced with gemini",  # Speech recognition variation
        "enhanced this drawing with gemini",  # Speech recognition variation
        "gemini enhance this drawing",
        "gemini enhanced this drawing",  # Speech recognition variation
        "improve this image with ai",
        "improved this image with ai",  # Speech recognition variation
        "make this sketch better with artificial intelligence",
        "upgrade this picture",
        "upgraded this picture",  # Speech recognition variation
        "enhance drawing",
        "enhanced drawing",  # Speech recognition variation
        "can you help me with this drawing",  # Should not match
        "what is this drawing about",  # Should not match
        "enhance this drawing with more detail",
        "enhanced this drawing with more detail",  # Speech recognition variation
        "make this better with gemini",
        "ai enhance this image",
        "ai enhanced this image",  # Speech recognition variation
        "artificial intelligence improve this sketch",
        "artificial intelligence improved this sketch"  # Speech recognition variation
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
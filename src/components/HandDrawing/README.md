# Hand Drawing Component

This folder contains the refactored hand gesture recognition and drawing system.

## Structure

The code is organized into the following files:

1. **HandDrawing.tsx** - Main component that handles hand tracking, gesture recognition, and drawing integration
2. **context/HandGestureContext.tsx** - Context provider for sharing hand gesture information across components
3. **types/handTracking.ts** - Shared types for hand tracking and gesture recognition
4. **utils/coordinates.ts** - Coordinate conversion utilities
5. **utils/handTracking.ts** - Hand tracking and gesture detection functions
6. **utils/cursor.ts** - Cursor management utilities

## Features

- MediaPipe-based hand tracking
- Gesture recognition for different drawing modes:
  - Drawing (index finger only)
  - Erasing (closed fist)
  - Clear All (middle finger only)
- Visual feedback with cursor overlay
- Smooth hand tracking with weighted point averaging
- Gesture stabilization to prevent accidental mode changes

## Usage

```tsx
// Import the component
import HandDrawing from './components/HandDrawing';

// Use in your application
<HandDrawing />
```

## Extending

To add new gestures, modify the `determineHandMode` function in `utils/handTracking.ts`. 
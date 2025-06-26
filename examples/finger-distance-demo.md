# Finger Distance Tracking with MediaPipe

MediaPipe can absolutely track the distance between your fingers! This project now includes comprehensive finger distance tracking functionality that can detect various hand gestures and finger positions.

## Features

### 1. **Peace Sign Detection** ✌️
- Detects when index and middle fingers are extended and separated
- Differentiates between "peace sign" (fingers separated) vs "fingers stuck together"

### 2. **Finger Distance Measurements**
- Calculates real-time distances between all finger tips
- Provides normalized distance values (0.0 to 1.0 range)
- Tracks: thumb-index, index-middle, middle-ring, ring-pinky, and all other combinations

### 3. **Gesture Analysis**
- **Peace Sign (Separated)**: ✌️ Index and middle extended and apart
- **Peace Sign (Stuck Together)**: 🤏 Index and middle extended but close together
- **All Fingers Together**: All fingertips are close to each other
- **Individual Finger Pairs**: Detect any two fingers being close together

## How It Works

### MediaPipe Hand Landmarks
MediaPipe provides 21 hand landmarks including:
- **Index Finger Tip**: Landmark 8
- **Middle Finger Tip**: Landmark 12
- **Ring Finger Tip**: Landmark 16
- **Pinky Tip**: Landmark 20
- **Thumb Tip**: Landmark 4

### Distance Calculation
```typescript
// 2D distance between two landmarks
const distance = Math.sqrt(
  (landmark1.x - landmark2.x)² + 
  (landmark1.y - landmark2.y)²
);
```

## Usage Examples

### Basic Finger Distance Tracking
```typescript
import { getFingerTipDistances, analyzeFingerSeparation } from './utils/fingerDistance';

// In your MediaPipe results handler
const distances = getFingerTipDistances(landmarks);
console.log('Index-Middle distance:', distances.index_middle);

// Analyze finger separation patterns
const analysis = analyzeFingerSeparation(landmarks);
console.log('Peace sign detected:', analysis.peaceSeparated);
console.log('Fingers stuck together:', analysis.peaceStuckTogether);
```

### Peace Sign Detection
```typescript
import { detectPeaceSign } from './utils/fingerDistance';

const isPeaceSign = detectPeaceSign(landmarks);
if (isPeaceSign) {
  console.log('✌️ Peace sign detected!');
}
```

### Custom Gesture Detection
```typescript
import { detectFingerProximity } from './utils/fingerDistance';

const proximity = detectFingerProximity(landmarks, 0.03); // 0.03 threshold
if (proximity.indexMiddleTogether) {
  console.log('🤏 Index and middle fingers are close together');
}
```

## Live Demo

When you enable hand tracking in the application, you'll see a **"Finger Distance Tracking"** panel that shows:

1. **Real-time peace sign detection** with visual feedback
2. **Finger separation analysis** showing different gesture states
3. **Live distance measurements** between all finger pairs
4. **Visual indicators** for "stuck together" vs "separated" fingers

## Threshold Values

- **Close Together**: Distance < 0.03 (normalized units)
- **Separated**: Distance > 0.05 (normalized units)
- **Normal**: Distance between 0.03 and 0.05

## Practical Applications

### 1. Gesture Control
```typescript
// Use peace sign to trigger actions
if (analysis.peaceSeparated) {
  triggerPeaceSignAction();
}

// Use pinched fingers for precision control
if (analysis.fingerProximity.indexMiddleTogether) {
  enterPrecisionMode();
}
```

### 2. Sign Language Recognition
```typescript
// Detect specific hand shapes for sign language
const distances = getFingerTipDistances(landmarks);
if (distances.index_middle < 0.02 && distances.middle_ring > 0.06) {
  console.log('Possible letter formation detected');
}
```

### 3. Interactive Applications
```typescript
// Different interactions based on finger proximity
if (proximity.allFingersTogether) {
  // Fist-like gesture
  activateGrabMode();
} else if (proximity.indexMiddleTogether) {
  // Pinch gesture
  activatePinchMode();
}
```

## Try It Now!

1. Enable hand tracking in the application
2. Look for the "Finger Distance Tracking 🤏" panel
3. Try these gestures:
   - ✌️ Peace sign with fingers separated
   - 🤏 Index and middle fingers stuck together
   - 👆 Single finger pointing
   - ✊ Closed fist
   - 🖐️ Open palm

The panel will show real-time distance measurements and gesture detection!

## Technical Notes

- Uses MediaPipe's normalized coordinate system (0.0 to 1.0)
- 2D distance calculation for reliable detection
- Smoothing applied to reduce jitter
- Configurable threshold values for different sensitivity levels
- Works with both single and dual hand tracking modes 
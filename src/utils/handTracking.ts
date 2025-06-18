import { HandLandmark, HandMode, SmoothingBuffer } from '../types/handTracking';
import { Point } from '../types';

// Define a type for finger state
export interface FingerState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  handType: 'Left' | 'Right' | 'None';
}

// Determine hand mode from MediaPipe hand landmarks
export const determineHandMode = (landmarks: HandLandmark[]): { mode: HandMode, fingerState: FingerState } => {
  // Calculate finger states - are they extended or not?
  const fingersExtended = [];
  
  // For thumb (using different method)
  // Thumb is extended if the tip is to the left of the IP joint for right hand 
  // or to the right for left hand (simplified)
  const thumbTip = landmarks[4];
  const thumbIP = landmarks[3];
  const wrist = landmarks[0];
  const middleMCP = landmarks[9]; // Use middle finger MCP as reference
  
  // Detect if this is a left or right hand
  const isRightHand = wrist.x < middleMCP.x;
  
  // Check if thumb is extended 
  // For right hand: thumbTip.x < thumbIP.x
  // For left hand: thumbTip.x > thumbIP.x
  const thumbExtended = isRightHand ? thumbTip.x > thumbIP.x : thumbTip.x < thumbIP.x;
  fingersExtended.push(thumbExtended);
  
  // For index finger (8 is tip, 6 is PIP joint)
  // Check if index finger is extended using both comparisons for reliability
  const indexTip = landmarks[8];
  const indexPIP = landmarks[6]; 
  const indexMCP = landmarks[5];
  // Use both typical method (tip above PIP) and more generous threshold from MCP
  const indexExtended = indexTip.y < indexPIP.y || indexTip.y < indexMCP.y - 0.03;
  fingersExtended.push(indexExtended);
  
  // For middle finger (12 is tip, 10 is PIP joint)
  const middleExtended = landmarks[12].y < landmarks[10].y;
  fingersExtended.push(middleExtended);
  
  // For ring finger (16 is tip, 14 is PIP joint)
  const ringExtended = landmarks[16].y < landmarks[14].y;
  fingersExtended.push(ringExtended);
  
  // For pinky finger (20 is tip, 18 is PIP joint)
  const pinkyExtended = landmarks[20].y < landmarks[18].y;
  fingersExtended.push(pinkyExtended);
  
  // Create finger state object
  const fingerState: FingerState = {
    thumb: thumbExtended,
    index: indexExtended,
    middle: middleExtended,
    ring: ringExtended,
    pinky: pinkyExtended,
    handType: isRightHand ? 'Right' : 'Left'
  };
  
  // Log finger states for debugging
  console.log('Finger states:', {
    thumb: thumbExtended ? 'Extended' : 'Closed',
    index: indexExtended ? 'Extended' : 'Closed',
    middle: middleExtended ? 'Extended' : 'Closed',
    ring: ringExtended ? 'Extended' : 'Closed',
    pinky: pinkyExtended ? 'Extended' : 'Closed',
    handType: isRightHand ? 'Right hand' : 'Left hand'
  });
  
  // FEATURE 1: DRAGGING MODE - Thumb, index, and middle fingers extended (ring and pinky closed)
  if (fingersExtended[0] && fingersExtended[1] && fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
    console.log('GESTURE DETECTED: Dragging mode');
    return { mode: 'Dragging', fingerState };
  }
  // FEATURE 2: PIXEL ERASING MODE - Index and middle fingers extended (thumb, ring, and pinky closed)
  else if (!fingersExtended[0] && fingersExtended[1] && fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
    console.log('GESTURE DETECTED: Object Erasing mode');
    return { mode: 'ObjectErasing', fingerState };
  }
  // FEATURE 3: DRAWING MODE - Only index finger is extended
  // Allow thumb to be slightly extended for more reliable detection
  else if (!fingersExtended[0] && fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
    console.log('GESTURE DETECTED: Drawing mode');
    return { mode: 'Drawing', fingerState };
  }
  // FEATURE 4: CLICKING MODE - Closed fist (no fingers extended)
  else if (!fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
    console.log('GESTURE DETECTED: Clicking mode');
    return { mode: 'Clicking', fingerState };
  }
  // FEATURE 5: CLEARING MODE - Thumb and pinky extended (other fingers closed)
  // Be more lenient on the detection for a more natural gesture
  else if (fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && fingersExtended[4]) {
    console.log('GESTURE DETECTED: Clearing mode (thumb and pinky extended)');
    return { mode: 'Clearing', fingerState };
  }
  else {
    // Any other hand position
    console.log('GESTURE DETECTED: None (unrecognized gesture)');
    return { mode: 'None', fingerState };
  }
};

// Helper function to get a smoothed point
export const getSmoothPoint = (buffer: SmoothingBuffer, currentPoint: Point): Point => {
  // Add current point to buffer
  buffer.points.push({ ...currentPoint });
  
  // Keep buffer size limited
  if (buffer.points.length > buffer.maxSize) {
    buffer.points.shift();
  }
  
  // With fewer than 2 points, can't smooth effectively
  if (buffer.points.length < 2) {
    return currentPoint;
  }
  
  // Calculate the weighted average (more recent points have higher weight)
  let totalX = 0;
  let totalY = 0;
  let totalWeight = 0;
  
  buffer.points.forEach((point, idx) => {
    // Weight increases with index (newer points)
    const weight = idx + 1;
    totalX += point.x * weight;
    totalY += point.y * weight;
    totalWeight += weight;
  });
  
  return {
    x: totalX / totalWeight,
    y: totalY / totalWeight
  };
};

// Helper function to get the stable hand mode
export const getStableHandMode = (
  buffer: SmoothingBuffer, 
  currentMode: HandMode,
  lastClearTime: number
): { mode: HandMode, newLastClearTime: number } => {
  // Add current mode to history
  buffer.modeHistory.push(currentMode);
  
  // Keep history size limited
  if (buffer.modeHistory.length > buffer.maxSize) {
    buffer.modeHistory.shift();
  }
  
  // With fewer than 3 modes, just use the current mode
  if (buffer.modeHistory.length < 3) {
    return { mode: currentMode, newLastClearTime: lastClearTime };
  }
  
  // Count occurrences of each mode
  let drawingCount = 0;
  let clickingCount = 0;
  let draggingCount = 0;
  let clearingCount = 0;
  let objectErasingCount = 0;
  let noneCount = 0;
  
  buffer.modeHistory.forEach(mode => {
    if (mode === 'Drawing') drawingCount++;
    else if (mode === 'Clicking') clickingCount++;
    else if (mode === 'Dragging') draggingCount++;
    else if (mode === 'Clearing') clearingCount++;
    else if (mode === 'ObjectErasing') objectErasingCount++;
    else if (mode === 'None') noneCount++;
  });
  
  // If clearing mode is detected multiple times in a row, prioritize it
  // But only allow clearing once every 3 seconds to avoid rapid multiple clears
  const now = Date.now();
  if (clearingCount >= 2 && now - lastClearTime > 3000) {
    console.log('Clearing mode detected consistently - triggering clear all');
    return { mode: 'Clearing', newLastClearTime: now };
  }
  
  // If object erasing mode is detected even just a few times, prioritize it
  // This makes object erasing mode more responsive
  if (objectErasingCount >= 2 && buffer.modeHistory.length >= 3) {
    return { mode: 'ObjectErasing', newLastClearTime: lastClearTime };
  }
  
  // If drawing mode is detected even just a few times, prioritize it
  // This makes drawing mode more responsive
  if (drawingCount >= 2 && buffer.modeHistory.length >= 3) {
    return { mode: 'Drawing', newLastClearTime: lastClearTime };
  }
  
  // If dragging mode is detected consistently, prioritize it
  if (draggingCount >= 3 && buffer.modeHistory.length >= 5) {
    return { mode: 'Dragging', newLastClearTime: lastClearTime };
  }
  
  // Find the most common mode
  let mostCommonMode: HandMode = 'None';
  let maxCount = noneCount;
  
  if (drawingCount > maxCount) {
    maxCount = drawingCount;
    mostCommonMode = 'Drawing';
  }
  
  if (objectErasingCount > maxCount) {
    maxCount = objectErasingCount;
    mostCommonMode = 'ObjectErasing';
  }
  
  if (clickingCount > maxCount) {
    maxCount = clickingCount;
    mostCommonMode = 'Clicking';
  }
  
  if (clearingCount > maxCount) {
    maxCount = clearingCount;
    mostCommonMode = 'Clearing';
  }
  
  return { mode: mostCommonMode, newLastClearTime: lastClearTime };
}; 
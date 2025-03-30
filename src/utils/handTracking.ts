import { HandLandmark, HandMode, SmoothingBuffer } from '../types/handTracking';
import { Point } from '../types';

// Determine hand mode from MediaPipe hand landmarks
export const determineHandMode = (landmarks: HandLandmark[]): HandMode => {
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
  const thumbExtended = isRightHand ? thumbTip.x < thumbIP.x : thumbTip.x > thumbIP.x;
  fingersExtended.push(thumbExtended);
  
  // For index finger (8 is tip, 6 is PIP joint)
  fingersExtended.push(landmarks[8].y < landmarks[6].y);
  
  // For middle finger (12 is tip, 10 is PIP joint)
  fingersExtended.push(landmarks[12].y < landmarks[10].y);
  
  // For ring finger (16 is tip, 14 is PIP joint)
  fingersExtended.push(landmarks[16].y < landmarks[14].y);
  
  // For pinky finger (20 is tip, 18 is PIP joint)
  fingersExtended.push(landmarks[20].y < landmarks[18].y);
  
  // FEATURE 1: DRAWING MODE - Only index finger is extended
  if (!fingersExtended[0] && fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
    return 'Drawing';
  }
  // FEATURE 2: ERASING MODE - Closed fist (no fingers extended)
  else if (!fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
    return 'Erasing';
  }
  // FEATURE 3: CLEAR ALL - Only pinky finger extended
  else if (!fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && fingersExtended[4]) {
    return 'Clear All';
  }
  else {
    // Any other hand position
    return 'None';
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
  lastClearTime: number,
  clearCooldownMs: number
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
  let erasingCount = 0;
  let clearAllCount = 0;
  let noneCount = 0;
  
  buffer.modeHistory.forEach(mode => {
    if (mode === 'Drawing') drawingCount++;
    else if (mode === 'Erasing') erasingCount++;
    else if (mode === 'Clear All') clearAllCount++;
    else if (mode === 'None') noneCount++;
  });
  
  // Find the most common mode
  let mostCommonMode: HandMode = 'None';
  let maxCount = noneCount;
  
  if (drawingCount > maxCount) {
    maxCount = drawingCount;
    mostCommonMode = 'Drawing';
  }
  
  if (erasingCount > maxCount) {
    maxCount = erasingCount;
    mostCommonMode = 'Erasing';
  }
  
  if (clearAllCount > maxCount) {
    maxCount = clearAllCount;
    mostCommonMode = 'Clear All';
  }
  
  // Clear All needs special handling to avoid accidental triggering
  if (mostCommonMode === 'Clear All') {
    const now = Date.now();
    // If we've recently cleared, don't allow another clear yet
    if (now - lastClearTime < clearCooldownMs) {
      // Find the next most common mode
      if (drawingCount >= erasingCount && drawingCount >= noneCount) {
        return { mode: 'Drawing', newLastClearTime: lastClearTime };
      } else if (erasingCount >= drawingCount && erasingCount >= noneCount) {
        return { mode: 'Erasing', newLastClearTime: lastClearTime };
      } else {
        return { mode: 'None', newLastClearTime: lastClearTime };
      }
    } else {
      // Update the last clear time
      return { mode: 'Clear All', newLastClearTime: now };
    }
  }
  
  return { mode: mostCommonMode, newLastClearTime: lastClearTime };
}; 
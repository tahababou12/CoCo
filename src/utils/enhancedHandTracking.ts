import { Point } from '../types';
import { HandMode } from '../types/handTracking';

export interface TwoHandGesture {
  leftHand: Point | null;
  rightHand: Point | null;
  gestureType: 'pinch-zoom' | 'two-hand-draw' | 'shape-create' | 'none';
  distance: number;
  center: Point | null;
}

export interface PressureData {
  handDistance: number;
  normalizedPressure: number; // 0-1
  brushSize: number;
  opacity: number;
}

// Calculate pressure based on hand distance from camera
export const calculatePressure = (handZ: number, baseSize: number = 10): PressureData => {
  // Normalize hand distance (closer = higher pressure)
  // MediaPipe z values are typically between -0.1 and 0.1
  const normalizedDistance = Math.max(0, Math.min(1, (handZ + 0.1) / 0.2));
  const pressure = 1 - normalizedDistance; // Invert so closer = higher pressure
  
  // Calculate dynamic brush size (closer hand = bigger brush)
  const brushSize = baseSize + (pressure * baseSize * 2);
  
  // Calculate opacity (closer hand = more opaque)
  const opacity = 0.3 + (pressure * 0.7);
  
  return {
    handDistance: handZ,
    normalizedPressure: pressure,
    brushSize: Math.round(brushSize),
    opacity: Math.round(opacity * 100) / 100
  };
};

// Detect two-hand gestures
export const detectTwoHandGesture = (
  leftHand: Point | null, 
  rightHand: Point | null
): TwoHandGesture => {
  if (!leftHand || !rightHand) {
    return {
      leftHand,
      rightHand,
      gestureType: 'none',
      distance: 0,
      center: null
    };
  }

  // Calculate distance between hands
  const distance = Math.sqrt(
    Math.pow(rightHand.x - leftHand.x, 2) + 
    Math.pow(rightHand.y - leftHand.y, 2)
  );

  // Calculate center point
  const center: Point = {
    x: (leftHand.x + rightHand.x) / 2,
    y: (leftHand.y + rightHand.y) / 2
  };

  // Determine gesture type based on distance and positioning
  let gestureType: TwoHandGesture['gestureType'] = 'none';

  if (distance < 100) {
    gestureType = 'pinch-zoom';
  } else if (distance > 200 && distance < 400) {
    gestureType = 'shape-create';
  } else if (distance > 100 && distance < 200) {
    gestureType = 'two-hand-draw';
  }

  return {
    leftHand,
    rightHand,
    gestureType,
    distance,
    center
  };
};

// Create perfect shapes using two hands
export const createTwoHandShape = (
  leftHand: Point,
  rightHand: Point,
  shapeType: 'rectangle' | 'ellipse' | 'line'
): { startPoint: Point; endPoint: Point; perfectShape: boolean } => {
  const distance = Math.sqrt(
    Math.pow(rightHand.x - leftHand.x, 2) + 
    Math.pow(rightHand.y - leftHand.y, 2)
  );

  let startPoint = leftHand;
  let endPoint = rightHand;
  let perfectShape = false;

  switch (shapeType) {
    case 'rectangle':
      // For rectangles, use hands as opposite corners
      perfectShape = true;
      break;
      
    case 'ellipse':
      // For ellipses, hands define the bounding box
      perfectShape = true;
      break;
      
    case 'line':
      // For lines, hands are start and end points
      perfectShape = true;
      break;
  }

  return { startPoint, endPoint, perfectShape };
};

// Gesture-based tool selection
export const detectToolGesture = (fingerStates: boolean[]): string | null => {
  const [thumb, index, middle, ring, pinky] = fingerStates;

  // One finger = pencil
  if (!thumb && index && !middle && !ring && !pinky) {
    return 'pencil';
  }
  
  // Two fingers = brush
  if (!thumb && index && middle && !ring && !pinky) {
    return 'brush';
  }
  
  // Three fingers = eraser
  if (!thumb && index && middle && ring && !pinky) {
    return 'eraser';
  }
  
  // Open hand = select
  if (thumb && index && middle && ring && pinky) {
    return 'select';
  }
  
  // Fist = pan
  if (!thumb && !index && !middle && !ring && !pinky) {
    return 'pan';
  }

  return null;
};

// Air writing detection for text input
export const detectAirWriting = (
  handPositions: Point[],
  minPoints: number = 10
): { isWriting: boolean; text: string; confidence: number } => {
  if (handPositions.length < minPoints) {
    return { isWriting: false, text: '', confidence: 0 };
  }

  // Simple pattern recognition for basic letters
  // This is a simplified version - in practice, you'd use ML models
  const patterns = analyzeHandPath(handPositions);
  
  // Check if movement pattern resembles writing
  const isWriting = patterns.hasHorizontalMovement && 
                   patterns.hasVerticalVariation && 
                   patterns.smoothness > 0.5;

  // Simple character recognition (very basic)
  let recognizedText = '';
  if (patterns.isCircular) {
    recognizedText = 'O';
  } else if (patterns.isVerticalLine) {
    recognizedText = 'I';
  } else if (patterns.isHorizontalLine) {
    recognizedText = '-';
  }

  return {
    isWriting,
    text: recognizedText,
    confidence: patterns.smoothness
  };
};

// Analyze hand movement patterns
const analyzeHandPath = (points: Point[]) => {
  if (points.length < 3) {
    return {
      hasHorizontalMovement: false,
      hasVerticalVariation: false,
      smoothness: 0,
      isCircular: false,
      isVerticalLine: false,
      isHorizontalLine: false
    };
  }

  let totalHorizontalMovement = 0;
  let totalVerticalMovement = 0;
  let directionChanges = 0;
  
  const startPoint = points[0];
  const endPoint = points[points.length - 1];

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    
    totalHorizontalMovement += Math.abs(curr.x - prev.x);
    totalVerticalMovement += Math.abs(curr.y - prev.y);
    
    // Count direction changes for smoothness
    if (i > 1) {
      const prevDirection = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const currDirection = Math.atan2(points[i].y - curr.y, points[i].x - curr.x);
      const angleDiff = Math.abs(prevDirection - currDirection);
      
      if (angleDiff > Math.PI / 4) { // 45 degrees
        directionChanges++;
      }
    }
  }

  const totalMovement = totalHorizontalMovement + totalVerticalMovement;
  const smoothness = totalMovement > 0 ? 1 - (directionChanges / points.length) : 0;

  // Check for specific patterns
  const width = Math.abs(endPoint.x - startPoint.x);
  const height = Math.abs(endPoint.y - startPoint.y);
  
  const isCircular = Math.abs(width - height) < 20 && 
                    totalMovement > 100 && 
                    Math.abs(endPoint.x - startPoint.x) < 30 && 
                    Math.abs(endPoint.y - startPoint.y) < 30;
                    
  const isVerticalLine = width < 20 && height > 50;
  const isHorizontalLine = height < 20 && width > 50;

  return {
    hasHorizontalMovement: totalHorizontalMovement > 50,
    hasVerticalVariation: totalVerticalMovement > 20,
    smoothness,
    isCircular,
    isVerticalLine,
    isHorizontalLine
  };
};

// Stabilize hand position using smoothing
export const stabilizeHandPosition = (
  currentPosition: Point,
  previousPositions: Point[],
  maxHistory: number = 5
): Point => {
  // Add current position to history
  const history = [...previousPositions, currentPosition].slice(-maxHistory);
  
  // Calculate weighted average (more recent positions have higher weight)
  let totalWeight = 0;
  let weightedX = 0;
  let weightedY = 0;
  
  history.forEach((pos, index) => {
    const weight = (index + 1) / history.length; // Linear weighting
    weightedX += pos.x * weight;
    weightedY += pos.y * weight;
    totalWeight += weight;
  });
  
  return {
    x: weightedX / totalWeight,
    y: weightedY / totalWeight
  };
};

// Enhanced gesture confidence scoring
export const calculateGestureConfidence = (
  fingerStates: boolean[],
  handStability: number,
  detectionHistory: HandMode[]
): number => {
  // Base confidence from finger detection clarity
  let confidence = handStability;
  
  // Boost confidence if gesture has been consistent
  if (detectionHistory.length >= 3) {
    const recentGestures = detectionHistory.slice(-3);
    const isConsistent = recentGestures.every(gesture => gesture === recentGestures[0]);
    
    if (isConsistent) {
      confidence = Math.min(1.0, confidence + 0.3);
    }
  }
  
  // Penalize for ambiguous finger positions
  const ambiguousFingers = fingerStates.filter(state => state === undefined).length;
  confidence -= ambiguousFingers * 0.1;
  
  return Math.max(0, Math.min(1, confidence));
}; 
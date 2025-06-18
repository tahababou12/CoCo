import { HandLandmark } from '../types/handTracking';

// MediaPipe Hand Landmark indices
export const HAND_LANDMARKS = {
  WRIST: 0,
  
  // Thumb
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  
  // Index finger
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  
  // Middle finger
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  
  // Ring finger
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  
  // Pinky
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20
};

/**
 * Type definition for finger proximity analysis
 */
export interface FingerProximity {
  isPeaceSign: boolean;
  allFingersTogether: boolean;
  thumbIndexTogether: boolean;
  indexMiddleTogether: boolean;
  middleRingTogether: boolean;
  ringPinkyTogether: boolean;
  distances: { [key: string]: number };
}

/**
 * Type definition for finger separation analysis
 */
export interface FingerSeparationAnalysis {
  peaceSeparated: boolean;
  peaceStuckTogether: boolean;
  fingerProximity: FingerProximity;
  fingerDistances: { [key: string]: number };
}

/**
 * Calculate the Euclidean distance between two hand landmarks
 */
export const calculateDistance = (
  landmark1: HandLandmark, 
  landmark2: HandLandmark
): number => {
  const dx = landmark1.x - landmark2.x;
  const dy = landmark1.y - landmark2.y;
  const dz = landmark1.z - landmark2.z;
  
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Calculate the 2D distance between two hand landmarks (ignoring Z)
 */
export const calculate2DDistance = (
  landmark1: HandLandmark, 
  landmark2: HandLandmark
): number => {
  const dx = landmark1.x - landmark2.x;
  const dy = landmark1.y - landmark2.y;
  
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Get distances between all finger tips
 */
export const getFingerTipDistances = (landmarks: HandLandmark[]) => {
  const fingerTips = [
    landmarks[HAND_LANDMARKS.THUMB_TIP],
    landmarks[HAND_LANDMARKS.INDEX_TIP],
    landmarks[HAND_LANDMARKS.MIDDLE_TIP],
    landmarks[HAND_LANDMARKS.RING_TIP],
    landmarks[HAND_LANDMARKS.PINKY_TIP]
  ];
  
  const distances: { [key: string]: number } = {};
  const fingerNames = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  
  for (let i = 0; i < fingerTips.length; i++) {
    for (let j = i + 1; j < fingerTips.length; j++) {
      const distance = calculate2DDistance(fingerTips[i], fingerTips[j]);
      const key = `${fingerNames[i]}_${fingerNames[j]}`;
      distances[key] = distance;
    }
  }
  
  return distances;
};

/**
 * Detect if fingers are close together (forming specific gestures)
 */
export const detectFingerProximity = (landmarks: HandLandmark[], threshold: number = 0.03): FingerProximity => {
  const distances = getFingerTipDistances(landmarks);
  
  return {
    // Peace sign: Index and middle together, others separated
    isPeaceSign: distances.index_middle < threshold && 
                 distances.index_ring > threshold && 
                 distances.middle_ring > threshold,
    
    // All fingers together
    allFingersTogether: distances.index_middle < threshold && 
                       distances.middle_ring < threshold && 
                       distances.ring_pinky < threshold,
    
    // Specific finger pairs
    thumbIndexTogether: distances.thumb_index < threshold,
    indexMiddleTogether: distances.index_middle < threshold,
    middleRingTogether: distances.middle_ring < threshold,
    ringPinkyTogether: distances.ring_pinky < threshold,
    
    // Raw distances for custom logic
    distances
  };
};

/**
 * Detect peace sign gesture specifically
 */
export const detectPeaceSign = (landmarks: HandLandmark[]): boolean => {
  // Check if index and middle fingers are extended
  const indexExtended = landmarks[HAND_LANDMARKS.INDEX_TIP].y < landmarks[HAND_LANDMARKS.INDEX_PIP].y;
  const middleExtended = landmarks[HAND_LANDMARKS.MIDDLE_TIP].y < landmarks[HAND_LANDMARKS.MIDDLE_PIP].y;
  
  // Check if ring and pinky are not extended (closed)
  const ringClosed = landmarks[HAND_LANDMARKS.RING_TIP].y > landmarks[HAND_LANDMARKS.RING_PIP].y;
  const pinkyClosed = landmarks[HAND_LANDMARKS.PINKY_TIP].y > landmarks[HAND_LANDMARKS.PINKY_PIP].y;
  
  // Check if index and middle are separated (not stuck together)
  const indexMiddleDistance = calculate2DDistance(
    landmarks[HAND_LANDMARKS.INDEX_TIP], 
    landmarks[HAND_LANDMARKS.MIDDLE_TIP]
  );
  
  const areSeparated = indexMiddleDistance > 0.05; // Threshold for separation
  
  return indexExtended && middleExtended && ringClosed && pinkyClosed && areSeparated;
};

/**
 * Detect fingers stuck together vs separated
 */
export const analyzeFingerSeparation = (landmarks: HandLandmark[]): FingerSeparationAnalysis => {
  const proximity = detectFingerProximity(landmarks);
  
  return {
    // Specific gestures
    peaceSeparated: detectPeaceSign(landmarks), // ✌️ with fingers separated
    peaceStuckTogether: proximity.indexMiddleTogether && 
                       landmarks[HAND_LANDMARKS.INDEX_TIP].y < landmarks[HAND_LANDMARKS.INDEX_PIP].y &&
                       landmarks[HAND_LANDMARKS.MIDDLE_TIP].y < landmarks[HAND_LANDMARKS.MIDDLE_PIP].y,
    
    // General finger states
    fingerProximity: proximity,
    
    // Individual finger distances from each other
    fingerDistances: proximity.distances
  };
};

/**
 * Get finger angles relative to palm
 */
export const getFingerAngles = (landmarks: HandLandmark[]) => {
  const wrist = landmarks[HAND_LANDMARKS.WRIST];
  const middleMCP = landmarks[HAND_LANDMARKS.MIDDLE_MCP]; // Use as palm reference
  
  const palmDirection = {
    x: middleMCP.x - wrist.x,
    y: middleMCP.y - wrist.y
  };
  
  const fingerTips = [
    { name: 'index', landmark: landmarks[HAND_LANDMARKS.INDEX_TIP] },
    { name: 'middle', landmark: landmarks[HAND_LANDMARKS.MIDDLE_TIP] },
    { name: 'ring', landmark: landmarks[HAND_LANDMARKS.RING_TIP] },
    { name: 'pinky', landmark: landmarks[HAND_LANDMARKS.PINKY_TIP] }
  ];
  
  const angles: { [key: string]: number } = {};
  
  fingerTips.forEach(finger => {
    const fingerDirection = {
      x: finger.landmark.x - wrist.x,
      y: finger.landmark.y - wrist.y
    };
    
    // Calculate angle between palm direction and finger direction
    const dot = palmDirection.x * fingerDirection.x + palmDirection.y * fingerDirection.y;
    const palmMag = Math.sqrt(palmDirection.x * palmDirection.x + palmDirection.y * palmDirection.y);
    const fingerMag = Math.sqrt(fingerDirection.x * fingerDirection.x + fingerDirection.y * fingerDirection.y);
    
    const angle = Math.acos(dot / (palmMag * fingerMag)) * (180 / Math.PI);
    angles[finger.name] = angle;
  });
  
  return angles;
}; 
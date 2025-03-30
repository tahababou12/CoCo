// Types related to hand tracking and gesture recognition

// Define hand mode type for better type safety
// Note: Despite the name, 'Erasing' mode is now used for clicking elements
export type HandMode = 'Drawing' | 'Erasing' | 'Clear All' | 'None';

// Interface for MediaPipe hand landmarks
export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

// Hand position smoothing - for stabilizing detection
export interface SmoothingBuffer {
  points: Point[];
  maxSize: number;
  modeHistory: HandMode[];
}

// Hand gesture context type
export interface HandGestureContextType {
  currentGestures: { [key: number]: HandMode };
  isHandTrackingActive: boolean;
}

// Import Point type from main types
import { Point } from "./index"; 
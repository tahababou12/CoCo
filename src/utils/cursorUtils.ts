// Cursor Utilities for handling smooth, curved cursor movement
import { Point } from '../types';

// Store the path points for interpolation
let pathPoints: Point[] = [];
const MAX_PATH_POINTS = 5; // Number of points to keep in the path

// Add point to path history
export const addPointToPath = (point: Point): void => {
  pathPoints.push({...point});
  
  // Keep only the most recent points
  if (pathPoints.length > MAX_PATH_POINTS) {
    pathPoints.shift();
  }
};

// Clear the path history
export const clearPath = (): void => {
  pathPoints = [];
};

// Get the current path points
export const getPathPoints = (): Point[] => {
  return [...pathPoints];
};

// Calculate a smoothed point based on quadratic Bezier curve interpolation
export const getSmoothedCursorPosition = (point: Point): Point => {
  // If we don't have enough points for a curve yet, return the raw point
  if (pathPoints.length < 2) {
    return point;
  }
  
  // Use the previous points to create a smooth curve
  const points = getPathPoints();
  const previousPoint = points[points.length - 1];
  const controlPoint = points[points.length - 2];
  
  // Quadratic bezier interpolation for smoothing
  // Calculate a point along the quadratic bezier curve
  // using the current position, previous position, and the position before that
  const t = 0.5; // Interpolation factor (0.0 to 1.0)
  
  // Quadratic bezier formula: (1-t)²·p0 + 2·(1-t)·t·p1 + t²·p2
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const tSquared = t * t;
  
  const x = oneMinusTSquared * controlPoint.x + 
           2 * oneMinusT * t * previousPoint.x + 
           tSquared * point.x;
           
  const y = oneMinusTSquared * controlPoint.y + 
           2 * oneMinusT * t * previousPoint.y + 
           tSquared * point.y;
  
  return { x, y };
}; 
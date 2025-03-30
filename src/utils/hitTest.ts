import { Point, Shape } from '../types'

// Distance between a point and a line segment
export const distanceToLineSegment = (
  p: Point, 
  v: Point, 
  w: Point
): number => {
  // Calculate squared distance to avoid expensive sqrt operations
  const lengthSquared = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
  
  // If line segment is actually a point
  if (lengthSquared === 0) return Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2);
  
  // Project point onto line segment
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  
  // Calculate closest point on line segment
  const closestX = v.x + t * (w.x - v.x);
  const closestY = v.y + t * (w.y - v.y);
  
  // Return squared distance
  return Math.pow(p.x - closestX, 2) + Math.pow(p.y - closestY, 2);
};

// Check if a point is near a pencil stroke
export const hitTestPencilStroke = (
  shape: Shape, 
  point: Point, 
  threshold: number = 5
): boolean => {
  if (shape.type !== 'pencil' || shape.points.length < 2) {
    return false;
  }
  
  // Check each line segment in the pencil stroke
  for (let i = 0; i < shape.points.length - 1; i++) {
    const start = shape.points[i];
    const end = shape.points[i + 1];
    
    // Calculate distance to this line segment
    const distSquared = distanceToLineSegment(point, start, end);
    
    // Check if point is within threshold
    const thresholdSquared = Math.pow(threshold, 2);
    if (distSquared <= thresholdSquared) {
      return true;
    }
  }
  
  return false;
};

// Core hit test function for shapes
export const hitTest = (shape: Shape, point: Point): boolean => {
  // All tests based on type of shape
  switch (shape.type) {
    case 'rectangle':
      return hitTestRectangle(shape, point)
    case 'ellipse':
      return hitTestEllipse(shape, point)
    case 'line':
      return hitTestLine(shape, point)
    case 'pencil':
      return hitTestPencilStroke(shape, point)
    case 'text':
      return hitTestText(shape, point)
    default:
      return false
  }
}

// Find the index of the line segment in a pencil stroke that a point intersects with
export const findIntersectingSegment = (
  shape: Shape, 
  point: Point, 
  threshold: number = 5
): number => {
  if (shape.type !== 'pencil' || shape.points.length < 2) {
    return -1;
  }
  
  // Check each line segment in the pencil stroke
  for (let i = 0; i < shape.points.length - 1; i++) {
    const start = shape.points[i];
    const end = shape.points[i + 1];
    
    // Calculate distance to this line segment
    const distSquared = distanceToLineSegment(point, start, end);
    
    // Check if point is within threshold
    const thresholdSquared = Math.pow(threshold, 2);
    if (distSquared <= thresholdSquared) {
      return i;
    }
  }
  
  return -1;
};

// Split a pencil stroke at the given segment index and create two new strokes
export const splitPencilStroke = (
  shape: Shape, 
  segmentIndex: number
): { before: Shape, after: Shape } => {
  if (shape.type !== 'pencil' || segmentIndex < 0 || segmentIndex >= shape.points.length - 1) {
    throw new Error('Invalid shape or segment index for splitting');
  }
  
  // Create points arrays for the two new strokes
  const pointsBefore = shape.points.slice(0, segmentIndex + 1);
  const pointsAfter = shape.points.slice(segmentIndex + 1);
  
  // Generate new unique IDs for the split strokes
  const beforeId = shape.id + '_before_' + Math.random().toString(36).substring(2, 9);
  const afterId = shape.id + '_after_' + Math.random().toString(36).substring(2, 9);
  
  // Create the two new shapes
  const beforeShape: Shape = {
    id: beforeId,
    type: 'pencil',
    points: pointsBefore,
    style: { ...shape.style },
    isSelected: false,
  };
  
  const afterShape: Shape = {
    id: afterId,
    type: 'pencil',
    points: pointsAfter,
    style: { ...shape.style },
    isSelected: false,
  };
  
  return { before: beforeShape, after: afterShape };
};

// Specific hit test functions for different shape types
function hitTestRectangle(shape: Shape, point: Point): boolean {
  if (shape.points.length < 2) return false

  const [start, end] = shape.points
  
  const minX = Math.min(start.x, end.x)
  const maxX = Math.max(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  const maxY = Math.max(start.y, end.y)

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
}

function hitTestEllipse(shape: Shape, point: Point): boolean {
  if (shape.points.length < 2) return false

  const [start, end] = shape.points
  
  const centerX = (start.x + end.x) / 2
  const centerY = (start.y + end.y) / 2
  const radiusX = Math.abs(end.x - start.x) / 2
  const radiusY = Math.abs(end.y - start.y) / 2

  // Ellipse equation: (x-h)²/a² + (y-k)²/b² <= 1
  const normalizedX = (point.x - centerX) / radiusX
  const normalizedY = (point.y - centerY) / radiusY
  
  return normalizedX * normalizedX + normalizedY * normalizedY <= 1
}

function hitTestLine(shape: Shape, point: Point): boolean {
  if (shape.points.length < 2) return false

  const [start, end] = shape.points
  
  // Calculate distance to line segment
  const distSquared = distanceToLineSegment(point, start, end);
  
  // Check if point is within reasonable distance of line
  return distSquared <= 25 // 5px squared
}

function hitTestText(shape: Shape, point: Point): boolean {
  if (shape.points.length < 1) return false

  const position = shape.points[0]
  const text = shape.text || ''
  
  // Estimate text dimensions
  const fontSize = shape.style.fontSize || 16
  const width = text.length * fontSize * 0.6
  const height = fontSize * 1.2
  
  return (
    point.x >= position.x &&
    point.x <= position.x + width &&
    point.y >= position.y - height &&
    point.y <= position.y
  )
}

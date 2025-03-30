import { Point } from '../types';

// Convert video coordinates to canvas coordinates for cursor display
export const videoToCanvasCoords = (point: Point): Point => {
  if (!point) return { x: 0, y: 0 };
  
  // MediaPipe provides normalized coordinates (0-1)
  // We need to:
  // 1. Flip the x-coordinate for the mirrored view
  // 2. Scale to window dimensions
  
  return {
    x: (1 - point.x) * window.innerWidth,  // Flip x due to mirrored video
    y: point.y * window.innerHeight
  };
};

// Convert canvas coordinates to drawing coordinates (with transform)
export const canvasToDrawingCoords = (
  point: Point, 
  scale: number, 
  offsetX: number, 
  offsetY: number
): Point => {
  // Adjust according to canvas scaling and offset
  return {
    x: (point.x - offsetX) / scale,
    y: (point.y - offsetY) / scale
  };
}; 
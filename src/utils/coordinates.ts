import { Point } from '../types';

// Convert video coordinates to canvas coordinates for cursor display
export const videoToCanvasCoords = (point: Point): Point => {
  if (!point) return { x: 0, y: 0 };
  
  // MediaPipe provides normalized coordinates (0-1)
  // We need to:
  // 1. Flip the x-coordinate for the mirrored view
  // 2. Scale to window dimensions to get screen coordinates
  // 3. Then use the same coordinate system as the canvas
  
  // First, convert to screen coordinates (same as mouse events)
  const screenX = (1 - point.x) * window.innerWidth;  // Flip x due to mirrored video
  const screenY = point.y * window.innerHeight;
  
  // Now find the canvas element and get its position, just like getCanvasPoint does
  const canvas = document.querySelector('canvas');
  if (!canvas) {
    // Fallback to screen coordinates if canvas not found
    return { x: screenX, y: screenY };
  }
  
  const rect = canvas.getBoundingClientRect();
  
  // Convert screen coordinates to canvas-relative coordinates
  // This matches exactly what the Canvas component does in getCanvasPoint
  return {
    x: screenX - rect.left,
    y: screenY - rect.top
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
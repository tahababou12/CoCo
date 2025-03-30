import { HandMode } from '../types/handTracking';

// Ensure cursor element exists and is properly styled
export const ensureCursorExists = (
  index: number, 
  color: string
): HTMLElement => {
  let cursor = document.getElementById(`hand-cursor-${index}`);
  
  // If cursor doesn't exist, create it
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.id = `hand-cursor-${index}`;
    cursor.className = `hand-cursor hand-cursor-${index}`;
    cursor.style.position = 'fixed';
    cursor.style.width = '20px';
    cursor.style.height = '20px';
    cursor.style.borderRadius = '50%';
    cursor.style.backgroundColor = color;
    cursor.style.opacity = '0.7';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '9999';
    cursor.style.display = 'none';
    cursor.style.transform = 'translate(-50%, -50%)';
    
    document.body.appendChild(cursor);
  }
  
  return cursor;
};

// Add cursor styles to document
export const addCursorStyles = (): HTMLStyleElement => {
  const style = document.createElement('style');
  style.innerHTML = `
    .hand-cursor {
      transition: all 0.05s ease-out;
      box-shadow: 0 0 5px rgba(0,0,0,0.5);
      position: fixed !important;
      z-index: 9999 !important;
      pointer-events: none !important;
    }
    .hand-cursor-0 {
      border: 2px solid #FF0000;
    }
    .drawing-mode {
      background-color: rgba(255,255,255,0.8) !important;
      width: 15px !important;
      height: 15px !important;
      border: 3px solid #FF0000 !important;
    }
    .erasing-mode {
      background-color: rgba(255,255,255,0.5) !important;
      width: 30px !important;
      height: 30px !important;
      border: 2px dashed #000 !important;
    }
    .clear-all-mode {
      background-color: rgba(255,0,0,0.3) !important;
      width: 40px !important;
      height: 40px !important;
      border-radius: 0 !important;
    }
    .none-mode {
      background-color: rgba(200,200,200,0.5) !important;
    }
  `;
  document.head.appendChild(style);
  
  return style;
};

// Update cursor position and style based on hand mode
export const updateCursor = (
  cursorElement: HTMLElement, 
  x: number, 
  y: number, 
  mode: HandMode
): void => {
  // Position cursor
  cursorElement.style.left = `${x}px`;
  cursorElement.style.top = `${y}px`;
  cursorElement.style.display = 'block';
  
  // Style based on hand mode
  cursorElement.className = `hand-cursor hand-cursor-0 ${mode.toLowerCase()}-mode`;
};

// Clean up cursor elements
export const cleanupCursors = (indices: number[], styleElement?: HTMLStyleElement): void => {
  indices.forEach(index => {
    const cursor = document.getElementById(`hand-cursor-${index}`);
    if (cursor) {
      document.body.removeChild(cursor);
    }
  });
  
  // Remove style if provided
  if (styleElement && document.head.contains(styleElement)) {
    document.head.removeChild(styleElement);
  }
}; 
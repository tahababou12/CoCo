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
    cursor.style.opacity = '0.5';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '9999';
    cursor.style.display = 'none';
    cursor.style.transform = 'translate(-50%, -50%)';
    cursor.style.marginTop = '0px';
    
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
    .clicking-mode {
      background-color: rgba(0,85,255,0.5) !important;
      width: 25px !important;
      height: 25px !important;
      border: 2px solid #0055FF !important;
      border-radius: 50% !important;
      cursor: pointer !important;
      transition: transform 0.15s ease-out !important;
    }
    .clicking-mode[data-clicked="true"] {
      background-color: rgba(0,85,255,0.3) !important;
      transform: translate(-50%, -50%) scale(0.8) !important;
      box-shadow: 0 0 10px rgba(0,85,255,0.7) !important;
    }
    .dragging-mode {
      background-color: rgba(255,165,0,0.5) !important;
      width: 30px !important;
      height: 30px !important;
      border: 2px solid #FF8C00 !important;
      border-radius: 10% !important;
      transition: transform 0.1s ease-out !important;
      transform: translate(-50%, -50%) !important;
      cursor: move !important;
    }
    .dragging-mode:before {
      content: "" !important;
      position: absolute !important;
      width: 70% !important;
      height: 70% !important;
      background-image: radial-gradient(
        circle, 
        rgba(255, 255, 255, 0.8) 10%, 
        rgba(255, 255, 255, 0) 70%
      ) !important;
    }
    .dragging-mode[data-dragging="true"] {
      background-color: rgba(255,140,0,0.7) !important;
      transform: translate(-50%, -50%) scale(0.9) !important;
      box-shadow: 0 0 15px rgba(255,140,0,0.5) !important;
    }
    .clearing-mode {
      background-color: rgba(255,0,0,0.5) !important; 
      width: 35px !important;
      height: 35px !important;
      border: 2px solid #FF0000 !important;
      border-radius: 50% !important;
      transition: transform 0.15s ease-out !important;
    }
    .clearing-mode:before {
      content: "✕" !important;
      position: absolute !important;
      left: 50% !important;
      top: 50% !important;
      transform: translate(-50%, -50%) !important;
      color: white !important;
      font-weight: bold !important;
      font-size: 18px !important;
    }
    .clearing-gesture {
      animation: pulse-red 0.5s ease-in-out !important;
      box-shadow: 0 0 20px rgba(255,0,0,0.8) !important;
    }
    @keyframes pulse-red {
      0% { transform: translate(-50%, -50%) scale(1); }
      50% { transform: translate(-50%, -50%) scale(1.5); box-shadow: 0 0 30px rgba(255,0,0,0.9); }
      100% { transform: translate(-50%, -50%) scale(1); }
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
  
  // Handle clicking functionality for Clicking mode
  if (mode === 'Clicking') {
    // Skip if we recently clicked (prevent rapid clicks)
    if (cursorElement.getAttribute('data-clicked') === 'true') {
      return;
    }
    
    // Get element at cursor position at the exact position
    const elementAtPoint = document.elementFromPoint(x, y);
    
    if (!elementAtPoint) return;
    
    // Find if this element or any of its parents are clickable
    const isClickable = (element: Element): boolean => {
      if (!element) return false;
      
      // Check common clickable elements
      if (element.tagName === 'BUTTON' || 
          element.tagName === 'A' ||
          element.tagName === 'INPUT' ||
          element.tagName === 'SELECT' ||
          element.tagName === 'LABEL' ||
          element.hasAttribute('onclick') ||
          element.getAttribute('role') === 'button' ||
          element.classList.contains('btn') ||
          window.getComputedStyle(element).cursor === 'pointer') {
        return true;
      }
      
      // Check for click event listeners (indirect method)
      if (element.hasAttribute('data-testid') || 
          element.id || 
          element.className.includes('button') ||
          element.className.includes('btn')) {
        return true;
      }
      
      // Check if any parent is clickable (up to 3 levels)
      let parent = element.parentElement;
      let level = 0;
      while (parent && level < 3) {
        if (isClickable(parent)) return true;
        parent = parent.parentElement;
        level++;
      }
      
      return false;
    };
    
    // Check if element is clickable
    if (isClickable(elementAtPoint)) {
      // Add visual feedback for click
      cursorElement.setAttribute('data-clicked', 'true');
      
      // Dispatch click event
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      });
      
      elementAtPoint.dispatchEvent(clickEvent);
      
      // Allow another click after delay
      setTimeout(() => {
        cursorElement.removeAttribute('data-clicked');
      }, 800); // 800ms cooldown between clicks
    }
  }
  // Handle Clearing mode visual feedback
  else if (mode === 'Clearing') {
    // Add a pulsing effect to indicate clearing action
    cursorElement.classList.add('clearing-gesture');
    setTimeout(() => {
      cursorElement.classList.remove('clearing-gesture');
    }, 500);
  }
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
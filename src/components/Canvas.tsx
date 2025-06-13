import React, { useRef, useEffect, useState, useLayoutEffect } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { Point, Shape } from '../types'
import { renderShape } from '../utils/renderShape'
import { hitTest } from '../utils/hitTest'
import EnhancedImageActions from './EnhancedImageActions'

// Debug flag to control console logging
const DEBUG = false;

// Define a type for the enhanced image
interface EnhancedImage {
  id: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
  base64Data?: string;
  isDragging: boolean;
  isResizing: boolean;
  resizeHandle: string | null;
}

// Define a type for the enhanced image result from API
interface EnhancedImageResult {
  filename: string;
  path: string;
  absolute_path: string;
  width: number;
  height: number;
  original_width: number;
  original_height: number;
  base64Data: string;
  prompt: string;
}

// Define API URL constant
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const Canvas: React.FC = () => {
  const { state, dispatch } = useDrawing()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    position: Point;
    value: string;
  }>({
    visible: false,
    position: { x: 0, y: 0 },
    value: '',
  })
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null)
  const [enhancementStatus, setEnhancementStatus] = useState<string>('idle')

  // Add state for interactive enhanced images
  const [interactiveEnhancedImages, setInteractiveEnhancedImages] = useState<EnhancedImage[]>([])
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null)
  const [initialImageState, setInitialImageState] = useState<EnhancedImage | null>(null)

  // Define renderCanvas function before it's used in effects
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gridSize = 20 * state.viewTransform.scale
    const offsetX = state.viewTransform.offsetX % gridSize
    const offsetY = state.viewTransform.offsetY % gridSize
    
    // Draw dots at intersections
    ctx.fillStyle = '#e5e5e5'
    for (let x = offsetX; x < width; x += gridSize) {
      for (let y = offsetY; y < height; y += gridSize) {
        ctx.beginPath()
        ctx.arc(x, y, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const renderCanvas = () => {
    void (DEBUG && console.log('renderCanvas called'));
    const canvas = canvasRef.current;
    let ctx = ctxRef.current;
    
    if (!canvas) {
      void (DEBUG && console.error('Cannot render: canvas not available'));
      return;
    }
    
    if (!ctx) {
      void (DEBUG && console.error('Cannot render: context not available'));
      
      // Try to reinitialize the context
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        void (DEBUG && console.log('Successfully reinitialized context'));
        ctxRef.current = context;
        ctx = context;
      } else {
        void (DEBUG && console.error('Failed to reinitialize context'));
        return;
      }
    }

    // At this point, we know ctx is not null
    const context = ctx;

    // Make sure canvas has dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      void (DEBUG && console.warn('Canvas has zero dimensions, setting defaults'));
      canvas.width = 800;
      canvas.height = 600;
    }

    void (DEBUG && console.log(`Rendering canvas ${canvas.width}x${canvas.height} with ${state.shapes.length} shapes`));
    
    // Clear canvas with background color
    // context.fillStyle = '#fafaf9'; // Dim white
    context.fillStyle = '#fffbeb'; // Light yellow for night shift mode
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(context, canvas.width, canvas.height);

    // Apply view transform
    context.save();
    context.translate(state.viewTransform.offsetX, state.viewTransform.offsetY);
    context.scale(state.viewTransform.scale, state.viewTransform.scale);

    // Draw all shapes
    if (state.shapes.length > 0) {
      state.shapes.forEach((shape, index) => {
        void (DEBUG && console.log(`Rendering shape ${index}: ${shape.type}`));
        renderShape(context, shape);
      });
    }

    // Set current stroke color and width from defaultStyle
    context.strokeStyle = state.defaultStyle.strokeColor;
    context.lineWidth = state.defaultStyle.strokeWidth;
    
    // Draw current shape being created
    if (state.currentShape) {
      void (DEBUG && console.log('Drawing current shape:', state.currentShape.type));
      void (DEBUG && console.log('Current shape has points:', state.currentShape.points.length));
      void (DEBUG && console.log('Using color:', state.defaultStyle.strokeColor));
      
      // Extra validation to help debugging
      if (state.currentShape.points.length === 0) {
        void (DEBUG && console.warn('Current shape has no points!'));
      }
      
      // Make sure current shape uses current style
      const currentShapeWithStyle = {
        ...state.currentShape,
        style: {
          ...state.currentShape.style,
          strokeColor: state.defaultStyle.strokeColor,
          strokeWidth: state.defaultStyle.strokeWidth
        }
      };
      
      renderShape(context, currentShapeWithStyle);
      
      // If we have a current shape, we should be in drawing mode
      if (!isDrawing) {
        void (DEBUG && console.log('Syncing drawing state to true'));
        setIsDrawing(true);
      }
    } else if (isDrawing) {
      // No current shape but drawing flag is true - sync state
      void (DEBUG && console.log('No current shape but isDrawing=true, syncing state'));
      setIsDrawing(false);
    }

    context.restore();
  };

  // Initialize canvas and context
  useEffect(() => {
    void (DEBUG && console.log('Canvas initialization effect running'));
    
    // Ensure we have references to both canvas and container
    if (!canvasRef.current) {
      void (DEBUG && console.error('Canvas element not available during initialization'));
      return;
    }
    
    const canvas = canvasRef.current;
    
    // Set explicit dimensions - both via attributes and style
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth || 800;
      const containerHeight = containerRef.current.clientHeight || 600;
      
      // Ensure non-zero dimensions
      const width = Math.max(containerWidth, 800);
      const height = Math.max(containerHeight, 600);
      
      // Set both the canvas attribute dimensions and CSS dimensions
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    } else {
      canvas.width = 800;
      canvas.height = 600;
      canvas.style.width = '800px';
      canvas.style.height = '600px';
    }
    
    void (DEBUG && console.log(`Canvas dimensions set: ${canvas.width}x${canvas.height}`));
    
    // Use willReadFrequently for better performance with frequent reads
    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!context) {
      void (DEBUG && console.error('Failed to get canvas 2d context'));
      return;
    }
    
    // Set up context properties
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = state.defaultStyle.strokeColor || '#000';
    context.lineWidth = state.defaultStyle.strokeWidth || 2;
    
    ctxRef.current = context;
    void (DEBUG && console.log('Canvas context initialized'));
    
    // Force an initial render after a short delay to ensure everything is set up
    setTimeout(() => {
      void (DEBUG && console.log('Triggering delayed initial render'));
      renderCanvas();
    }, 200);
    
    // Add extra debugging on the canvas element
    canvas.addEventListener('pointerdown', () => {
      void (DEBUG && console.log('Native pointerdown event fired'));
    });
    
  }, []);

  // Handle canvas resize
  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth || 800;
        const containerHeight = containerRef.current.clientHeight || 600;
        
        // Ensure we never set zero dimensions
        const width = Math.max(containerWidth, 1);
        const height = Math.max(containerHeight, 1);
        
        void (DEBUG && console.log(`Resizing canvas to: ${width}x${height}`));
        
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        
        // Explicitly set the style as well to ensure visibility
        canvasRef.current.style.width = `${width}px`;
        canvasRef.current.style.height = `${height}px`;
        
        renderCanvas();
      }
    };

    // Add a small delay to ensure container is properly sized
    setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Render canvas whenever state changes
  useLayoutEffect(() => {
    renderCanvas();
  }, [state.shapes, state.currentShape, state.viewTransform]);

  // Add specific effect to handle drawing state changes
  useEffect(() => {
    // Handle case where drawing starts from HandDrawing component
    if (state.currentShape && !isDrawing) {
      void (DEBUG && console.log('Canvas detected drawing started externally, syncing state'));
      setIsDrawing(true);
    }
    
    // Handle case where drawing ends from HandDrawing component
    if (!state.currentShape && isDrawing) {
      void (DEBUG && console.log('Canvas detected drawing ended externally, syncing state'));
      setIsDrawing(false);
    }
  }, [state.currentShape, isDrawing]);

  // Update cursor when tool changes
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = getCursorForTool(state.tool)
    }
  }, [state.tool])

  const getCanvasPoint = (clientX: number, clientY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 }

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (clientX - rect.left - state.viewTransform.offsetX) / state.viewTransform.scale
    const y = (clientY - rect.top - state.viewTransform.offsetY) / state.viewTransform.scale
    return { x, y }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    void (DEBUG && console.log('React handlePointerDown triggered', e.type, e.clientX, e.clientY));
    
    if (!canvasRef.current) {
      void (DEBUG && console.error('Canvas ref not available in handlePointerDown'));
      return;
    }
    
    // Check if the target is a button or div with role="button"
    // If so, don't handle canvas pointer events
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || 
        (target.tagName === 'DIV' && target.getAttribute('role') === 'button') ||
        target.closest('button') || 
        target.closest('[role="button"]')) {
      void (DEBUG && console.log('Clicked on a button - not handling canvas event'));
      return;
    }
    
    // Prevent default behavior to ensure drawing works
    e.preventDefault();
    e.stopPropagation();
    
    try {
      // Capture pointer to ensure all events go to this element
      canvasRef.current.setPointerCapture(e.pointerId);
      void (DEBUG && console.log('Pointer captured successfully', e.pointerId));
    } catch (err) {
      void (DEBUG && console.error('Failed to capture pointer', err));
    }
    
    const point = getCanvasPoint(e.clientX, e.clientY);
    void (DEBUG && console.log('Pointer down at', point, 'with tool', state.tool));
    
    // Variables for switch cases
    let clickedShape: Shape | undefined;
    let shapeToErase: Shape | undefined;

    // Handle different tools
    switch (state.tool) {
      case 'pan':
        setIsPanning(true);
        setLastPanPoint({ x: e.clientX, y: e.clientY });
        break;

      case 'select':
        clickedShape = findShapeAtPoint(point);
        
        if (clickedShape) {
          dispatch({ type: 'SELECT_SHAPES', payload: [clickedShape.id] });
        } else {
          dispatch({ type: 'CLEAR_SELECTION' });
        }
        break;

      case 'eraser':
        // Object eraser - erase entire shapes
        shapeToErase = findShapeAtPoint(point);
        if (shapeToErase) {
          dispatch({ type: 'DELETE_SHAPES', payload: [shapeToErase.id] });
        }
        break;
        
      case 'pixel_eraser':
        // Pixel eraser - start drawing an eraser stroke
        setIsDrawing(true);
        dispatch({
          type: 'START_DRAWING',
          payload: { point, type: 'pencil' },
        });
        break;

      case 'text':
        setTextInput({
          visible: true,
          position: point,
          value: '',
        });
        break;

      // Drawing tools
      case 'rectangle':
      case 'ellipse':
      case 'line':
      case 'pencil':
        void (DEBUG && console.log('Starting to draw with', state.tool, 'using color', state.defaultStyle.strokeColor));
        setIsDrawing(true);
        dispatch({
          type: 'START_DRAWING',
          payload: { point, type: state.tool },
        });
        break;

      default:
        void (DEBUG && console.warn('Unknown tool:', state.tool));
        break;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) {
      void (DEBUG && console.warn('Canvas ref not available in handlePointerMove'));
      return;
    }
    
    // Check if the target is a button or div with role="button" 
    // If so, don't handle canvas pointer events
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || 
        (target.tagName === 'DIV' && target.getAttribute('role') === 'button') ||
        target.closest('button') || 
        target.closest('[role="button"]')) {
      return;
    }
    
    // Prevent default behavior
    e.preventDefault();
    e.stopPropagation();
    
    const point = getCanvasPoint(e.clientX, e.clientY);

    // Handle enhanced image dragging and resizing
    if (dragStartPos && initialImageState) {
      const dx = e.clientX - dragStartPos.x;
      const dy = e.clientY - dragStartPos.y;

      setInteractiveEnhancedImages(images => images.map(img => {
        if (img.isDragging) {
          // Handle dragging
          return {
            ...img,
            x: initialImageState.x + dx,
            y: initialImageState.y + dy
          };
        } else if (img.isResizing && img.resizeHandle) {
          // Handle resizing based on which handle was grabbed
          let newWidth = img.width;
          let newHeight = img.height;
          let newX = img.x;
          let newY = img.y;

          // Handle different resize positions
          if (img.resizeHandle.includes('e')) {
            newWidth = Math.max(50, initialImageState.width + dx);
          }
          if (img.resizeHandle.includes('s')) {
            newHeight = Math.max(50, initialImageState.height + dy);
          }
          if (img.resizeHandle.includes('w')) {
            newWidth = Math.max(50, initialImageState.width - dx);
            newX = initialImageState.x + dx;
          }
          if (img.resizeHandle.includes('n')) {
            newHeight = Math.max(50, initialImageState.height - dy);
            newY = initialImageState.y + dy;
          }

          return {
            ...img,
            width: newWidth,
            height: newHeight,
            x: newX,
            y: newY
          };
        }
        return img;
      }));

      return; // Don't proceed with other pointer move handlers
    }

    // For touch input, always treat it as if the primary button is pressed
    // For mouse input, check if button is actually pressed
    const isPrimaryButtonPressed = e.pointerType === 'touch' || e.buttons === 1;
    
    if (isPanning) {
      const dx = e.clientX - (lastPanPoint?.x || 0);
      const dy = e.clientY - (lastPanPoint?.y || 0);
      dispatch({ type: 'PAN', payload: { x: dx, y: dy } });
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (state.tool === 'eraser' && isPrimaryButtonPressed) {
      // Object eraser - continuously erase whole shapes
      const shapeToErase = findShapeAtPoint(point);
      if (shapeToErase) {
        dispatch({ type: 'DELETE_SHAPES', payload: [shapeToErase.id] });
      }
      return;
    }

    // For drawing, check if we're in drawing mode rather than relying only on button state
    if (isDrawing && state.currentShape) {
      void (DEBUG && console.log('Drawing in progress...', state.tool, point, 'pointerType:', e.pointerType, 'using color:', state.defaultStyle.strokeColor));
      
      // Continue drawing with current point
      dispatch({ type: 'CONTINUE_DRAWING', payload: point });
      
      // No need to re-dispatch SET_STYLE here since renderCanvas will handle it
    }

    // Add this to the section handling image resizing
    const draggedImage = interactiveEnhancedImages.find(img => img.isDragging || img.isResizing);
    
    if (draggedImage && initialImageState && dragStartPos) {
      const dx = e.clientX - dragStartPos.x;
      const dy = e.clientY - dragStartPos.y;
      
      const draggedIndex = interactiveEnhancedImages.findIndex(img => 
        img.isDragging || img.isResizing
      );
      
      if (draggedIndex !== -1) {
        const updatedImages = [...interactiveEnhancedImages];
        const image = { ...updatedImages[draggedIndex] };
        
        if (draggedImage.isResizing && draggedImage.resizeHandle) {
          // Handle resizing based on which handle was grabbed
          switch (draggedImage.resizeHandle) {
            case 'bottom-right':
              image.width = Math.max(50, initialImageState.width + dx);
              image.height = Math.max(50, initialImageState.height + dy);
              break;
            case 'bottom-left':
              image.width = Math.max(50, initialImageState.width - dx);
              image.x = initialImageState.x + dx;
              image.height = Math.max(50, initialImageState.height + dy);
              break;
            case 'top-right':
              image.width = Math.max(50, initialImageState.width + dx);
              image.height = Math.max(50, initialImageState.height - dy);
              image.y = initialImageState.y + dy;
              break;
            case 'top-left':
              image.width = Math.max(50, initialImageState.width - dx);
              image.x = initialImageState.x + dx;
              image.height = Math.max(50, initialImageState.height - dy);
              image.y = initialImageState.y + dy;
              break;
            case 'right':
              image.width = Math.max(50, initialImageState.width + dx);
              break;
            case 'left':
              image.width = Math.max(50, initialImageState.width - dx);
              image.x = initialImageState.x + dx;
              break;
            case 'bottom':
              image.height = Math.max(50, initialImageState.height + dy);
              break;
            case 'top':
              image.height = Math.max(50, initialImageState.height - dy);
              image.y = initialImageState.y + dy;
              break;
          }
        } else if (draggedImage.isDragging) {
          // Handle dragging
          image.x = initialImageState.x + dx;
          image.y = initialImageState.y + dy;
        }
        
        updatedImages[draggedIndex] = image;
        setInteractiveEnhancedImages(updatedImages);
        
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    
    // Check if the target is a button or div with role="button"
    // If so, don't handle canvas pointer events
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || 
        (target.tagName === 'DIV' && target.getAttribute('role') === 'button') ||
        target.closest('button') || 
        target.closest('[role="button"]')) {
      return;
    }
    
    // Prevent default behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Release pointer capture
    try {
      canvasRef.current.releasePointerCapture(e.pointerId);
    } catch (err) {
      void (DEBUG && console.error('Failed to release pointer capture', err));
    }
    
    // Reset enhanced image interaction states
    if (dragStartPos) {
      setInteractiveEnhancedImages(images => images.map(img => ({
        ...img,
        isDragging: false,
        isResizing: false,
        resizeHandle: null
      })));
      setDragStartPos(null);
      setInitialImageState(null);
    }
    
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    if (isDrawing && state.currentShape) {
      void (DEBUG && console.log('Ending drawing', state.currentShape.type));
      setIsDrawing(false);
      dispatch({ type: 'END_DRAWING' });
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    // Don't end drawing on leave since we've captured the pointer
    e.preventDefault();
    
    // Only handle panning case
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? -0.1 : 0.1
    
    // Zoom centered on mouse position
    const point = getCanvasPoint(e.clientX, e.clientY)
    dispatch({ 
      type: 'ZOOM_AT_POINT', 
      payload: { 
        factor: zoomFactor,
        point: point
      } 
    })
  }

  const findShapeAtPoint = (point: Point): Shape | undefined => {
    // Check shapes in reverse order (top to bottom)
    return [...state.shapes].reverse().find(shape => hitTest(shape, point))
  }

  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput({
      ...textInput,
      value: e.target.value,
    })
  }

  const handleTextInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitTextInput()
    } else if (e.key === 'Escape') {
      cancelTextInput()
    }
  }

  const submitTextInput = () => {
    if (textInput.value.trim()) {
      const newTextShape: Shape = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'text',
        points: [textInput.position],
        text: textInput.value,
        style: { ...state.defaultStyle },
        isSelected: false,
      }
      dispatch({ type: 'ADD_SHAPE', payload: newTextShape })
    }
    cancelTextInput()
  }

  const cancelTextInput = () => {
    setTextInput({
      visible: false,
      position: { x: 0, y: 0 },
      value: '',
    })
  }

  const handleClearAll = () => {
    if (state.shapes.length > 0) {
      // End any current drawing first
      if (state.currentShape) {
        dispatch({ type: 'END_DRAWING' });
        setIsDrawing(false);
      }
      
      // Get all shape IDs
      const shapeIds = state.shapes.map(shape => shape.id);
      
      // Delete all shapes
      dispatch({ type: 'DELETE_SHAPES', payload: shapeIds });
    }
  }

  const saveCanvasAsPNG = async () => {
    if (!canvasRef.current || state.shapes.length === 0) return;
    
    // Create a temporary canvas for rendering just the drawings
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // Find the bounding box of all shapes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    // Calculate the bounds for all shapes
    state.shapes.forEach(shape => {
      shape.points.forEach(point => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      });
      
      // For text, estimate the bounds based on the text and font size
      if (shape.type === 'text' && shape.text) {
        const fontSize = shape.style.fontSize || 16;
        const textWidth = shape.text.length * fontSize * 0.6; // Rough estimate
        const textHeight = fontSize * 1.2; // Rough estimate
        
        minX = Math.min(minX, shape.points[0].x);
        minY = Math.min(minY, shape.points[0].y);
        maxX = Math.max(maxX, shape.points[0].x + textWidth);
        maxY = Math.max(maxY, shape.points[0].y + textHeight);
      }
    });
    
    // Add padding
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Set canvas size to fit the bounding box
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    tempCanvas.width = width;
    tempCanvas.height = height;
    
    // Fill with a white background
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, width, height);
    
    // Apply transform to center the drawings
    tempCtx.translate(-minX, -minY);
    
    // Draw all shapes
    state.shapes.forEach(shape => {
      renderShape(tempCtx, shape);
    });
    
    // Convert to image
    try {
      const dataUrl = tempCanvas.toDataURL('image/png');
      
      // Send image data to server
      const response = await fetch(`${API_URL}/api/save-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server error: ${errorData.error || 'Unknown error'}`);
      }
      
      const result = await response.json();
      void (DEBUG && console.log(`Image saved successfully to: ${result.absolutePath}`));
      
      // Show success message with toast instead of alert
      window.showToast(`Image saved as: ${result.filename}`, 'success', 3000);
      
    } catch (err) {
      void (DEBUG && console.error('Error saving canvas:', err));
      window.showToast(`Error saving image: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  }

  const enhanceDrawingWithGemini = async () => {
    // Check if there are shapes to save
    if (state.shapes.length === 0) {
      window.showToast('Draw something first before enhancing', 'info', 3000);
      return;
    }

    setEnhancementStatus('processing');
    setEnhancedImage(null);
    
    try {
      // Always save the drawing first before enhancing
      // Create a temporary canvas for rendering just the drawings
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        throw new Error('Failed to create temporary canvas context');
      }
      
      // Find the bounding box of all shapes
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      
      // Calculate the bounds for all shapes
      state.shapes.forEach(shape => {
        shape.points.forEach(point => {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        });
        
        // For text, estimate the bounds based on the text and font size
        if (shape.type === 'text' && shape.text) {
          const fontSize = shape.style.fontSize || 16;
          const textWidth = shape.text.length * fontSize * 0.6; // Rough estimate
          const textHeight = fontSize * 1.2; // Rough estimate
          
          minX = Math.min(minX, shape.points[0].x);
          minY = Math.min(minY, shape.points[0].y);
          maxX = Math.max(maxX, shape.points[0].x + textWidth);
          maxY = Math.max(maxY, shape.points[0].y + textHeight);
        }
      });
      
      // Add padding
      const padding = 20;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
      
      // Set canvas size to fit the bounding box
      const width = Math.max(maxX - minX, 1);
      const height = Math.max(maxY - minY, 1);
      tempCanvas.width = width;
      tempCanvas.height = height;
      
      // Fill with a white background
      tempCtx.fillStyle = '#FFFFFF';
      tempCtx.fillRect(0, 0, width, height);
      
      // Apply transform to center the drawings
      tempCtx.translate(-minX, -minY);
      
      // Draw all shapes
      state.shapes.forEach(shape => {
        renderShape(tempCtx, shape);
      });
      
      // Convert to image
      const dataUrl = tempCanvas.toDataURL('image/png');
      
      // Send image data to server
      const response = await fetch(`${API_URL}/api/save-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server error while saving: ${errorData.error || 'Unknown error'}`);
      }
      
      const saveResult = await response.json();
      void (DEBUG && console.log(`Image saved for enhancement: ${saveResult.absolutePath}`));
      
      // Use a default enhancement prompt
      const defaultPrompt = 'Enhance this sketch into an image with more detail';

      // Request image enhancement from Flask server
      const enhanceResponse = await fetch(`${API_URL}/api/enhance-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename: saveResult.filename,
          prompt: defaultPrompt
        }),
      });

      if (!enhanceResponse.ok) {
        const errorData = await enhanceResponse.json();
        throw new Error(`Server error: ${errorData.error || 'Unknown error'}`);
      }

      const result = await enhanceResponse.json();
      void (DEBUG && console.log('Enhancement started:', result));

      if (result.success && result.requestId) {
        // Show a toast notification that enhancement is in progress
        window.showToast('Enhancing your drawing with Gemini...', 'info', 3000);
        
        // Poll for enhancement status
        pollEnhancementStatus(result.requestId);
      } else {
        throw new Error('Failed to start enhancement process');
      }
    } catch (err) {
      void (DEBUG && console.error('Error enhancing drawing:', err));
      window.showToast(`Error enhancing drawing: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
      setEnhancementStatus('error');
    }
  }

  const pollEnhancementStatus = async (requestId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/enhancement-status/${requestId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        void (DEBUG && console.error(`Error response: ${response.status} - ${errorText}`));
        throw new Error(`Failed to fetch enhancement status: ${response.status} ${response.statusText}`);
      }
      
      const status = await response.json();
      void (DEBUG && console.log('Enhancement status:', status));
      
      if (status.status === 'processing') {
        // Continue polling every 2 seconds
        setTimeout(() => pollEnhancementStatus(requestId), 2000);
      } else if (status.status === 'complete' && status.result) {
        // Enhancement is complete, add the enhanced image to the canvas
        setEnhancementStatus('complete');
        
        // Add as interactive image
        addEnhancedImageToCanvas(status.result);
        
        // Show success toast
        window.showToast('Enhancement complete! Image added to canvas.', 'success', 3000);
      } else if (status.status === 'error') {
        // Enhancement failed
        setEnhancementStatus('error');
        
        // Show a more detailed error message
        const errorMessage = status.message || 'Unknown error occurred';
        void (DEBUG && console.error('Enhancement error:', errorMessage));
        window.showToast(`Enhancement failed: ${errorMessage}`, 'error', 3000);
      } else {
        // Unexpected status
        setEnhancementStatus('error');
        window.showToast(`Unexpected status returned: ${status.status}`, 'error', 3000);
      }
    } catch (err) {
      void (DEBUG && console.error('Error polling enhancement status:', err));
      setEnhancementStatus('error');
      window.showToast(`Error checking enhancement status: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  }

  const getCursorForTool = (tool: string): string => {
    switch (tool) {
      case 'select':
        return 'default'
      case 'pan':
        return 'grab'
      case 'eraser':
        // Object eraser - use eraser icon
        return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21\'%3E%3C/path%3E%3Cpath d=\'M22 21H7\'%3E%3C/path%3E%3Cpath d=\'m5 11 9 9\'%3E%3C/path%3E%3C/svg%3E") 0 24, auto'
      case 'pixel_eraser':
        // Pixel eraser - use traditional eraser icon with X
        return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\'%3E%3C/path%3E%3Cpath d=\'M15 3h6v6\'%3E%3C/path%3E%3Cpath d=\'M10 14L21 3\'%3E%3C/path%3E%3C/svg%3E") 0 24, auto'
      default:
        return 'crosshair'
    }
  }

  // Add a function to handle enhanced image interactions
  const handlePointerDownOnEnhancedImage = (
    e: React.PointerEvent, 
    imageIndex: number, 
    isResizeHandle: boolean = false,
    handlePosition: string | null = null
  ) => {
    e.stopPropagation();

    const updatedImages = [...interactiveEnhancedImages];
    
    // First, reset all images dragging/resizing state
    updatedImages.forEach((img, idx) => {
      if (idx !== imageIndex) {
        img.isDragging = false;
        img.isResizing = false;
        img.resizeHandle = null;
      }
    });

    // Set the current image state
    if (isResizeHandle) {
      updatedImages[imageIndex].isResizing = true;
      updatedImages[imageIndex].resizeHandle = handlePosition;
    } else {
      updatedImages[imageIndex].isDragging = true;
    }

    setInteractiveEnhancedImages(updatedImages);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setInitialImageState({...updatedImages[imageIndex]});

    // Ensure the pointer events are captured
    if (canvasRef.current) {
      canvasRef.current.setPointerCapture(e.pointerId);
    }
  };

  // Add a function to convert an enhanced image result to an interactive image
  const addEnhancedImageToCanvas = (result: EnhancedImageResult) => {
    // Calculate the centered position for the image
    const viewWidth = window.innerWidth;
    const viewHeight = window.innerHeight;
    
    // Use a reasonable size for the image on the canvas
    const maxWidth = 300;
    const maxHeight = 300;
    
    // Determine the displayed size while maintaining aspect ratio
    const aspectRatio = result.width / result.height;
    let displayWidth = maxWidth;
    let displayHeight = displayWidth / aspectRatio;
    
    if (displayHeight > maxHeight) {
      displayHeight = maxHeight;
      displayWidth = displayHeight * aspectRatio;
    }
    
    // Position centered in the viewport
    const x = (viewWidth - displayWidth) / 2;
    const y = (viewHeight - displayHeight) / 2;
    
    // Create a new enhanced image object
    const newImage: EnhancedImage = {
      id: `enhanced_${Date.now()}`,
      url: result.path,
      x,
      y,
      width: displayWidth,
      height: displayHeight,
      prompt: result.prompt,
      base64Data: result.base64Data,
      isDragging: false,
      isResizing: false,
      resizeHandle: null
    };

    // Add to the list of enhanced images
    setInteractiveEnhancedImages(prev => [...prev, newImage]);
  };

  const handleImageUpdate = (newBase64Data: string) => {
    // Update the most recently added enhanced image
    setInteractiveEnhancedImages(prev => {
      if (prev.length === 0) return prev;
      const lastImage = prev[prev.length - 1];
      return [
        ...prev.slice(0, -1),
        {
          ...lastImage,
          base64Data: newBase64Data
        }
      ];
    });
  };

  // Add a function to render enhanced images on the canvas
  const renderEnhancedImages = () => {
    return interactiveEnhancedImages.map((image, index) => (
      <div 
        key={image.id}
        className="absolute"
        style={{
          left: `${image.x}px`,
          top: `${image.y}px`,
          width: `${image.width}px`,
          height: `${image.height}px`,
          border: '2px solid #9333ea',
          borderRadius: '4px',
          overflow: 'hidden',
          pointerEvents: 'auto',
          touchAction: 'none',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          zIndex: 20,
          cursor: image.isDragging ? 'grabbing' : 'grab'
        }}
        onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index)}
      >
        <img
          src={`data:image/png;base64,${image.base64Data}`}
          alt={`Enhanced image generated from prompt: ${image.prompt}`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            pointerEvents: 'none'
          }}
        />
        
        {/* Close button */}
        <div className="absolute top-2 right-2 bg-white rounded-full w-8 h-8 flex items-center justify-center text-red-600 hover:text-red-800 hover:bg-red-100 shadow-md"
          style={{ cursor: 'pointer', zIndex: 30 }}
          onClick={(e) => {
            e.stopPropagation();
            const updatedImages = interactiveEnhancedImages.filter((_, i) => i !== index);
            setInteractiveEnhancedImages(updatedImages);
          }}
        >
          ✕
        </div>
        
        {/* Add EnhancedImageActions component without onClose prop */}
        <EnhancedImageActions 
          imageData={{
            path: image.url,
            filename: image.id,
            base64Data: image.base64Data || ''
          }}
          onImageUpdate={handleImageUpdate}
        />

        {/* Resize handles - all 8 directions */}
        <div className="absolute top-0 left-0 w-4 h-4 bg-purple-500 rounded-br-md cursor-nwse-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'top-left');
          }}
        />
        <div className="absolute top-0 right-0 w-4 h-4 bg-purple-500 rounded-bl-md cursor-nesw-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'top-right');
          }}
        />
        <div className="absolute bottom-0 left-0 w-4 h-4 bg-purple-500 rounded-tr-md cursor-nesw-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'bottom-left');
          }}
        />
        <div className="absolute bottom-0 right-0 w-4 h-4 bg-purple-500 rounded-tl-md cursor-nwse-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'bottom-right');
          }}
        />
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-purple-500 rounded-b-md cursor-ns-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'top');
          }}
        />
        <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-purple-500 rounded-t-md cursor-ns-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'bottom');
          }}
        />
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-r-md cursor-ew-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'left');
          }}
        />
        <div className="absolute right-0 top-1/2 transform -translate-y-1/2 w-4 h-4 bg-purple-500 rounded-l-md cursor-ew-resize"
          style={{ zIndex: 30 }}
          onPointerDown={(e) => {
            e.stopPropagation();
            handlePointerDownOnEnhancedImage(e, index, true, 'right');
          }}
        />
      </div>
    ));
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 overflow-hidden bg-stone-50 relative select-none"
      style={{ 
        touchAction: 'none',
        minHeight: '600px',
        height: '100%',
        width: '100%'
      }}
    >
      {/* Clear All button - only shown when there are shapes */}
      {state.shapes.length > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg shadow-md z-10 text-sm font-medium transition-colors duration-200 group relative"
          onClick={handleClearAll}
          title="Clear All Drawings"
        >
          Clear All
        </button>
      )}
      
      {/* Save to Folder button - only shown when there are shapes */}
      {state.shapes.length > 0 && (
        <button
          className="absolute left-4 top-1/2 mt-12 -translate-y-1/2 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg shadow-md z-10 text-sm font-medium transition-colors duration-200"
          onClick={saveCanvasAsPNG}
          title="Save to img folder"
        >
          Save to Folder
        </button>
      )}

      {/* Enhance with Gemini button - only shown when there are shapes */}
      {state.shapes.length > 0 && (
        <button
          className="absolute left-4 top-1/2 mt-24 -translate-y-1/2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg shadow-md z-10 text-sm font-medium transition-colors duration-200"
          onClick={enhanceDrawingWithGemini}
          disabled={enhancementStatus === 'processing'}
          title="Enhance with Gemini"
        >
          {enhancementStatus === 'processing' ? 'Enhancing...' : 'Enhance with Gemini'}
        </button>
      )}

      {/* Enhanced image display - replaced by interactive images */}
      {enhancedImage && (
        <div 
          className="absolute right-4 bottom-4 z-20 shadow-lg rounded-lg overflow-hidden"
          style={{ pointerEvents: 'auto' }}
        >
          <img 
            src={enhancedImage} 
            alt="Gemini Enhanced" 
            className="max-h-80 max-w-sm object-contain bg-white"
            style={{ border: '3px solid #9333ea', pointerEvents: 'none' }}
          />
          <div
            className="absolute top-2 right-2 bg-white rounded-full w-8 h-8 flex items-center justify-center text-red-600 hover:text-red-800 hover:bg-red-100 border-2 border-red-500 shadow-lg"
            style={{ zIndex: 100, pointerEvents: 'auto', cursor: 'pointer' }}
            onClick={() => {
              setEnhancedImage(null);
              window.showToast('Preview closed', 'success', 2000);
            }}
            onMouseDown={(e) => {
              // Stop propagation at all levels
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            onPointerDown={(e) => {
              // Stop propagation at all levels
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            role="button"
            aria-label="Close preview"
          >
            ✕
          </div>
        </div>
      )}

      {/* Render interactive enhanced images */}
      {renderEnhancedImages()}
      
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="absolute top-0 left-0 w-full h-full touch-none"
        style={{ 
          cursor: getCursorForTool(state.tool),
          pointerEvents: 'auto',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTapHighlightColor: 'rgba(0,0,0,0)',
          zIndex: 1
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />
      {textInput.visible && (
        <div
          className="absolute"
          style={{
            left: textInput.position.x * state.viewTransform.scale + state.viewTransform.offsetX,
            top: textInput.position.y * state.viewTransform.scale + state.viewTransform.offsetY,
          }}
        >
          <input
            type="text"
            autoFocus
            value={textInput.value}
            onChange={handleTextInputChange}
            onKeyDown={handleTextInputKeyDown}
            onBlur={submitTextInput}
            className="border border-blue-400 px-2 py-1 outline-none rounded shadow-sm"
            style={{
              fontSize: `${state.defaultStyle.fontSize! * state.viewTransform.scale}px`,
              color: state.defaultStyle.strokeColor,
            }}
          />
        </div>
      )}
    </div>
  )
}

export default Canvas

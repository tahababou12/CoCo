import React, { useRef, useEffect, useState, useLayoutEffect } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { Point, Shape } from '../types'
import { renderShape } from '../utils/renderShape'
import { hitTest } from '../utils/hitTest'

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
  const [lastSavedFilename, setLastSavedFilename] = useState<string | null>(null)
  
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
    console.log('renderCanvas called');
    const canvas = canvasRef.current;
    let ctx = ctxRef.current;
    
    if (!canvas) {
      console.error('Cannot render: canvas not available');
      return;
    }
    
    if (!ctx) {
      console.error('Cannot render: context not available');
      
      // Try to reinitialize the context
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        console.log('Successfully reinitialized context');
        ctxRef.current = context;
        ctx = context;
      } else {
        console.error('Failed to reinitialize context');
        return;
      }
    }

    // At this point, we know ctx is not null
    const context = ctx;

    // Make sure canvas has dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('Canvas has zero dimensions, setting defaults');
      canvas.width = 800;
      canvas.height = 600;
    }

    console.log(`Rendering canvas ${canvas.width}x${canvas.height} with ${state.shapes.length} shapes`);
    
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
        console.log(`Rendering shape ${index}: ${shape.type}`);
        renderShape(context, shape);
      });
    }

    // Draw current shape being created
    if (state.currentShape) {
      console.log('Drawing current shape:', state.currentShape.type);
      console.log('Current shape has points:', state.currentShape.points.length);
      
      // Extra validation to help debugging
      if (state.currentShape.points.length === 0) {
        console.warn('Current shape has no points!');
      }
      
      renderShape(context, state.currentShape);
      
      // If we have a current shape, we should be in drawing mode
      if (!isDrawing) {
        console.log('Syncing drawing state to true');
        setIsDrawing(true);
      }
    } else if (isDrawing) {
      // No current shape but drawing flag is true - sync state
      console.log('No current shape but isDrawing=true, syncing state');
      setIsDrawing(false);
    }

    context.restore();
  };

  // Initialize canvas and context
  useEffect(() => {
    console.log('Canvas initialization effect running');
    
    // Ensure we have references to both canvas and container
    if (!canvasRef.current) {
      console.error('Canvas element not available during initialization');
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
    
    console.log(`Canvas dimensions set: ${canvas.width}x${canvas.height}`);
    
    // Use willReadFrequently for better performance with frequent reads
    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!context) {
      console.error('Failed to get canvas 2d context');
      return;
    }
    
    // Set up context properties
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = state.defaultStyle.strokeColor || '#000';
    context.lineWidth = state.defaultStyle.strokeWidth || 2;
    
    ctxRef.current = context;
    console.log('Canvas context initialized');
    
    // Force an initial render after a short delay to ensure everything is set up
    setTimeout(() => {
      console.log('Triggering delayed initial render');
      renderCanvas();
    }, 200);
    
    // Add extra debugging on the canvas element
    canvas.addEventListener('pointerdown', () => {
      console.log('Native pointerdown event fired');
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
        
        console.log(`Resizing canvas to: ${width}x${height}`);
        
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
      console.log('Canvas detected drawing started externally, syncing state');
      setIsDrawing(true);
    }
    
    // Handle case where drawing ends from HandDrawing component
    if (!state.currentShape && isDrawing) {
      console.log('Canvas detected drawing ended externally, syncing state');
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
    console.log('React handlePointerDown triggered', e.type, e.clientX, e.clientY);
    
    if (!canvasRef.current) {
      console.error('Canvas ref not available in handlePointerDown');
      return;
    }
    
    // Check if the target is a button or div with role="button"
    // If so, don't handle canvas pointer events
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || 
        (target.tagName === 'DIV' && target.getAttribute('role') === 'button') ||
        target.closest('button') || 
        target.closest('[role="button"]')) {
      console.log('Clicked on a button - not handling canvas event');
      return;
    }
    
    // Prevent default behavior to ensure drawing works
    e.preventDefault();
    e.stopPropagation();
    
    try {
      // Capture pointer to ensure all events go to this element
      canvasRef.current.setPointerCapture(e.pointerId);
      console.log('Pointer captured successfully', e.pointerId);
    } catch (err) {
      console.error('Failed to capture pointer', err);
    }
    
    const point = getCanvasPoint(e.clientX, e.clientY);
    console.log('Pointer down at', point, 'with tool', state.tool);
    
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
        console.log('Starting to draw with', state.tool);
        setIsDrawing(true);
        dispatch({
          type: 'START_DRAWING',
          payload: { point, type: state.tool },
        });
        break;

      default:
        console.warn('Unknown tool:', state.tool);
        break;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!canvasRef.current) {
      console.warn('Canvas ref not available in handlePointerMove');
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
      console.log('Drawing in progress...', state.tool, point, 'pointerType:', e.pointerType);
      dispatch({ type: 'CONTINUE_DRAWING', payload: point });
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
      console.error('Failed to release pointer capture', err);
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
      console.log('Ending drawing', state.currentShape.type);
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
      const response = await fetch('http://localhost:5001/api/save-image', {
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
      console.log(`Image saved successfully to: ${result.absolutePath}`);
      
      // Save the filename for potential enhancement
      setLastSavedFilename(result.filename);
      
      // Show success message with toast instead of alert
      window.showToast(`Image saved as: ${result.filename}`, 'success', 3000);
      
    } catch (err) {
      console.error('Error saving canvas:', err);
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
      // If no image has been saved yet, silently save it first
      if (!lastSavedFilename) {
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
        const saveResponse = await fetch('http://localhost:5001/api/save-image', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageData: dataUrl }),
        });
        
        if (!saveResponse.ok) {
          const errorData = await saveResponse.json();
          throw new Error(`Server error while saving: ${errorData.error || 'Unknown error'}`);
        }
        
        const saveResult = await saveResponse.json();
        console.log(`Image silently saved for enhancement: ${saveResult.absolutePath}`);
        
        // Save the filename for enhancement
        setLastSavedFilename(saveResult.filename);
      }
      
      // If we still don't have a filename, something went wrong
      if (!lastSavedFilename) {
        throw new Error('Failed to save the drawing before enhancement');
      }

      // Use a default enhancement prompt
      const defaultPrompt = 'Enhance this sketch into an image with more detail';

      // Request image enhancement from Flask server
      const response = await fetch('http://localhost:5001/api/enhance-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename: lastSavedFilename,
          prompt: defaultPrompt
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server error: ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('Enhancement started:', result);

      if (result.success && result.requestId) {
        // Show a toast notification that enhancement is in progress
        window.showToast('Enhancing your drawing with Gemini...', 'info', 3000);
        
        // Poll for enhancement status
        pollEnhancementStatus(result.requestId);
      } else {
        throw new Error('Failed to start enhancement process');
      }
    } catch (err) {
      console.error('Error enhancing drawing:', err);
      window.showToast(`Error enhancing drawing: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
      setEnhancementStatus('error');
    }
  }

  const pollEnhancementStatus = async (requestId: string) => {
    try {
      const response = await fetch(`http://localhost:5001/api/enhancement-status/${requestId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error response: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch enhancement status: ${response.status} ${response.statusText}`);
      }
      
      const status = await response.json();
      console.log('Enhancement status:', status);
      
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
        console.error('Enhancement error:', errorMessage);
        window.showToast(`Enhancement failed: ${errorMessage}`, 'error', 3000);
      } else {
        // Unexpected status
        setEnhancementStatus('error');
        window.showToast(`Unexpected status returned: ${status.status}`, 'error', 3000);
      }
    } catch (err) {
      console.error('Error polling enhancement status:', err);
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
    const newImage: EnhancedImage = {
      id: `enhanced-${new Date().getTime()}`,
      url: `http://localhost:5001${result.path}`,
      x: state.viewTransform.offsetX + 100, // Position in the visible area
      y: state.viewTransform.offsetY + 100,
      width: result.width / 2, // Display at half size initially
      height: result.height / 2,
      prompt: result.prompt,
      base64Data: result.base64Data,
      isDragging: false,
      isResizing: false,
      resizeHandle: null
    };

    setInteractiveEnhancedImages(prev => [...prev, newImage]);
    
    // Hide the static enhanced image display
    setEnhancedImage(null);
  };

  // Add a function to render enhanced images on the canvas
  const renderEnhancedImages = () => {
    return interactiveEnhancedImages.map((img, index) => (
      <div 
        key={img.id}
        className="absolute"
        style={{
          left: img.x,
          top: img.y,
          width: img.width,
          height: img.height,
          cursor: img.isResizing ? 'nwse-resize' : 'move',
          zIndex: 10,
          pointerEvents: 'all' // Ensure this div captures pointer events
        }}
        onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index)}
      >
        <img 
          src={img.url}
          alt={`Enhanced: ${img.prompt}`}
          className="w-full h-full object-contain"
          style={{ 
            pointerEvents: 'none',
            border: '2px solid #9333ea',
            borderRadius: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.8)'
          }}
        />
        
        {/* Resize handles */}
        <div className="absolute top-0 left-0 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-nwse-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'nw')}
        />
        <div className="absolute top-0 right-0 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-nesw-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'ne')}
        />
        <div className="absolute bottom-0 left-0 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-nesw-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'sw')}
        />
        <div className="absolute bottom-0 right-0 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-nwse-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'se')}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-ns-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'n')}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-ns-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 's')}
        />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-ew-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'w')}
        />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white border border-purple-600 rounded-full cursor-ew-resize"
          onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'e')}
        />
        
        {/* Delete button with improved event handling */}
        <div
          className="absolute -top-3 -right-3 bg-white rounded-full w-8 h-8 flex items-center justify-center text-red-600 hover:text-red-800 hover:bg-red-100 border-2 border-red-500 shadow-lg"
          style={{ zIndex: 100, pointerEvents: 'auto', cursor: 'pointer' }}
          onClick={() => {
            // Create a completely new array without the clicked image
            const newImages = interactiveEnhancedImages.filter((_, i) => i !== index);
            setInteractiveEnhancedImages(newImages);
            
            // Clear any drag state
            setDragStartPos(null);
            setInitialImageState(null);
            
            window.showToast('Image removed from canvas', 'success', 2000);
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
        >
          ✕
        </div>
      </div>
    ));
  }

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

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

const Canvas: React.FC = () => {
  const { state, dispatch } = useDrawing()
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null)
  const backgroundCanvasRef = useRef<HTMLCanvasElement>(null)
  const drawingCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const backgroundCtxRef = useRef<CanvasRenderingContext2D | null>(null)
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

  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);

  const [showGenSettings, setShowGenSettings] = useState(false);
  const [genSettings, setGenSettings] = useState({
    style: '',
    mood: '',
    details: ''
  });

  const renderBackground = () => {
    const canvas = backgroundCanvasRef.current;
    const context = backgroundCtxRef.current;
    if (!canvas || !context) return;
    context.fillStyle = '#fffbeb';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  const renderDrawing = () => {
    const canvas = drawingCanvasRef.current;
    const context = drawingCtxRef.current;
    if (!canvas || !context) return;
    
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(state.viewTransform.offsetX, state.viewTransform.offsetY);
    context.scale(state.viewTransform.scale, state.viewTransform.scale);

    state.shapes.forEach(shape => renderShape(context, shape));

    if (state.currentShape) {
      const currentShapeWithStyle = {
        ...state.currentShape,
        style: { ...state.defaultStyle, ...state.currentShape.style }
      };
      renderShape(context, currentShapeWithStyle);
    }
    context.restore();
  };

  useEffect(() => {
    const drawingCanvas = drawingCanvasRef.current;
    const backgroundCanvas = backgroundCanvasRef.current;
    const container = containerRef.current;

    if (!drawingCanvas || !backgroundCanvas || !container) return;

    drawingCtxRef.current = drawingCanvas.getContext('2d');
    backgroundCtxRef.current = backgroundCanvas.getContext('2d');
    const drawingCtx = drawingCtxRef.current;
    if (drawingCtx) {
      drawingCtx.lineCap = 'round';
      drawingCtx.lineJoin = 'round';
    }

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      drawingCanvas.width = width;
      drawingCanvas.height = height;
      backgroundCanvas.width = width;
      backgroundCanvas.height = height;
      renderBackground();
      renderDrawing();
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(renderDrawing, [state.shapes, state.currentShape, state.viewTransform]);
  useLayoutEffect(renderBackground, [state.viewTransform]);

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
    if (drawingCanvasRef.current) {
      drawingCanvasRef.current.style.cursor = getCursorForTool(state.tool)
    }
  }, [state.tool])

  const getCanvasPoint = (clientX: number, clientY: number): Point => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - state.viewTransform.offsetX) / state.viewTransform.scale
    const y = (clientY - rect.top - state.viewTransform.offsetY) / state.viewTransform.scale
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    void (DEBUG && console.log('React handlePointerDown triggered', e.type, e.clientX, e.clientY));
    
    if (!drawingCanvasRef.current) {
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
      drawingCanvasRef.current.setPointerCapture(e.pointerId);
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
    if (!drawingCanvasRef.current) {
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
      
      if (DEBUG) {
        console.log('Mouse eraser at point:', point);
        console.log('Mouse eraser found shape:', shapeToErase ? `${shapeToErase.id} (${shapeToErase.type})` : 'none');
      }
      
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
      
      // No need to re-dispatch SET_STYLE here since renderDrawing will handle it
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
    if (!drawingCanvasRef.current) return;
    
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
      drawingCanvasRef.current.releasePointerCapture(e.pointerId);
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
    const drawingCanvas = drawingCanvasRef.current;
    const backgroundCanvas = backgroundCanvasRef.current;
    if (!drawingCanvas || !backgroundCanvas || state.shapes.length === 0) return;
  
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
  
    tempCanvas.width = drawingCanvas.width;
    tempCanvas.height = drawingCanvas.height;
  
    // 1. Draw the background color
    tempCtx.fillStyle = '#fffbeb'; // Same as background canvas
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // 2. Apply the view transform to match the current view
    tempCtx.save();
    tempCtx.translate(state.viewTransform.offsetX, state.viewTransform.offsetY);
    tempCtx.scale(state.viewTransform.scale, state.viewTransform.scale);
    
    // 3. Re-render all shapes (this will properly handle composite operations like erasing)
    state.shapes.forEach(shape => {
      renderShape(tempCtx, shape);
    });
    
    // 4. Restore the transform
    tempCtx.restore();
  
    try {
      const dataUrl = tempCanvas.toDataURL('image/png');
      const response = await fetch('http://localhost:5001/api/save-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl }),
      });
      if (!response.ok) throw new Error('Failed to save image');
      const result = await response.json();
      window.showToast(`Image saved as: ${result.filename}`, 'success', 3000);
    } catch {
      window.showToast(`Error saving image`, 'error', 3000);
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
      void (DEBUG && console.log(`Image saved for enhancement: ${saveResult.absolutePath}`));
      
      // Use a default enhancement prompt
      const defaultPrompt = 'Enhance this sketch into a more interesting image with a little bit more detail. Make sure to follow the artstyle, mood, and extra details if provided, othewise just stick to a normal enhancement.';

      let customPrompt = defaultPrompt;
      const customParts = [];
      if (genSettings.style.trim()) customParts.push(`Artstyle: ${genSettings.style.trim()}.`);
      if (genSettings.mood.trim()) customParts.push(`Mood/emotion: ${genSettings.mood.trim()}.`);
      if (genSettings.details.trim()) customParts.push(`Extra details: ${genSettings.details.trim()}.`);
      if (customParts.length > 0) customPrompt = `${defaultPrompt}\n${customParts.join(' ')}`;

      // Request image enhancement from Flask server
      const response = await fetch('http://localhost:5001/api/enhance-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename: saveResult.filename,
          prompt: customPrompt
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server error: ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
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
      const response = await fetch(`http://localhost:5001/api/enhancement-status/${requestId}`);
      
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
    if (drawingCanvasRef.current) {
      drawingCanvasRef.current.setPointerCapture(e.pointerId);
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
    
    // Create a unique ID for this image
    const id = `enhanced-${Date.now()}`;
    
    // Add the image to the state
    setInteractiveEnhancedImages(prev => [
      ...prev,
      {
        id,
        url: `http://localhost:5001${result.path}`,
        x,
        y,
        width: displayWidth,
        height: displayHeight,
        prompt: result.prompt,
        base64Data: result.base64Data,
        isDragging: false,
        isResizing: false,
        resizeHandle: null
      }
    ]);
    
    // Show the preview image
    setEnhancedImage(`http://localhost:5001${result.path}`);
  };

  // Add a function to render enhanced images on the canvas
  const renderEnhancedImages = () => {
    return interactiveEnhancedImages.map((image, index) => (
      <div
        key={image.id}
        className="absolute border-2 border-purple-500 bg-white shadow-lg rounded-lg overflow-hidden"
        style={{
          left: image.x,
          top: image.y,
          width: image.width,
          height: image.height,
          cursor: image.isDragging ? 'grabbing' : 'grab',
          zIndex: selectedImageIndex === index ? 25 : 20,
          borderColor: selectedImageIndex === index ? '#8b5cf6' : '#a855f7',
          borderWidth: selectedImageIndex === index ? '3px' : '2px',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          handlePointerDownOnEnhancedImage(e, index);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedImageIndex(index);
        }}
      >
        <img
          src={image.url}
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
            if (selectedImageIndex === index) {
              setSelectedImageIndex(null);
            }
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }}
        >
          ✕
        </div>
        
        {/* Action buttons at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-center space-x-3 z-50 bg-black bg-opacity-60 py-2 px-3 pointer-events-auto">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              console.log('Add to storyboard clicked for index:', index);
              addToStoryboard(index);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors shadow flex items-center cursor-pointer"
            title="Add to Storyboard"
            style={{ pointerEvents: 'auto' }}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            Add to Storyboard
          </button>
          
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              console.log('Download clicked for index:', index);
              downloadImage(index);
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
            }}
            className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors shadow flex items-center cursor-pointer"
            title="Download Image"
            style={{ pointerEvents: 'auto' }}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
        </div>
      </div>
    ));
  };

  const addToStoryboard = async (imageIndex: number) => {
    try {
      const image = interactiveEnhancedImages[imageIndex];
      console.log('=== ADDING TO STORYBOARD FROM FRONTEND ===');
      console.log('Original image.url:', image.url);
      console.log('Image object:', image);
      
      // Extract just the path part from the full URL
      const path = image.url.replace('http://localhost:5001', '');
      console.log('Extracted path being sent to backend:', path);
      
      const response = await fetch('http://localhost:5001/api/storyboard/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imagePath: path }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add image to storyboard: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        const message = data.isDuplicate ? 'Image already in storyboard' : 'Image added to storyboard!';
        const toastType = data.isDuplicate ? 'info' : 'success';
        window.showToast(message, toastType, 2000);
      } else {
        throw new Error('Failed to add image to storyboard');
      }
    } catch (err) {
      console.error('Error adding image to storyboard:', err);
      window.showToast(`Error adding to storyboard: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  };

  const downloadImage = (imageIndex: number) => {
    const image = interactiveEnhancedImages[imageIndex];
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${image.base64Data || ''}`;
    link.download = image.id;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showToast('Image downloading...', 'success', 2000);
  };

  return (
    <div 
      ref={containerRef} 
      className="absolute inset-0 bg-stone-50 select-none" 
      style={{ touchAction: 'none' }}
      onClick={(e) => {
        // Deselect image when clicking on empty space
        if (e.target === e.currentTarget) {
          setSelectedImageIndex(null);
        }
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
        <>
          <button
            className="absolute left-4 top-1/2 mt-24 -translate-y-1/2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg shadow-md z-10 text-sm font-medium transition-colors duration-200"
            onClick={enhanceDrawingWithGemini}
            disabled={enhancementStatus === 'processing'}
            title="Enhance with Gemini"
          >
            {enhancementStatus === 'processing' ? 'Enhancing...' : 'Enhance with Gemini'}
          </button>
          <button
            className="absolute left-4 top-1/2 mt-36 -translate-y-1/2 bg-gray-600 hover:bg-gray-700 text-gray-100 px-3 py-1.5 rounded-lg shadow-md z-10 text-sm font-medium transition-colors duration-200"
            onClick={() => setShowGenSettings(true)}
            title="Generation Settings"
          >
            Generation Settings
          </button>
          {showGenSettings && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
              <div className="relative bg-white rounded-lg w-full max-w-md mx-auto shadow-xl overflow-hidden" style={{maxHeight: '90vh'}}>
                <button
                  className="absolute top-4 right-4 text-gray-400 hover:text-gray-500 text-2xl"
                  onClick={() => setShowGenSettings(false)}
                  title="Close"
                >
                  ×
                </button>
                <div className="p-6">
                  <h2 className="text-2xl font-bold mb-6 text-purple-800">Generation Settings</h2>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Style</label>
                    <div className="text-xs text-gray-500 mb-1">What artstyle should generations follow?</div>
                    <input type="text" className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" value={genSettings.style} onChange={e => setGenSettings(s => ({...s, style: e.target.value}))} />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Mood</label>
                    <div className="text-xs text-gray-500 mb-1">What emotions are you hoping to showcase?</div>
                    <input type="text" className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" value={genSettings.mood} onChange={e => setGenSettings(s => ({...s, mood: e.target.value}))} />
                  </div>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700">Additional details</label>
                    <div className="text-xs text-gray-500 mb-1">Any relevant information.</div>
                    <textarea className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500" value={genSettings.details} onChange={e => setGenSettings(s => ({...s, details: e.target.value}))} />
                  </div>
                  <button
                    className="w-full bg-purple-600 text-white rounded py-2 mt-2 hover:bg-purple-700 transition-colors"
                    onClick={() => setShowGenSettings(false)}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
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
      
      {/* Floating action panel for selected enhanced image */}
      {selectedImageIndex !== null && interactiveEnhancedImages[selectedImageIndex] && (
        <div 
          className="absolute bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50"
          style={{
            left: interactiveEnhancedImages[selectedImageIndex].x + interactiveEnhancedImages[selectedImageIndex].width + 10,
            top: interactiveEnhancedImages[selectedImageIndex].y,
            minWidth: '200px'
          }}
        >
          <div className="flex justify-between items-center mb-2">
            <div className="text-sm font-medium text-gray-700">Image Actions</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedImageIndex(null);
              }}
              className="text-gray-400 hover:text-gray-600 text-lg font-bold cursor-pointer"
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="space-y-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                addToStoryboard(selectedImageIndex);
              }}
              className="w-full text-xs px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors shadow flex items-center justify-center cursor-pointer"
              title="Add to Storyboard"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              Add to Storyboard
            </button>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadImage(selectedImageIndex);
              }}
              className="w-full text-xs px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors shadow flex items-center justify-center cursor-pointer"
              title="Download Image"
            >
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download
            </button>
          </div>
        </div>
      )}
      
      <canvas ref={backgroundCanvasRef} className="absolute top-0 left-0" style={{ zIndex: 0, pointerEvents: 'none' }} />
      <canvas
        ref={drawingCanvasRef}
        className="absolute top-0 left-0 touch-none"
        style={{ zIndex: 1, cursor: getCursorForTool(state.tool) }}
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

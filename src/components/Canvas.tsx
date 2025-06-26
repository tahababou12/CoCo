import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { Point, Shape } from '../types'
import { renderShape } from '../utils/renderShape'
import { hitTest } from '../utils/hitTest'
import EnhancedImageActions from './EnhancedImageActions'
import { Mic, MicOff, Volume2 } from 'lucide-react'
import { useShapes } from '../ShapesContext'
import html2canvas from 'html2canvas'

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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface CanvasProps extends Record<string, never> {}

const Canvas: React.FC<CanvasProps> = () => {
  const { state, dispatch } = useDrawing()
  const { setCanvas } = useShapes()
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
  const [enhancementStatus, setEnhancementStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle')
  const [enhancedImage, setEnhancedImage] = useState<string | null>(null)

  // Add state for interactive enhanced images
  const [interactiveEnhancedImages, setInteractiveEnhancedImages] = useState<EnhancedImage[]>([])
  const [dragStartPos, setDragStartPos] = useState<Point | null>(null)
  const [initialImageState, setInitialImageState] = useState<EnhancedImage | null>(null)

  const [showGenSettings, setShowGenSettings] = useState(false);
  const [genSettings, setGenSettings] = useState({
    style: '',
    mood: '',
    details: ''
  });

  // Multimodal AI state
  const [isMultimodalConnected, setIsMultimodalConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [multimodalMessages, setMultimodalMessages] = useState<Array<{type: 'user' | 'assistant', content: string, timestamp: Date, isTranscript?: boolean}>>([])
  const [multimodalError, setMultimodalError] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'muted'>('idle')
  const [isMuted, setIsMuted] = useState(false)
  
  // Multimodal refs
  const multimodalWebSocketRef = useRef<WebSocket | null>(null)
  const multimodalAudioContextRef = useRef<AudioContext | null>(null)
  const multimodalMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const multimodalPcmDataRef = useRef<number[]>([])
  const multimodalAudioQueueRef = useRef<string[]>([])
  const multimodalIsPlayingRef = useRef(false)
  const multimodalStreamingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Real-time canvas streaming to Gemini
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);

  const lastCanvasHashRef = useRef<string>('');

  // Add state to track if we should pause streaming during critical operations
  const [isStreamingPaused, setIsStreamingPaused] = useState(false);

  // Add a ref to always get the latest state
  const stateRef = useRef(state);
  stateRef.current = state;

  // Debug effect to log when shapes change
  useEffect(() => {
    console.log('🔄 SHAPES CHANGED - Current count:', state.shapes.length);
    console.log('🔄 SHAPES CHANGED - Shapes:', state.shapes);
    console.log('🔄 SHAPES CHANGED - Is AI connected:', isMultimodalConnected);
  }, [state.shapes, isMultimodalConnected]);

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
    const canvas = canvasRef.current;
    const context = ctxRef.current;
    if (!canvas || !context) return;
    
    // Clear the entire canvas
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    context.fillStyle = '#fffbeb';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Apply transform and draw shapes
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
    
    // Trigger immediate canvas capture after rendering is complete
    const triggerCapture = (window as Window & { triggerImmediateCanvasCapture?: () => void }).triggerImmediateCanvasCapture;
    if (triggerCapture && (isDrawing || state.currentShape)) {
      console.log('🎨 Rendering complete, triggering canvas capture...');
      // Small delay to ensure rendering is fully complete
      setTimeout(() => {
        const triggerCaptureInner = (window as Window & { triggerImmediateCanvasCapture?: () => void }).triggerImmediateCanvasCapture;
        if (triggerCaptureInner) {
          console.log('⚡ Triggering canvas capture after render...');
          triggerCaptureInner();
        }
      }, 10);
    }
    
    // Also trigger capture during drawing for more frequent updates
    if (triggerCapture && isDrawing && state.currentShape) {
      // Trigger additional captures during drawing for smoother streaming
      setTimeout(() => {
        const triggerCaptureInner = (window as Window & { triggerImmediateCanvasCapture?: () => void }).triggerImmediateCanvasCapture;
        if (triggerCaptureInner && isDrawing) {
          triggerCaptureInner();
        }
      }, 100);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) return;

    ctxRef.current = canvas.getContext('2d');
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = width;
      canvas.height = height;
      renderCanvas();
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  useLayoutEffect(renderCanvas, [state.shapes, state.currentShape, state.viewTransform]);

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
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - state.viewTransform.offsetX) / state.viewTransform.scale
    const y = (clientY - rect.top - state.viewTransform.offsetY) / state.viewTransform.scale
    return { x, y };
  };

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
        // Set erasing style by painting with background color
        dispatch({
          type: 'SET_STYLE',
          payload: { 
            strokeColor: '#fffbeb', // Use background color to "erase" by painting over
            strokeWidth: (state.defaultStyle.strokeWidth || 2) * 2.5, // Larger width for erasing
            globalCompositeOperation: 'source-over' // Normal drawing operation
          }
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
    
    // Capture canvas during drawing for real-time streaming
    if (isMultimodalConnected && multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
      const canvasContainer = document.querySelector('[data-canvas-container]');
      if (canvasContainer) {
        html2canvas(canvasContainer as HTMLElement, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#fafaf9',
          scale: 1,
          logging: false
        }).then(canvas => {
        const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
          console.log('📷 [DRAWING] Drawing detected - capturing canvas container...');
        
        const payload = {
          realtime_input: {
            media_chunks: [{
              mime_type: "image/jpeg",
              data: imageData,
            }],
          },
        };
        
        multimodalWebSocketRef.current.send(JSON.stringify(payload));
          console.log('📷 [DRAWING] Canvas container frame sent to Gemini');
        }).catch(err => {
          console.error('❌ [DRAWING] Failed to capture canvas container:', err);
        });
      }
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

    // Handle enhanced image dragging and resizing - check this first
    if (dragStartPos && initialImageState) {
      const dx = (e.clientX - dragStartPos.x) / state.viewTransform.scale;
      const dy = (e.clientY - dragStartPos.y) / state.viewTransform.scale;

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
            newWidth = Math.max(50 / state.viewTransform.scale, initialImageState.width + dx);
          }
          if (img.resizeHandle.includes('s')) {
            newHeight = Math.max(50 / state.viewTransform.scale, initialImageState.height + dy);
          }
          if (img.resizeHandle.includes('w')) {
            newWidth = Math.max(50 / state.viewTransform.scale, initialImageState.width - dx);
            newX = initialImageState.x + dx;
          }
          if (img.resizeHandle.includes('n')) {
            newHeight = Math.max(50 / state.viewTransform.scale, initialImageState.height - dy);
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
      
      // No need to re-dispatch SET_STYLE here since renderCanvas will handle it
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
    }
    
    if (isDrawing && state.currentShape) {
      void (DEBUG && console.log('Ending drawing', state.currentShape.type));
      setIsDrawing(false);
      dispatch({ type: 'END_DRAWING' });
      
      // Pause streaming during critical operations
      setIsStreamingPaused(true);
      
      // Immediately send canvas update to Gemini when drawing stops
      if (isLiveStreaming && multimodalWebSocketRef.current) {
        setTimeout(async () => {
          const currentCanvas = await getCanvasHash();
          if (currentCanvas && typeof currentCanvas === 'string') {
            const payload = {
              realtime_input: {
                media_chunks: [
                  {
                    mime_type: "image/jpeg",
                    data: currentCanvas.split(',')[1],
                  },
                ],
              },
            };
            multimodalWebSocketRef.current?.send(JSON.stringify(payload));
            console.log('📡 Sent immediate canvas update after drawing');
          }
          
          // Resume streaming after a short delay
          setTimeout(() => {
            setIsStreamingPaused(false);
          }, 500);
        }, 100); // Small delay to ensure canvas is fully rendered
      } else {
        // Resume streaming if not live streaming
        setTimeout(() => {
          setIsStreamingPaused(false);
        }, 500);
      }
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
    dispatch({ type: 'CLEAR_ALL' });
  }

  const saveCanvasAsPNG = async () => {
    const canvas = canvasRef.current;
    if (!canvas || state.shapes.length === 0) return;
  
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
  
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
  
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

  // Wrapper function for multimodal server to use
  const enhanceDrawingWithGeminiWithPrompt = useCallback(async (prompt: string, fromMultimodal: boolean = false) => {
    console.log('🚀 Starting enhancement with prompt:', prompt);
    console.log('🚀 From multimodal:', fromMultimodal);
    console.log('🚀 Current shapes count:', stateRef.current.shapes.length);
    
    // Pause streaming during enhancement to prevent interference
    setIsStreamingPaused(true);
    
    try {
      // Check if there are shapes to save (including any that might have been completed)
      if (stateRef.current.shapes.length === 0) {
        console.log('❌ No shapes to enhance - please draw something first');
      window.showToast('Draw something first before enhancing', 'info', 3000);
        
        // If called from multimodal server, send error back
        if (fromMultimodal && multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
          console.log('📤 Sending "no shapes" error back to multimodal server');
          multimodalWebSocketRef.current.send(JSON.stringify({
            type: 'enhancement_error',
            error: 'No shapes to enhance - please draw something first',
            success: false
          }));
        }
        
        // Resume streaming
        setIsStreamingPaused(false);
      return;
    }

      console.log('✅ Shapes found, starting enhancement process');
    setEnhancementStatus('processing');
    setEnhancedImage(null);
    
      // Always save the drawing first before enhancing
      console.log('💾 Creating temporary canvas for drawing...');
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
      stateRef.current.shapes.forEach(shape => {
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
      
      console.log(`📐 Canvas dimensions: ${width}x${height}`);
      
      // Fill with a white background
      tempCtx.fillStyle = '#FFFFFF';
      tempCtx.fillRect(0, 0, width, height);
      
      // Apply transform to center the drawings
      tempCtx.translate(-minX, -minY);
      
      // Draw all shapes
      stateRef.current.shapes.forEach(shape => {
        renderShape(tempCtx, shape);
      });
      
      // Convert to image
      const dataUrl = tempCanvas.toDataURL('image/png');
      console.log('🖼️ Image data created, length:', dataUrl.length);
      
      // Send image data to server
      console.log('📤 Saving image to server...');
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
      console.log('✅ Image saved successfully:', saveResult);
      

      // Build the enhancement prompt with generation settings
      const defaultPrompt = 'Enhance this sketch into a more interesting image with a little bit more detail. Make sure to follow the artstyle, mood, and extra details if provided, otherwise just stick to a normal enhancement.';

      let finalPrompt = defaultPrompt;
      const customParts = [];
      if (genSettings.style.trim()) customParts.push(`Artstyle: ${genSettings.style.trim()}.`);
      if (genSettings.mood.trim()) customParts.push(`Mood/emotion: ${genSettings.mood.trim()}.`);
      if (genSettings.details.trim()) customParts.push(`Extra details: ${genSettings.details.trim()}.`);
      
      // If we have custom settings, use them; otherwise use the passed prompt or default
      if (customParts.length > 0) {
        finalPrompt = `${defaultPrompt}\n${customParts.join(' ')}`;
        console.log('🎨 Using custom prompt with generation settings:', finalPrompt);
      } else {
        finalPrompt = prompt || defaultPrompt;
        console.log('🎨 Using default/passed prompt:', finalPrompt);
      }

      // Request image enhancement from Flask server
      console.log('🚀 Calling enhancement API...');
      const response = await fetch('http://localhost:5001/api/enhance-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename: saveResult.filename,
          prompt: finalPrompt
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Server error: ${errorData.error || 'Unknown error'}`);
      }

      const result = await response.json();
      console.log('✅ Enhancement API response:', result);

      if (result.success && result.requestId) {
        console.log('🎯 Enhancement started successfully with requestId:', result.requestId);
        
        // If called from multimodal server, send the requestId back
        if (fromMultimodal && multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
          console.log('📤 Sending requestId back to multimodal server:', result.requestId);
          multimodalWebSocketRef.current.send(JSON.stringify({
            type: 'enhancement_started',
            requestId: result.requestId,
            success: true
          }));
        }
        
        // Show a toast notification that enhancement is in progress
        window.showToast('Enhancing your drawing with Gemini...', 'info', 3000);
        
        // Poll for enhancement status
        console.log('🔄 Starting to poll for enhancement status...');
        pollEnhancementStatus(result.requestId);
      } else {
        throw new Error('Failed to start enhancement process');
      }
    } catch (err) {
      console.error('❌ Error in enhancement process:', err);
      
      // If called from multimodal server, send error back
      if (fromMultimodal && multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
        console.log('📤 Sending enhancement error back to multimodal server');
        multimodalWebSocketRef.current.send(JSON.stringify({
          type: 'enhancement_error',
          error: err instanceof Error ? err.message : String(err),
          success: false
        }));
      }
      
      window.showToast(`Error enhancing drawing: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
      setEnhancementStatus('error');
    } finally {
      // Always resume streaming after enhancement operations
      setIsStreamingPaused(false);
    }
  }, [state.shapes, genSettings]);

  const pollEnhancementStatus = useCallback(async (requestId: string) => {
    console.log('🔄 Polling enhancement status for requestId:', requestId);
    try {
      const response = await fetch(`http://localhost:5001/api/enhancement-status/${requestId}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error response: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch enhancement status: ${response.status} ${response.statusText}`);
      }
      
      const status = await response.json();
      console.log('📊 Enhancement status received:', status);
      
      if (status.status === 'processing') {
        console.log('⏳ Enhancement still processing, will poll again in 2 seconds...');
        // Continue polling every 2 seconds
        setTimeout(() => pollEnhancementStatus(requestId), 2000);
      } else if (status.status === 'complete' && status.result) {
        console.log('✅ Enhancement complete! Result:', status.result);
        // Enhancement is complete, add the enhanced image to the canvas
        setEnhancementStatus('complete');
        
        // Add as interactive image
        console.log('🖼️ Adding enhanced image to canvas...');
        addEnhancedImageToCanvas(status.result);
        
        // Show success toast
        window.showToast('Enhancement complete! Image added to canvas.', 'success', 3000);
      } else if (status.status === 'error') {
        console.error('❌ Enhancement failed with error:', status.message);
        // Enhancement failed
        setEnhancementStatus('error');
        
        // Show a more detailed error message
        const errorMessage = status.message || 'Unknown error occurred';
        console.error('Enhancement error:', errorMessage);
        window.showToast(`Enhancement failed: ${errorMessage}`, 'error', 3000);
      } else {
        console.warn('⚠️ Unexpected status returned:', status.status);
        // Unexpected status
        setEnhancementStatus('error');
        window.showToast(`Unexpected status returned: ${status.status}`, 'error', 3000);
      }
    } catch (err) {
      console.error('❌ Error polling enhancement status:', err);
      setEnhancementStatus('error');
      window.showToast(`Error checking enhancement status: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  }, []);

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
    e.preventDefault();

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
    console.log('🖼️ Adding enhanced image to canvas:', result);
    
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
    
    const imageUrl = `http://localhost:5001${result.path}`;
    console.log('🖼️ Enhanced image URL:', imageUrl);
    console.log('📐 Image position:', { x, y, width: displayWidth, height: displayHeight });
    
    // Add the image to the state
    setInteractiveEnhancedImages(prev => {
      const newImages = [
      ...prev,
      {
        id,
          url: imageUrl,
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
      ];
      console.log('📊 Total enhanced images now:', newImages.length);
      return newImages;
    });
    
    // Show the preview image
    setEnhancedImage(imageUrl);
    console.log('✅ Enhanced image added to canvas successfully');
  };

  // Add a function to render enhanced images on the canvas
  const renderEnhancedImages = () => {
    return interactiveEnhancedImages.map((image, index) => (
      <div
        key={image.id}
        className="absolute border-2 border-purple-500 bg-white shadow-lg rounded-lg overflow-hidden"
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
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          handlePointerDownOnEnhancedImage(e, index);
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
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
        <button
          className="absolute top-2 right-2 bg-white rounded-full w-8 h-8 flex items-center justify-center text-red-600 hover:text-red-800 hover:bg-red-100 shadow-md z-40"
          style={{ cursor: 'pointer' }}
          onClick={e => {
            e.stopPropagation();
            const updatedImages = interactiveEnhancedImages.filter((_, i) => i !== index);
            setInteractiveEnhancedImages(updatedImages);
          }}

          onMouseDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }}
          aria-label="Close enhanced image"
        >
          ✕
        </button>
        
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

  // Multimodal AI functions
  const connectMultimodal = () => {
    console.log('🔌 Connecting to multimodal server...');
    
    if (multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
      console.log('✅ Already connected to multimodal server');
      return;
    }
    
    try {
      multimodalWebSocketRef.current = new WebSocket('ws://localhost:9083');
      
      multimodalWebSocketRef.current.onopen = () => {
        console.log('✅ Connected to multimodal server');
        setIsMultimodalConnected(true);
        setMultimodalError(null);
        
        // Send setup message
        const setupMessage = {
          setup: {
            response_modalities: ["AUDIO", "TEXT"]
          }
        };
        console.log('📤 Sending setup message:', setupMessage);
        multimodalWebSocketRef.current.send(JSON.stringify(setupMessage));
        
        // Send mute state
        multimodalWebSocketRef.current.send(JSON.stringify({
          type: "mute_toggle",
          muted: isMuted
        }));
        
        // Initialize audio system
        initializeMultimodalAudio();
        
        // Start live streaming
        startLiveStreaming();
      };
      
      multimodalWebSocketRef.current.onmessage = (event) => {
        console.log('📨 RAW WEBSOCKET MESSAGE RECEIVED:', event.data);
        handleMultimodalMessage(event);
      };
      
      multimodalWebSocketRef.current.onclose = () => {
        console.log('🔌 Disconnected from multimodal server');
        setIsMultimodalConnected(false);
        setIsRecording(false);
        setIsPlayingAudio(false);
        setVoiceStatus('idle');
        stopLiveStreaming();
      };

      multimodalWebSocketRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setMultimodalError('Failed to connect to AI assistant');
        setIsMultimodalConnected(false);
      };
      
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setMultimodalError('Failed to connect to AI assistant');
    }
  };

  // Auto-start recording when connected and not muted
  useEffect(() => {
    if (isMultimodalConnected && !isMuted && multimodalAudioContextRef.current && !isRecording) {
      // Small delay to ensure everything is initialized
      const timer = setTimeout(() => {
        startMultimodalRecording();
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isMultimodalConnected, isMuted, isRecording]);

  const toggleMute = () => {
    setIsMuted((prev) => {
      const newMuted = !prev;
      setVoiceStatus(newMuted ? 'muted' : 'idle');
      if (newMuted && isRecording) {
      stopMultimodalRecording();
    }
    
      // Send mute/unmute signal to backend
      if (multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
        multimodalWebSocketRef.current.send(JSON.stringify({
          type: 'mute_toggle',
          muted: newMuted
        }));
      }
      
      // Auto-start recording when unmuting
      if (!newMuted && isMultimodalConnected && multimodalAudioContextRef.current && !isRecording) {
        setTimeout(() => {
          startMultimodalRecording();
        }, 500);
      }
      
      return newMuted;
    });
  };

  const handleMultimodalMessage = useCallback(async (event: MessageEvent) => {
    console.log('📨 MULTIMODAL MESSAGE RECEIVED:', event.data);
    
    try {
      const data = JSON.parse(event.data);
      console.log('📨 PARSED MESSAGE DATA:', data);
      
      // If muted, ignore all voice/audio related messages
      if (isMuted) {
        // Only allow non-voice messages when muted
        if (data.type === 'save_and_enhance' || 
            data.type === 'enhancement_started' || 
            data.type === 'enhancement_error' ||
            data.command_detected === 'enhance') {
          // Allow enhancement-related messages even when muted
        } else {
          // Block all other messages (audio, voice_status, text responses, etc.)
          console.log('🔇 Message blocked due to mute:', data);
          return;
        }
      }
      
      // Handle save_and_enhance request from multimodal server
      if (data.type === 'save_and_enhance') {
        console.log('🎯 Save and enhance request from multimodal server:', data);
        console.log('🔍 DEBUG: Current state when enhancement requested:');
        console.log('  - Shapes count:', stateRef.current.shapes.length);
        console.log('  - Shapes:', stateRef.current.shapes);
        console.log('  - Is drawing:', isDrawing);
        console.log('  - Current shape:', stateRef.current.currentShape);
        console.log('  - Tool:', stateRef.current.tool);
        console.log('  - All state keys:', Object.keys(stateRef.current));
        console.log('  - Would show enhance button:', stateRef.current.shapes.length > 0);
        
        // Call EXACTLY the same as the button - no differences at all
        console.log('🚀 Starting enhancement with EXACT same call as button');
        
        // Call EXACTLY like the button does - same function, same parameters
        enhanceDrawingWithGeminiWithPrompt('Enhance this sketch into an image with more detail');
      }
      
      // Handle save_drawing request from multimodal server
      if (data.type === 'save_drawing') {
        console.log('🎤 VOICE COMMAND - Save drawing request from multimodal server');
        console.log('🎤 VOICE COMMAND - Shapes count:', stateRef.current.shapes.length);
        console.log('🎤 VOICE COMMAND - Shapes:', stateRef.current.shapes);
        console.log('🎤 VOICE COMMAND - Is drawing:', isDrawing);
        console.log('🎤 VOICE COMMAND - Current shape:', stateRef.current.currentShape);
        console.log('🎤 VOICE COMMAND - Tool:', stateRef.current.tool);
        console.log('🎤 VOICE COMMAND - View transform:', stateRef.current.viewTransform);
        console.log('🎤 VOICE COMMAND - All state keys:', Object.keys(stateRef.current));
        
        // Call EXACTLY the same function as the button - no differences at all
        console.log('🚀 Calling EXACT same function as button: enhanceDrawingWithGeminiWithPrompt');
        enhanceDrawingWithGeminiWithPrompt('Enhance this sketch into an image with more detail');
      }
      
      if (data.text) {
        const newMessage = {
          type: 'assistant' as const,
          content: data.text,
          timestamp: new Date(),
        };
        setMultimodalMessages(prev => [...prev, newMessage]);
        
        // Remove the Gemini text response toast to avoid unwanted messages
        // if (window.showToast) {
        //   window.showToast(`Gemini: ${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}`, 'info', 5000);
        // }
      }
      
      // Handle enhancement commands triggered by voice
      if (data.command_detected === 'enhance') {
        console.log('🎯 Voice enhancement command detected:', data);
        
        if (data.enhancement_started && data.request_id) {
          // Start polling for enhancement status
          pollEnhancementStatus(data.request_id);
          
          // Show success message
          if (window.showToast) {
            window.showToast('Enhancement started via voice command!', 'success', 3000);
          }
        }
        // Removed error message handling since enhancement is working correctly
      }
      
      if (data.audio) {
        multimodalAudioQueueRef.current.push(data.audio);
        playNextMultimodalAudio();
      }
      
      if (data.voice_status) {
        console.log('Voice status update:', data.voice_status);
        setVoiceStatus(data.voice_status);
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }, [isDrawing, isMuted, setMultimodalMessages, setVoiceStatus, enhanceDrawingWithGeminiWithPrompt, pollEnhancementStatus]);

  const initializeMultimodalAudio = async () => {
    try {
      multimodalAudioContextRef.current = new (window.AudioContext || (window as Window & { webkitAudioContext?: new () => AudioContext }).webkitAudioContext || AudioContext)({ 
        sampleRate: 24000 
      });
      
      await multimodalAudioContextRef.current.audioWorklet.addModule('/pcm-processor.js');
    } catch (err) {
      console.error('Failed to initialize audio context:', err);
      setMultimodalError('Failed to initialize audio system');
    }
  };

  const startMultimodalRecording = async () => {
    console.log('🎤 Starting multimodal recording...');
    console.log('Connection status:', isMultimodalConnected);
    console.log('Audio context:', multimodalAudioContextRef.current);
    
    if (!isMultimodalConnected || !multimodalAudioContextRef.current) {
      console.log('❌ Cannot start recording - not connected or no audio context');
      setMultimodalError('Not connected to AI assistant');
      return;
    }

    try {
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Microphone access granted');
      
      // Pause canvas streaming during voice input to improve response speed
      setIsStreamingPaused(true);
      console.log('⏸️ Paused canvas streaming for voice input');
      
      multimodalMediaRecorderRef.current = new MediaRecorder(stream);
      multimodalPcmDataRef.current = [];

      multimodalMediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const reader = new FileReader();
          reader.onload = () => {
            const arrayBuffer = reader.result as ArrayBuffer;
            const pcmData = new Int16Array(arrayBuffer);
            multimodalPcmDataRef.current.push(...Array.from(pcmData));
          };
          reader.readAsArrayBuffer(event.data);
        }
      };

      multimodalMediaRecorderRef.current.onstop = () => {
        console.log('🎤 Recording stopped, sending voice message...');
        sendMultimodalVoiceMessage();
        stream.getTracks().forEach(track => track.stop());
        
        // Resume canvas streaming after voice input
        setTimeout(() => {
          setIsStreamingPaused(false);
          console.log('▶️ Resumed canvas streaming after voice input');
        }, 1000); // Wait 1 second before resuming
      };

      multimodalMediaRecorderRef.current.start(100);
      setIsRecording(true);
      setMultimodalError(null);
      console.log('✅ Recording started successfully');
    } catch (err) {
      console.error('❌ Failed to start recording:', err);
      setMultimodalError('Failed to access microphone');
      // Resume streaming if recording fails
      setIsStreamingPaused(false);
    }
  };

  const stopMultimodalRecording = () => {
    if (multimodalMediaRecorderRef.current && isRecording) {
      multimodalMediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendMultimodalVoiceMessage = () => {
    if (!multimodalWebSocketRef.current) return;

    // Convert PCM data to base64
    const buffer = new ArrayBuffer(multimodalPcmDataRef.current.length * 2);
    const view = new DataView(buffer);
    multimodalPcmDataRef.current.forEach((value, index) => {
      view.setInt16(index * 2, value, true);
    });

    const base64Audio = btoa(String.fromCharCode(...Array.from(new Uint8Array(buffer))));

    // Since we're live streaming the canvas, we can just send audio
    // Gemini already has the latest canvas state
    const payload = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: "audio/pcm",
            data: base64Audio,
          },
        ],
      },
    };

    console.log('🎤 Sending voice message to Gemini (canvas already live-streamed)');
    multimodalWebSocketRef.current.send(JSON.stringify(payload));
    multimodalPcmDataRef.current = [];
  };

  // Disable browser audio playback
  const playNextMultimodalAudio = async () => {
    // No-op: audio playback disabled in browser
    multimodalIsPlayingRef.current = false;
    setIsPlayingAudio(false);
  };

  // Auto-start streaming when connected
  useEffect(() => {
    if (isMultimodalConnected && !isLiveStreaming) {
      startLiveStreaming();
    } else if (!isMultimodalConnected && isLiveStreaming) {
      stopLiveStreaming();
    }
  }, [isMultimodalConnected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopLiveStreaming();
    };
  }, []);

  // Start continuous canvas streaming
  const startLiveStreaming = () => {
    console.log('📷 Starting continuous canvas streaming...');
    setIsLiveStreaming(true);
    
    // Capture canvas container every 5 seconds (increased from 2 seconds to reduce interference)
    const streamingInterval = setInterval(() => {
      // Don't stream if paused or if WebSocket is not ready
      if (isStreamingPaused || multimodalWebSocketRef.current?.readyState !== WebSocket.OPEN) {
        return;
      }
      
      const canvasContainer = document.querySelector('[data-canvas-container]');
      if (canvasContainer) {
        // Use a more conservative approach to avoid interfering with canvas rendering
        html2canvas(canvasContainer as HTMLElement, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#fafaf9',
          scale: 0.6, // Further reduced scale to reduce processing load
          logging: false,
          imageTimeout: 1000 // Add timeout to prevent hanging
        }).then(canvas => {
          const imageData = canvas.toDataURL('image/jpeg', 0.5).split(',')[1]; // Further reduced quality
          console.log('📷 [STREAMING] Capturing canvas container...');
        
          const payload = {
            realtime_input: {
              media_chunks: [{
                mime_type: "image/jpeg",
                data: imageData,
              }],
            },
          };
        
          if (multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
            multimodalWebSocketRef.current.send(JSON.stringify(payload));
            console.log('📷 [STREAMING] Canvas container frame sent to Gemini');
          }
        }).catch(err => {
          console.error('❌ [STREAMING] Failed to capture canvas container:', err);
          // Don't let streaming errors affect the main canvas functionality
        });
      }
    }, 5000); // Increased from 2000ms to 5000ms to reduce interference
    
    // Store the interval ID for cleanup
    multimodalStreamingIntervalRef.current = streamingInterval;
  };

  // Stop continuous canvas streaming
  const stopLiveStreaming = () => {
    console.log('📷 Stopping continuous canvas streaming...');
    setIsLiveStreaming(false);
    
    if (multimodalStreamingIntervalRef.current) {
      clearInterval(multimodalStreamingIntervalRef.current);
      multimodalStreamingIntervalRef.current = null;
      console.log('📷 Canvas container streaming interval stopped');
    }
  };

  // Connect canvas to shapes context
  useEffect(() => {
    if (canvasRef.current) {
      setCanvas(canvasRef.current);
    }
  }, [canvasRef.current, setCanvas]);

  // Function to get canvas hash for change detection
  const getCanvasHash = () => {
    const canvasContainer = document.querySelector('[data-canvas-container]');
    if (!canvasContainer) return '';
    
    // For change detection, we'll use a simpler approach that captures the container
    return new Promise<string>((resolve) => {
      html2canvas(canvasContainer as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fafaf9',
        scale: 0.5, // Lower scale for faster processing
        logging: false
      }).then(canvas => {
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      }).catch(() => {
        resolve('');
      });
    });
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
      data-canvas-container
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
        <>
          <button
            className="absolute left-4 top-1/2 mt-24 -translate-y-1/2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg shadow-md z-10 text-sm font-medium transition-colors duration-200"
            onClick={() => enhanceDrawingWithGeminiWithPrompt('Enhance this sketch into an image with more detail')}
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

      {/* Multimodal AI Assistant Button */}
      <button
        className={`absolute right-4 top-16 p-3 rounded-lg shadow-md z-50 transition-colors duration-200 ${
          isMultimodalConnected 
            ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
        onClick={isMultimodalConnected ? toggleMute : connectMultimodal}
        title={isMultimodalConnected ? (isMuted ? "Unmute AI Assistant" : "Mute AI Assistant") : "Connect AI Assistant"}
      >
        {isMultimodalConnected ? (
          <div className="flex items-center space-x-2">
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            <span className="text-sm font-medium">{isMuted ? "Unmute AI" : "Mute AI"}</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Mic size={20} />
            <span className="text-sm font-medium">Connect AI</span>
          </div>
        )}
      </button>

      {/* Consolidated AI Status Indicator - only show when connected */}
      {isMultimodalConnected && (
        <div className="absolute right-4 top-28 bg-green-600 text-white px-3 py-2 rounded-lg shadow-md z-50 text-xs">
          <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span>
              {isMuted ? "AI Muted" : 
               voiceStatus === 'listening' ? "Listening..." :
               isPlayingAudio ? "Gemini speaking..." :
               isLiveStreaming ? "Gemini sees live canvas" :
               "AI Ready"}
            </span>
        </div>
        </div>
      )}

      {/* Error Display */}
      {multimodalError && (
        <div className="absolute right-4 top-44 bg-red-600 text-white px-3 py-2 rounded-lg shadow-md z-50 text-xs max-w-48">
          {multimodalError}
        </div>
      )}

      {/* Render interactive enhanced images */}
      {renderEnhancedImages()}
      
      <canvas
        ref={canvasRef}
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

import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { useHandGesture } from '../context/HandGestureContext'
import { useWebSocket } from '../context/WebSocketContext'
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

interface CanvasProps {}

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

  // Multimodal AI state
  const [isMultimodalConnected, setIsMultimodalConnected] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const [multimodalMessages, setMultimodalMessages] = useState<Array<{type: 'user' | 'assistant', content: string, timestamp: Date, isTranscript?: boolean}>>([])
  const [multimodalError, setMultimodalError] = useState<string | null>(null)
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening'>('idle')
  
  // Multimodal refs
  const multimodalWebSocketRef = useRef<WebSocket | null>(null)
  const multimodalAudioContextRef = useRef<AudioContext | null>(null)
  const multimodalMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const multimodalPcmDataRef = useRef<number[]>([])
  const multimodalCurrentFrameRef = useRef<string | null>(null)
  const multimodalAudioQueueRef = useRef<string[]>([])
  const multimodalIsPlayingRef = useRef(false)
  const multimodalStreamingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Real-time canvas streaming to Gemini
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const lastCanvasHashRef = useRef<string>('');

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
    
    // Trigger immediate canvas capture after rendering is complete
    if ((window as any).triggerImmediateCanvasCapture && (isDrawing || state.currentShape)) {
      console.log('🎨 Rendering complete, triggering canvas capture...');
      // Small delay to ensure rendering is fully complete
      setTimeout(() => {
        if ((window as any).triggerImmediateCanvasCapture) {
          console.log('⚡ Triggering canvas capture after render...');
          (window as any).triggerImmediateCanvasCapture();
        }
      }, 10);
    }
    
    // Also trigger capture during drawing for more frequent updates
    if ((window as any).triggerImmediateCanvasCapture && isDrawing && state.currentShape) {
      // Trigger additional captures during drawing for smoother streaming
      setTimeout(() => {
        if ((window as any).triggerImmediateCanvasCapture && isDrawing) {
          (window as any).triggerImmediateCanvasCapture();
        }
      }, 100);
    }
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
    }
    
    if (isDrawing && state.currentShape) {
      void (DEBUG && console.log('Ending drawing', state.currentShape.type));
      setIsDrawing(false);
      dispatch({ type: 'END_DRAWING' });
      
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
        }, 100); // Small delay to ensure canvas is fully rendered
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
      void (DEBUG && console.log(`Image saved successfully to: ${result.absolutePath}`));
      
      // Show success message with toast instead of alert
      window.showToast(`Image saved as: ${result.filename}`, 'success', 3000);
      
    } catch (err) {
      void (DEBUG && console.error('Error saving canvas:', err));
      window.showToast(`Error saving image: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  }

  const enhanceDrawingWithGemini = async (customPrompt?: string) => {
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
      
      // Use the provided prompt or default enhancement prompt
      const prompt = customPrompt || 'Enhance this sketch into an image with more detail';

      // Request image enhancement from Flask server
      const response = await fetch('http://localhost:5001/api/enhance-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename: saveResult.filename,
          prompt: prompt
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

  // Wrapper function for multimodal server to use
  const enhanceDrawingWithGeminiWithPrompt = (prompt: string) => {
    enhanceDrawingWithGemini(prompt);
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

  // Multimodal AI functions
  const connectMultimodal = () => {
    console.log('Attempting to connect to multimodal server...');
    try {
      multimodalWebSocketRef.current = new WebSocket('ws://localhost:9083');
      
      multimodalWebSocketRef.current.onopen = () => {
        console.log('✅ Connected to multimodal server');
        setIsMultimodalConnected(true);
        setMultimodalError(null);
        sendMultimodalSetup();
      };

      multimodalWebSocketRef.current.onmessage = handleMultimodalMessage;
      
      multimodalWebSocketRef.current.onclose = () => {
        console.log('❌ Disconnected from multimodal server');
        setIsMultimodalConnected(false);
        setIsRecording(false);
      };

      multimodalWebSocketRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setMultimodalError('Failed to connect to AI assistant');
        setIsMultimodalConnected(false);
      };
    } catch (err) {
      console.error('❌ Failed to connect:', err);
      setMultimodalError('Failed to connect to AI assistant');
    }
  };

  const disconnectMultimodal = () => {
    console.log('🔌 Disconnecting from multimodal server...');
    
    // Stop recording if active
    if (isRecording) {
      stopMultimodalRecording();
    }
    
    // Stop live streaming
    stopLiveStreaming();
    
    // Close WebSocket connection
    if (multimodalWebSocketRef.current) {
      // Remove all event listeners to prevent memory leaks
      multimodalWebSocketRef.current.onopen = null;
      multimodalWebSocketRef.current.onmessage = null;
      multimodalWebSocketRef.current.onclose = null;
      multimodalWebSocketRef.current.onerror = null;
      
      // Close the connection properly
      if (multimodalWebSocketRef.current.readyState === WebSocket.OPEN) {
        multimodalWebSocketRef.current.close(1000, 'User disconnected');
      }
      
      multimodalWebSocketRef.current = null;
    }
    
    // Reset all states
    setIsMultimodalConnected(false);
    setIsRecording(false);
    setVoiceStatus('idle');
    setMultimodalError(null);
    setMultimodalMessages([]);
    setIsPlayingAudio(false);
    multimodalIsPlayingRef.current = false;
    
    // Clear audio queue
    multimodalAudioQueueRef.current = [];
    
    // Signal backend about disconnection
    try {
      fetch('http://localhost:5001/api/browser-closed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      }).catch(err => console.log('📡 Disconnect signal sent to backend'));
    } catch (err) {
      console.log('📡 Disconnect signal failed:', err);
    }
    
    console.log('✅ Multimodal server disconnected and cleaned up');
    
    // Show success message
    if (window.showToast) {
      window.showToast('AI Assistant disconnected', 'success', 3000);
    }
  };

  const sendMultimodalSetup = () => {
    if (multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
      const setupMessage = {
        setup: {
          response_modalities: ["AUDIO", "TEXT"]
        },
      };
      multimodalWebSocketRef.current.send(JSON.stringify(setupMessage));
    }
  };

  const handleMultimodalMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      console.log('📨 Received WebSocket message:', data);
      
      if (data.text) {
        const newMessage = {
          type: 'assistant' as const,
          content: data.text,
          timestamp: new Date(),
        };
        setMultimodalMessages(prev => [...prev, newMessage]);
        
        // Show a subtle notification for Gemini's response
        if (window.showToast) {
          window.showToast(`Gemini: ${data.text.substring(0, 50)}${data.text.length > 50 ? '...' : ''}`, 'info', 5000);
        }
      }
      
      // Handle input transcription (what you said)
      if (data.input_transcription) {
        const newMessage = {
          type: 'user' as const,
          content: data.input_transcription,
          timestamp: new Date(),
          isTranscript: true,
        };
        setMultimodalMessages(prev => [...prev, newMessage]);
        console.log('🎤 Your transcript:', data.input_transcription);
      }
      
      // Handle output transcription (what Gemini said)
      if (data.output_transcription) {
        const newMessage = {
          type: 'assistant' as const,
          content: data.output_transcription,
          timestamp: new Date(),
          isTranscript: true,
        };
        setMultimodalMessages(prev => [...prev, newMessage]);
        console.log('🤖 Gemini transcript:', data.output_transcription);
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
        } else if (data.enhancement_error) {
          // Show error message
          if (window.showToast) {
            window.showToast('Enhancement failed via voice command', 'error', 3000);
          }
        }
      }
      
      // Handle save_and_enhance request from multimodal server
      if (data.type === 'save_and_enhance') {
        console.log('🎯 Save and enhance request from multimodal server:', data);
        
        // Trigger the same enhancement process as the button
        const prompt = data.prompt || 'Enhance this sketch into an image with more detail';
        console.log('🚀 Starting enhancement with prompt:', prompt);
        
        // Use the existing enhancement function but with the provided prompt
        enhanceDrawingWithGeminiWithPrompt(prompt);
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
  };

  const initializeMultimodalAudio = async () => {
    try {
      multimodalAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
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
      };

      multimodalMediaRecorderRef.current.start(100);
      setIsRecording(true);
      setMultimodalError(null);
      console.log('✅ Recording started successfully');
    } catch (err) {
      console.error('❌ Failed to start recording:', err);
      setMultimodalError('Failed to access microphone');
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

    const base64Audio = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));

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
    
    // Capture canvas container every 500ms
    const streamingInterval = setInterval(() => {
      if (multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
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
            console.log('📷 [STREAMING] Capturing canvas container...');
          
          const payload = {
            realtime_input: {
              media_chunks: [{
                mime_type: "image/jpeg",
                data: imageData,
              }],
            },
          };
          
          multimodalWebSocketRef.current.send(JSON.stringify(payload));
            console.log('📷 [STREAMING] Canvas container frame sent to Gemini');
          }).catch(err => {
            console.error('❌ [STREAMING] Failed to capture canvas container:', err);
          });
        }
      }
    }, 500);
    
    // Store interval for cleanup
    multimodalStreamingIntervalRef.current = streamingInterval;
    console.log('📷 Canvas container streaming interval started - will capture every 500ms');
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
        <button
          className="absolute left-4 top-1/2 mt-24 -translate-y-1/2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg shadow-md z-10 text-sm font-medium transition-colors duration-200"
          onClick={() => enhanceDrawingWithGemini()}
          disabled={enhancementStatus === 'processing'}
          title="Enhance with Gemini"
        >
          {enhancementStatus === 'processing' ? 'Enhancing...' : 'Enhance with Gemini'}
        </button>
      )}

      {/* Multimodal AI Assistant Button */}
      <button
        className={`absolute right-4 top-16 p-3 rounded-lg shadow-md z-50 transition-colors duration-200 ${
          isMultimodalConnected 
            ? 'bg-red-600 hover:bg-red-700 text-white' 
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
        onClick={isMultimodalConnected ? disconnectMultimodal : connectMultimodal}
        title={isMultimodalConnected ? "Disconnect AI Assistant" : "Connect AI Assistant"}
      >
        {isMultimodalConnected ? (
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-white rounded-full"></div>
            <span className="text-sm font-medium">Disconnect AI</span>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <Mic size={20} />
            <span className="text-sm font-medium">Connect AI</span>
          </div>
        )}
      </button>

      {/* Recording Button - only show when connected */}
      {isMultimodalConnected && (
        <button
          className={`absolute right-4 top-28 p-3 rounded-lg shadow-md z-50 transition-colors duration-200 ${
            isRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
          onClick={isRecording ? stopMultimodalRecording : startMultimodalRecording}
          title={isRecording ? "Stop Recording" : "Start Recording"}
        >
          {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
      )}

      {/* Live Streaming Status Indicator */}
      {isLiveStreaming && (
        <div className="absolute right-4 top-40 bg-green-600 text-white px-3 py-1 rounded-lg shadow-md z-50 text-xs flex items-center space-x-1">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span>Gemini sees live canvas</span>
        </div>
      )}

      {/* Audio Playback Indicator */}
      {isPlayingAudio && (
        <div className="absolute right-4 top-52 bg-blue-600 text-white px-3 py-1 rounded-lg shadow-md z-50 text-xs flex items-center space-x-1">
          <Volume2 size={12} className="animate-pulse" />
          <span>Gemini speaking...</span>
        </div>
      )}

      {/* Voice Activity Indicator */}
      {voiceStatus === 'listening' && (
        <div className="absolute right-4 top-64 bg-green-600 text-white px-3 py-1 rounded-lg shadow-md z-50 text-xs flex items-center space-x-1">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          <span>Listening...</span>
        </div>
      )}

      {/* Error Display */}
      {multimodalError && (
        <div className="absolute right-4 top-76 bg-red-600 text-white px-3 py-1 rounded-lg shadow-md z-50 text-xs max-w-48">
          {multimodalError}
        </div>
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

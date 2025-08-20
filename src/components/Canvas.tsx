import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { useWebSocket } from '../context/WebSocketContext'
import { useHandGesture } from '../context/HandGestureContext'
import { Shape, Point, Tool } from '../types'
import { renderShape } from '../utils/renderShape'
import { addPointToPath, getSmoothedCursorPosition } from '../utils/cursorUtils'
import { UserPosition } from '../types'
import { Hand, HandMetal, Mic, MicOff } from 'lucide-react'
import html2canvas from 'html2canvas' // Still needed for package dependencies, but we use fast canvas.toDataURL() instead
import Header from './Header'
import LayersPanel from './LayersPanel'
import GridSettings from './GridSettings'



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
interface CanvasProps {
  onToggleStoryboard?: () => void;
  showStoryboard?: boolean;
  onCloseStoryboard?: () => void;
}

const Canvas: React.FC<CanvasProps> = ({ onToggleStoryboard, showStoryboard, onCloseStoryboard }) => {
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

  // Use ref to store current state to avoid closure issues
  const currentStateRef = useRef(state);
  currentStateRef.current = state;

  // AI mode state
  const [aiMode, setAIMode] = useState<'friendly' | 'sarcastic'>('friendly');
  
  // Add a ref to always get the latest aiMode
  const aiModeRef = useRef(aiMode);
  aiModeRef.current = aiMode;

  // Hand tracking state
  const [isHandTrackingEnabled, setIsHandTrackingEnabled] = useState(false);
  const [isDualHandMode, setIsDualHandMode] = useState(false);



  // Debug effect to log when aiMode changes
  useEffect(() => {
    console.log('🎯 AI Mode changed to:', aiMode);
  }, [aiMode]);



  // Debug effect to log when shapes change
  useEffect(() => {
    console.log('🔄 SHAPES CHANGED - Current count:', state.shapes.length);
    console.log('🔄 SHAPES CHANGED - Shapes:', stateRef.current.shapes);
    console.log('🔄 SHAPES CHANGED - Is AI connected:', isMultimodalConnected);
  }, [state.shapes, isMultimodalConnected]);

  // Define renderCanvas function before it's used in effects
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Only draw grid if enabled
    if (!state.gridSettings.enabled) return;
    
    const gridSize = state.gridSettings.size * state.viewTransform.scale
    
    const offsetX = state.viewTransform.offsetX % gridSize
    const offsetY = state.viewTransform.offsetY % gridSize
    
    // Use grid settings for color and opacity
    const gridColor = state.gridSettings.color;
    const gridOpacity = state.gridSettings.opacity;
    
    // Convert hex color to rgba
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    
    // Draw grid lines
    ctx.strokeStyle = hexToRgba(gridColor, gridOpacity * 0.5);
    ctx.lineWidth = 0.5
    
    // Vertical lines
    for (let x = offsetX; x < width; x += gridSize) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    
    // Horizontal lines
    for (let y = offsetY; y < height; y += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    
    // Draw dots at intersections
    ctx.fillStyle = hexToRgba(gridColor, gridOpacity);
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
    
    // Draw professional gradient background with purple tones
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#faf5ff'); // purple-50
    gradient.addColorStop(0.5, '#f3e8ff'); // purple-100
    gradient.addColorStop(1, '#e9d5ff'); // purple-200
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid with purple tones
    drawGrid(context, canvas.width, canvas.height);
    
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
        if (triggerCaptureInner) {
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

      // Professional vector tools
      case 'vector':
        // Vector path tool - create precise vector paths
        setIsDrawing(true);
        dispatch({
          type: 'START_DRAWING',
          payload: { point, type: 'pencil' }, // Use pencil for now, can be enhanced later
        });
        break;

      case 'polygon':
        // Polygon tool - create regular polygons
        setIsDrawing(true);
        dispatch({
          type: 'START_DRAWING',
          payload: { point, type: 'rectangle' }, // Use rectangle for now, can be enhanced
        });
        break;

      case 'bezier':
        // Bezier curve tool - create smooth curves
        setIsDrawing(true);
        dispatch({
          type: 'START_DRAWING',
          payload: { point, type: 'pencil' }, // Use pencil for now, can be enhanced
        });
        break;

      case 'measure':
        // Measurement tool - measure distances
        const measuredShape = findShapeAtPoint(point);
        if (measuredShape) {
          // Calculate and display measurements
          const width = Math.max(...measuredShape.points.map(p => p.x)) - Math.min(...measuredShape.points.map(p => p.x));
          const height = Math.max(...measuredShape.points.map(p => p.y)) - Math.min(...measuredShape.points.map(p => p.y));
          const diagonal = Math.sqrt(width * width + height * height);
          
          window.showToast(`Width: ${Math.round(width)}px, Height: ${Math.round(height)}px, Diagonal: ${Math.round(diagonal)}px`, 'info', 3000);
        } else {
          window.showToast('Click on a shape to measure it', 'info', 2000);
        }
        break;

      case 'eyedropper':
        // Eyedropper tool - sample colors
        const shapeAtPoint = findShapeAtPoint(point);
        if (shapeAtPoint) {
          const sampledColor = shapeAtPoint.style.strokeColor;
          dispatch({
            type: 'SET_STYLE',
            payload: { strokeColor: sampledColor }
          });
          window.showToast(`Color sampled: ${sampledColor}`, 'success', 2000);
        } else {
          // Sample from canvas pixel
          const ctx = canvasRef.current.getContext('2d');
          if (ctx) {
            const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
            const color = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
            dispatch({
              type: 'SET_STYLE',
              payload: { strokeColor: color }
            });
            window.showToast(`Color sampled: ${color}`, 'success', 2000);
          }
        }
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
    
    // Capture canvas during drawing for real-time streaming (FAST VERSION)
    if (isMultimodalConnected && multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
      const drawStartTime = performance.now();
      console.log('⏱️ [PERFORMANCE] Starting FAST drawing capture...');
      
      // Use direct canvas capture instead of slow html2canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const captureTime = performance.now();
        console.log(`⏱️ [PERFORMANCE] Direct canvas access took: ${captureTime - drawStartTime}ms`);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        const dataUrlTime = performance.now();
        console.log(`⏱️ [PERFORMANCE] Fast toDataURL took: ${dataUrlTime - captureTime}ms`);
        
        console.log('📷 [DRAWING] Fast canvas capture completed!');
        
        const payload = {
          realtime_input: {
            media_chunks: [{
              mime_type: "image/jpeg",
              data: imageData,
            }],
          },
        };
        
        if (multimodalWebSocketRef.current) {
          multimodalWebSocketRef.current.send(JSON.stringify(payload));
          const totalTime = performance.now();
          console.log(`⏱️ [PERFORMANCE] Total FAST capture + send took: ${totalTime - drawStartTime}ms`);
        }
        console.log('📷 [DRAWING] Fast canvas frame sent to Gemini');
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
    return [...state.shapes].reverse().find(shape => {
      // Simple hit test - check if point is within shape bounds
      if (shape.points.length === 0) return false;
      
      const minX = Math.min(...shape.points.map(p => p.x));
      const maxX = Math.max(...shape.points.map(p => p.x));
      const minY = Math.min(...shape.points.map(p => p.y));
      const maxY = Math.max(...shape.points.map(p => p.y));
      
      return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
    })
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
  };

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
    console.log('🚀 Current shapes count:', currentStateRef.current.shapes.length);
    
    // Pause streaming during enhancement to prevent interference
    setIsStreamingPaused(true);
    
    try {
      // Check if there are shapes to save (including any that might have been completed)
      if (currentStateRef.current.shapes.length === 0) {
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
      currentStateRef.current.shapes.forEach(shape => {
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
      currentStateRef.current.shapes.forEach(shape => {
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
        className="absolute bg-white shadow-xl rounded-xl overflow-hidden border border-slate-200"
        style={{
          left: `${image.x}px`,
          top: `${image.y}px`,
          width: `${image.width}px`,
          height: `${image.height}px`,
          pointerEvents: 'auto',
          touchAction: 'none',
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
        {/* Image */}
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
          className="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-slate-600 hover:text-red-600 hover:bg-red-50 shadow-lg transition-all duration-200 z-40"
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* Action buttons at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent py-3 px-4 pointer-events-auto">
          <div className="flex justify-center space-x-2">
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
              className="px-3 py-1.5 text-xs bg-white/90 backdrop-blur-sm text-slate-800 rounded-lg hover:bg-white transition-all duration-200 shadow-sm flex items-center cursor-pointer font-medium"
            title="Add to Storyboard"
            style={{ pointerEvents: 'auto' }}
          >
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
              Storyboard
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
              className="px-3 py-1.5 text-xs bg-white/90 backdrop-blur-sm text-slate-800 rounded-lg hover:bg-white transition-all duration-200 shadow-sm flex items-center cursor-pointer font-medium"
            title="Download Image"
            style={{ pointerEvents: 'auto' }}
          >
              <svg className="w-3 h-3 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          </div>
        </div>
        
        {/* Resize handles */}
        <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none">
          {/* Top-left resize handle */}
          <div
            className="absolute top-1 left-1 w-3 h-3 bg-white/80 backdrop-blur-sm rounded-full border border-slate-300 cursor-nw-resize pointer-events-auto"
            onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'nw')}
          />
          {/* Top-right resize handle */}
          <div
            className="absolute top-1 right-1 w-3 h-3 bg-white/80 backdrop-blur-sm rounded-full border border-slate-300 cursor-ne-resize pointer-events-auto"
            onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'ne')}
          />
          {/* Bottom-left resize handle */}
          <div
            className="absolute bottom-1 left-1 w-3 h-3 bg-white/80 backdrop-blur-sm rounded-full border border-slate-300 cursor-sw-resize pointer-events-auto"
            onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'sw')}
          />
          {/* Bottom-right resize handle */}
          <div
            className="absolute bottom-1 right-1 w-3 h-3 bg-white/80 backdrop-blur-sm rounded-full border border-slate-300 cursor-se-resize pointer-events-auto"
            onPointerDown={(e) => handlePointerDownOnEnhancedImage(e, index, true, 'se')}
          />
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
              const port = 9083; // Use single server for both personalities
              console.log(`🔌 Connecting to AI server on port ${port}`);
      multimodalWebSocketRef.current = new WebSocket(`ws://localhost:${port}`);
      multimodalWebSocketRef.current.onopen = () => {
        console.log(`✅ Connected to ${aiModeRef.current} multimodal server`);
        setIsMultimodalConnected(true);
        setMultimodalError(null);
        
        // Send setup message
        const setupMessage = {
          setup: {
            response_modalities: ["AUDIO", "TEXT"]
          }
        };
        console.log('📤 Sending setup message:', setupMessage);
        if (multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
          multimodalWebSocketRef.current.send(JSON.stringify(setupMessage));
        }
        
        // Send mute state
        if (multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
          multimodalWebSocketRef.current.send(JSON.stringify({
            type: "mute_toggle",
            muted: isMuted
          }));
        }
        
        // Initialize audio system
        initializeMultimodalAudio();
        
        // Start live streaming
        console.log(`📷 Starting live streaming for ${aiModeRef.current} AI...`);
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

  const saveDrawingOnly = useCallback(async () => {
    console.log('💾 Saving drawing only (no enhancement)...');
    console.log('💾 Current shapes count:', currentStateRef.current.shapes.length);
    
    // Pause streaming during save to prevent interference
    setIsStreamingPaused(true);
    
    try {
      // Check if there are shapes to save
      if (currentStateRef.current.shapes.length === 0) {
        console.log('❌ No shapes to save - please draw something first');
        window.showToast('Draw something first before saving', 'info', 3000);
        return;
      }

      console.log('✅ Shapes found, starting save process');
      
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
      currentStateRef.current.shapes.forEach(shape => {
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
      currentStateRef.current.shapes.forEach(shape => {
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
      
      // Show success toast
      window.showToast('Drawing saved successfully!', 'success', 2000);
      
    } catch (err) {
      console.error('❌ Error in save process:', err);
      window.showToast(`Error saving drawing: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    } finally {
      // Always resume streaming after save operations
      setIsStreamingPaused(false);
    }
  }, []);
  

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
            data.type === 'enhancement_request' ||
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
        console.log('  - Shapes count:', currentStateRef.current.shapes.length);
        console.log('  - Shapes:', currentStateRef.current.shapes);
        console.log('  - Is drawing:', isDrawing);
        console.log('  - Current shape:', currentStateRef.current.currentShape);
        console.log('  - Tool:', currentStateRef.current.tool);
        console.log('  - All state keys:', Object.keys(currentStateRef.current));
        console.log('  - Would show enhance button:', currentStateRef.current.shapes.length > 0);
        
        // Call EXACTLY the same as the button - no differences at all
        console.log('🚀 Starting enhancement with EXACT same call as button');
        
        // Call EXACTLY like the button does - same function, same parameters
        enhanceDrawingWithGeminiWithPrompt('Enhance this sketch into an image with more detail');
      }
      
      // Handle save_drawing request from multimodal server
      if (data.type === 'save_drawing') {
        console.log('🎤 VOICE COMMAND - Save drawing request from multimodal server');
        console.log('🎤 VOICE COMMAND - Shapes count:', currentStateRef.current.shapes.length);
        console.log('🎤 VOICE COMMAND - Shapes:', currentStateRef.current.shapes);
        console.log('🎤 VOICE COMMAND - Is drawing:', isDrawing);
        console.log('🎤 VOICE COMMAND - Current shape:', currentStateRef.current.currentShape);
        console.log('🎤 VOICE COMMAND - Tool:', currentStateRef.current.tool);
        console.log('🎤 VOICE COMMAND - View transform:', currentStateRef.current.viewTransform);
        console.log('🎤 VOICE COMMAND - All state keys:', Object.keys(currentStateRef.current));
        
        // Check if this is a modification request by looking for modification context
        if (data.command_detected === 'modify' || data.modification_started) {
          console.log('🎨 This is a modification request, not enhancement');
          // For modification, we just save the drawing and let the backend handle the modification
          // The backend will call the modification API directly
          saveDrawingOnly();
          return; // Don't proceed to enhancement
        }
        
        // Call EXACTLY the same function as the button - no differences at all
        console.log('🚀 Calling EXACT same function as button: enhanceDrawingWithGeminiWithPrompt');
        enhanceDrawingWithGeminiWithPrompt('Enhance this sketch into an image with more detail');
      }
      
      // Handle enhancement_request from sarcastic multimodal server
      if (data.type === 'enhancement_request') {
        console.log('🎯 Enhancement request from sarcastic multimodal server:', data);
        console.log('🔍 DEBUG: Current state when enhancement requested:');
        console.log('  - Shapes count:', currentStateRef.current.shapes.length);
        console.log('  - Shapes:', currentStateRef.current.shapes);
        console.log('  - Is drawing:', isDrawing);
        console.log('  - Current shape:', currentStateRef.current.currentShape);
        console.log('  - Tool:', currentStateRef.current.tool);
        console.log('  - All state keys:', Object.keys(currentStateRef.current));
        console.log('  - Would show enhance button:', currentStateRef.current.shapes.length > 0);
        
        // Call EXACTLY the same as the button - no differences at all
        console.log('🚀 Starting enhancement with EXACT same call as button');
        
        // Call EXACTLY like the button does - same function, same parameters
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
        // Show spinner/toast immediately
        window.showToast('Enhancing your drawing with Gemini...', 'info', 3000);
        if (data.enhancement_started && data.request_id) {
          pollEnhancementStatus(data.request_id);
          // Show success message
          if (window.showToast) {
            window.showToast('Enhancement started via voice command!', 'success', 3000);
          }
        }
      }
      
      // Handle app control commands triggered by voice
      if (data.command_detected === 'app_control') {
        console.log('🎯 Voice app control command detected:', data);
        // Show confirmation toast for app control commands
        if (window.showToast && data.text) {
          window.showToast(`Voice command executed: ${data.text}`, 'success', 3000);
        }
      }
      
      if (data.audio) {
        multimodalAudioQueueRef.current.push(data.audio);
        playNextMultimodalAudio();
      }
      
      if (data.voice_status) {
        console.log('Voice status update:', data.voice_status);
        setVoiceStatus(data.voice_status);
      }
      
      // Handle modification commands triggered by voice
      if (data.command_detected === 'modify') {
        console.log('🎯 Voice modification command detected:', data);
        console.log('🎯 modification_started:', data.modification_started);
        console.log('�� request_id:', data.request_id);
        // Show spinner/toast immediately
        window.showToast('Modifying your drawing with Gemini...', 'info', 3000);
        if (data.modification_started && data.request_id) {
          console.log('🎯 Calling pollModificationStatus with request_id:', data.request_id);
          pollModificationStatus(data.request_id);
        } else {
          console.log('❌ Not calling pollModificationStatus - missing data:', {
            modification_started: data.modification_started,
            request_id: data.request_id
          });
        }
      }

      // 🎤 NEW: Handle voice app control commands
      if (data.type === 'app_control') {
        console.log('🎤 Voice app control command received:', data);
        
        switch (data.action) {
          case 'open_panel':
            handleVoicePanelControl(data.target, 'open_panel');
            break;
          case 'close_panel':
            console.log('🎤 Close panel action received for target:', data.target);
            handleVoicePanelControl(data.target, 'close_panel');
            break;
          case 'open_modal':
            handleVoiceModalControl(data.target, 'open_modal');
            break;
          case 'close_modal':
            handleVoiceModalControl(data.target, 'close_modal');
            break;
          case 'switch_tool':
            handleVoiceToolControl(data.target);
            break;
          default:
            console.log('🎤 Unknown app control action:', data.action);
        }
      }

      // 🎭 NEW: Handle personality switching commands
      if (data.type === 'switch_personality') {
        console.log('🎭 Personality switch command received:', data);
        const personality = data.personality;
        if (personality === 'sarcastic' || personality === 'friendly') {
          window.showToast(`Switched to ${personality} mode! Reconnecting...`, 'success', 3000);
          // The backend will close the connection to force reconnection with new personality
        }
      }

      // 🎤 NEW: Handle canvas clear command from voice
      if (data.type === 'clear_canvas') {
        console.log('🎤 Voice clear canvas command received:', data);
        handleVoiceCanvasClear();
      }

      // 🎤 NEW: Handle additional app control commands
      if (data.type === 'app_control' && data.action) {
        switch (data.action) {
          case 'undo':
            console.log('🎤 Voice undo command received');
            dispatch({ type: 'UNDO' });
            window.showToast('Undoing last action!', 'success', 2000);
            break;
          case 'redo':
            console.log('🎤 Voice redo command received');
            dispatch({ type: 'REDO' });
            window.showToast('Redoing last action!', 'success', 2000);
            break;
          case 'save_drawing':
            console.log('🎤 Voice save command received');
            saveCanvasAsPNG();
            window.showToast('Saving your drawing!', 'success', 2000);
            break;
        }
      }
    } catch (err) {
      console.error('Error parsing WebSocket message:', err);
    }
  }, [isDrawing, isMuted, setMultimodalMessages, setVoiceStatus, enhanceDrawingWithGeminiWithPrompt, pollEnhancementStatus]);

  // 🎤 NEW: Handle voice app control commands
  const handleVoicePanelControl = (target: string, action: 'open_panel' | 'close_panel') => {
    console.log(`🎤 ${action === 'open_panel' ? 'Opening' : 'Closing'} panel via voice command:`, target);
    
    switch (target) {
      case 'storyboard':
        // Storyboard is controlled by App.tsx via the onToggleStoryboard prop
        console.log(`🎤 Storyboard voice command: ${action}, current state: ${showStoryboard}`);
        
        if (action === 'open_panel') {
          // Open storyboard if it's closed
          if (!showStoryboard && onToggleStoryboard) {
            onToggleStoryboard();
            window.showToast('Opening storyboard!', 'success', 2000);
          } else if (showStoryboard) {
            window.showToast('Storyboard is already open!', 'info', 2000);
          } else {
            window.showToast('Storyboard feature not available', 'error', 2000);
          }
        } else {
          // Close storyboard if it's open
          console.log('🎤 Attempting to close storyboard:');
          console.log('  - showStoryboard:', showStoryboard);
          console.log('  - onCloseStoryboard exists:', !!onCloseStoryboard);
          
          if (showStoryboard && onCloseStoryboard) {
            console.log('🎤 Calling onCloseStoryboard()');
            onCloseStoryboard();
            window.showToast('Closing storyboard!', 'success', 2000);
          } else if (!showStoryboard) {
            console.log('🎤 Storyboard already closed');
            window.showToast('Storyboard is already closed!', 'info', 2000);
          } else {
            console.log('🎤 onCloseStoryboard not available');
            window.showToast('Storyboard feature not available', 'error', 2000);
          }
        }
        break;
      case 'layers':
        if (action === 'open_panel') {
          dispatch({ type: 'TOGGLE_LAYERS_PANEL' });
          window.showToast('Opening layers panel!', 'success', 2000);
        } else {
          dispatch({ type: 'TOGGLE_LAYERS_PANEL' });
          window.showToast('Closing layers panel!', 'success', 2000);
        }
        break;
      case 'tools':
        // Tools panel is always visible in the toolbar
        if (action === 'open_panel') {
          window.showToast('Tools are already visible in the toolbar!', 'info', 2000);
        } else {
          window.showToast('Tools cannot be hidden!', 'info', 2000);
        }
        break;
      case 'collaboration':
        // Collaboration panel is always visible, just show a message
        if (action === 'open_panel') {
          window.showToast('Collaboration panel is already open!', 'info', 2000);
        } else {
          window.showToast('Collaboration panel cannot be hidden!', 'info', 2000);
        }
        break;
      case 'grid':
        // Grid settings panel
        if (action === 'open_panel') {
          dispatch({ type: 'TOGGLE_GRID_SETTINGS' });
          window.showToast('Opening grid settings!', 'success', 2000);
        } else {
          dispatch({ type: 'TOGGLE_GRID_SETTINGS' });
          window.showToast('Closing grid settings!', 'success', 2000);
        }
        break;
      default:
        console.log('🎤 Unknown panel target:', target);
    }
  };

  const handleVoiceModalControl = (target: string, action: 'open_modal' | 'close_modal') => {
    console.log(`🎤 ${action === 'open_modal' ? 'Opening' : 'Closing'} modal via voice command:`, target);
    
    switch (target) {
      case 'generation_settings':
        if (action === 'open_modal') {
          setShowGenSettings(true);
          window.showToast('Opening generation settings!', 'success', 2000);
        } else {
          setShowGenSettings(false);
          window.showToast('Closing generation settings!', 'success', 2000);
        }
        break;
      default:
        console.log('🎤 Unknown modal target:', target);
    }
  };

  const handleVoiceToolControl = (target: string) => {
    console.log('🎤 Switching tool via voice command:', target);
    
    switch (target) {
      case 'brush':
        dispatch({ type: 'SET_TOOL', payload: 'pencil' }); // 'pencil' is the brush-like tool
        window.showToast('Switched to brush tool!', 'success', 2000);
        break;
      case 'pen':
        dispatch({ type: 'SET_TOOL', payload: 'line' }); // 'line' is the pen-like tool
        window.showToast('Switched to pen tool!', 'success', 2000);
        break;
      case 'eraser':
        dispatch({ type: 'SET_TOOL', payload: 'eraser' });
        window.showToast('Switched to eraser tool!', 'success', 2000);
        break;
      case 'pencil':
        dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        window.showToast('Switched to pencil tool!', 'success', 2000);
        break;
      default:
        console.log('🎤 Unknown tool target:', target);
    }
  };

  // 🎤 NEW: Handle canvas clear command from voice
  const handleVoiceCanvasClear = () => {
    console.log('🎤 Voice clear canvas command received');
    dispatch({ type: 'CLEAR_ALL' });
    window.showToast('Canvas cleared via voice command!', 'success', 2000);
  };

  // 🧠 NEW: Get real-time app context for AI
  const getAppContext = () => {
    const context = {
      // Panel states
      panels: {
        layers: state.showLayersPanel,
        grid: state.showGridSettings,
        storyboard: false, // This is in App.tsx, we'll need to access it
        tools: true, // Always visible
        collaboration: true, // Always visible
      },
      
      // Current drawing state
      drawing: {
        currentTool: state.tool,
        shapesCount: state.shapes.length,
        isDrawing: isDrawing,
        hasContent: state.shapes.length > 0,
        currentShape: state.currentShape ? state.currentShape.type : null,
      },
      
      // View state
      view: {
        scale: state.viewTransform.scale,
        offsetX: state.viewTransform.offsetX,
        offsetY: state.viewTransform.offsetY,
        isPanning: isPanning,
      },
      
      // AI connection state
      ai: {
        isConnected: isMultimodalConnected,
        isMuted: isMuted,
        voiceStatus: voiceStatus,
        isRecording: isRecording,
      },
      
      // Timestamp for context freshness
      timestamp: new Date().toISOString(),
    };
    
    console.log('🧠 App Context for AI:', context);
    return context;
  };

  // 🧠 NEW: Send app context to AI periodically
  const sendAppContextToAI = useCallback(() => {
    if (isMultimodalConnected && multimodalWebSocketRef.current?.readyState === WebSocket.OPEN) {
      const context = getAppContext();
      const contextMessage = {
        type: 'app_context',
        context: context,
        timestamp: Date.now()
      };
      
      multimodalWebSocketRef.current.send(JSON.stringify(contextMessage));
      console.log('🧠 Sent app context to AI:', contextMessage);
    }
  }, [isMultimodalConnected, state.showLayersPanel, state.showGridSettings, state.tool, state.shapes.length, isDrawing, isPanning, isMuted, voiceStatus, isRecording]);

  // 🧠 NEW: Send context when important things change
  useEffect(() => {
    sendAppContextToAI();
  }, [state.showLayersPanel, state.showGridSettings, state.tool, isDrawing, isPanning, sendAppContextToAI]);

  // 🧠 NEW: Send context periodically to keep AI updated
  useEffect(() => {
    if (isMultimodalConnected) {
      const contextInterval = setInterval(() => {
        sendAppContextToAI();
      }, 10000); // Send context every 10 seconds
      
      return () => clearInterval(contextInterval);
    }
  }, [isMultimodalConnected, sendAppContextToAI]);

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
      
      const startTime = performance.now();
      console.log('⏱️ [PERFORMANCE] Starting canvas capture...');
      
      // Use direct canvas capture instead of slow html2canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const captureTime = performance.now();
        console.log(`⏱️ [PERFORMANCE] Fast canvas access took: ${captureTime - startTime}ms`);
        
        const imageData = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]; // Higher quality since it's fast now
        const dataUrlTime = performance.now();
        console.log(`⏱️ [PERFORMANCE] Fast toDataURL took: ${dataUrlTime - captureTime}ms`);
        
        console.log('📷 [STREAMING] Fast canvas capture completed!');
      
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
          const totalTime = performance.now();
          console.log(`⏱️ [PERFORMANCE] Total FAST capture + send took: ${totalTime - startTime}ms`);
        }
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

  // Canvas setup effect
  useEffect(() => {
    if (canvasRef.current) {
      // Canvas is ready
      console.log('Canvas element ready');
    }
  }, [canvasRef.current]);

  // Function to get canvas hash for change detection (FAST VERSION)
  const getCanvasHash = () => {
    // Use direct canvas capture instead of slow html2canvas
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve('');
    
    // For change detection, use fast canvas capture
    return new Promise<string>((resolve) => {
      try {
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        resolve(imageData);
      } catch (err) {
        console.error('Error in fast canvas capture:', err);
        resolve('');
      }
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

  // Add this function, modeled after pollEnhancementStatus
  const pollModificationStatus = async (requestId: string) => {
    console.log('🔄 Polling modification status for requestId:', requestId);
    try {
      const response = await fetch(`http://localhost:5001/api/modification-status/${requestId}`);
      console.log(' Response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ Error response: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch modification status: ${response.status} ${response.statusText}`);
      }
      const status = await response.json();
      console.log('📊 Modification status received:', status);
      console.log('📊 Status.status:', status.status);
      console.log('📊 Status.result:', status.result);
      
      if (status.status === 'processing') {
        console.log('⏳ Modification still processing, will poll again in 2 seconds...');
        setTimeout(() => pollModificationStatus(requestId), 2000);
      } else if (status.status === 'complete' && status.result) {
        console.log('✅ Modification complete! Result:', status);
        console.log('✅ About to call addEnhancedImageToCanvas with:', status.result);
        window.showToast('Modification complete! Image added to canvas.', 'success', 3000);
        // Add as interactive image (reuse addEnhancedImageToCanvas)
        addEnhancedImageToCanvas(status.result);
      } else if (status.status === 'error') {
        console.error('❌ Modification failed with error:', status.message);
        window.showToast(`Modification failed: ${status.message || 'Unknown error occurred'}`, 'error', 3000);
      } else {
        console.warn('⚠️ Unexpected status returned:', status.status);
        console.warn('⚠️ Full status object:', status);
        window.showToast(`Unexpected status returned: ${status.status}`, 'error', 3000);
      }
    } catch (err) {
      console.error('❌ Error polling modification status:', err);
      window.showToast(`Error checking modification status: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  };

  // Add this new function that only saves the drawing without enhancement
  

  // Add missing functions for the sidebar buttons
  const handleSave = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `coco-design-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleEnhance = () => {
    // This is a placeholder for the AI enhancement logic.
    // In a real app, you would call an AI service here.
    alert('AI enhancement feature is not yet implemented.');
  };

  const toggleStoryboard = () => {
    if (onToggleStoryboard) {
      onToggleStoryboard();
    } else {
      // Fallback if no prop provided
      alert('Storyboard feature is not yet implemented.');
    }
  };

  const toggleHandTracking = () => {
    setIsHandTrackingEnabled(!isHandTrackingEnabled);
  };

  const toggleDualHandMode = () => {
    setIsDualHandMode(!isDualHandMode);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 overflow-hidden select-none" data-canvas-container>
      <Header />
      
      {/* Professional Top Navigation Bar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-b-2 border-purple-300 shadow-lg">
        <div className="flex items-center justify-center px-8 py-5">
          {/* Left: Empty space for balance */}
          <div className="w-48"></div>
          
          {/* Center: Project Title */}
          <div className="flex items-center space-x-3">
            <div className="w-4 h-4 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full animate-pulse"></div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent animate-gradient-x">
              CoCo Studio
            </h1>
            <div className="w-4 h-4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-pulse delay-300"></div>
          </div>

          {/* Right: Empty space for balance */}
          <div className="w-48"></div>
        </div>
      </div>

      {/* Floating AI Controls Panel */}
      <div className="absolute top-24 left-6 z-40 bg-white/95 backdrop-blur-lg rounded-xl border border-purple-200 shadow-lg p-4">
        <div className="flex flex-col space-y-3">
          {/* Panel Header */}
          <div className="flex items-center space-x-2 mb-2">
            <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"></div>
            <h3 className="text-sm font-semibold text-gray-700">AI Assistant</h3>
          </div>
          
          {/* AI Mode Toggle */}
          <div className="flex items-center bg-purple-100 rounded-lg p-1">
            <button
              className={`px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 ${
                !aiMode || aiMode === 'friendly' 
                  ? 'bg-white text-purple-800 shadow-sm' 
                  : 'text-purple-600 hover:text-purple-800'
              }`}
              onClick={async () => {
                console.log('🎯 Friendly button clicked, current aiMode:', aiMode);
                setAIMode('friendly');
                
                try {
                  const response = await fetch('http://localhost:9085/switch_personality', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ personality: 'friendly' })
                  });
                  
                  if (response.ok) {
                    console.log('✅ Switched to friendly personality via HTTP');
                    if (isMultimodalConnected && multimodalWebSocketRef.current) {
                      console.log('🔄 Reconnecting to get new friendly personality...');
                      multimodalWebSocketRef.current.close();
                      setTimeout(() => {
                        console.log('🔄 Reconnecting to friendly server...');
                        connectMultimodal();
                      }, 300);
                    }
                  } else {
                    console.error('❌ Failed to switch personality');
                  }
                } catch (error) {
                  console.error('❌ Error switching personality:', error);
                }
              }}
              disabled={aiMode === 'friendly'}
            >
              <span className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <span>Friendly</span>
              </span>
            </button>
            <button
              className={`px-3 py-2 text-xs font-medium rounded-md transition-all duration-200 ${
                aiMode === 'sarcastic' 
                  ? 'bg-white text-purple-800 shadow-sm' 
                  : 'text-purple-600 hover:text-purple-800'
              }`}
              onClick={async () => {
                console.log('🎯 Sarcastic button clicked, current aiMode:', aiMode);
                setAIMode('sarcastic');
                
                try {
                  const response = await fetch('http://localhost:9085/switch_personality', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ personality: 'sarcastic' })
                  });
                  
                  if (response.ok) {
                    console.log('✅ Switched to sarcastic personality via HTTP');
                    if (isMultimodalConnected && multimodalWebSocketRef.current) {
                      console.log('🔄 Reconnecting to get new sarcastic personality...');
                      multimodalWebSocketRef.current.close();
                      setTimeout(() => {
                        console.log('🔄 Reconnecting to sarcastic server...');
                        connectMultimodal();
                      }, 300);
                    }
                  } else {
                    console.error('❌ Failed to switch personality');
                  }
                } catch (error) {
                    console.error('❌ Error switching personality:', error);
                }
              }}
              disabled={aiMode === 'sarcastic'}
            >
              <span className="flex items-center space-x-1">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                <span>Sarcastic</span>
              </span>
            </button>
          </div>
          
          {/* AI Connection Button */}
          <button
            className={`px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
              isMultimodalConnected 
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm' 
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-sm'
            }`}
            onClick={isMultimodalConnected ? toggleMute : connectMultimodal}
            title={isMultimodalConnected ? (isMuted ? "Unmute AI Assistant" : "Mute AI Assistant") : "Connect AI Assistant"}
          >
            {isMultimodalConnected ? (
              <span className="flex items-center space-x-2">
                {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
                <span>{isMuted ? "Muted" : "Listening"}</span>
              </span>
            ) : (
              <span className="flex items-center space-x-2">
                <Mic size={14} />
                <span>Connect AI</span>
              </span>
            )}
          </button>
        </div>
        </div>
        
      {/* AI Status Indicator - Floating */}
        {isMultimodalConnected && (
        <div className="absolute top-20 left-6 z-40">
          <div className="bg-white/90 backdrop-blur-md border border-purple-200 rounded-lg shadow-purple-glow px-4 py-2">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                isMuted ? "bg-slate-400" :
                voiceStatus === 'listening' ? "bg-green-500 animate-pulse" :
                isPlayingAudio ? "bg-blue-500 animate-pulse" :
                isLiveStreaming ? "bg-purple-500 animate-pulse" :
                "bg-emerald-500"
              }`}></div>
              <span className="text-sm font-medium text-purple-700">
                {isMuted ? "AI Muted" : 
                 voiceStatus === 'listening' ? "Listening..." :
                 isPlayingAudio ? "AI Speaking..." :
                 isLiveStreaming ? "AI Sees Canvas" :
                 "AI Ready"}
              </span>
            </div>
            </div>
          </div>
        )}
      

      
      {/* Floating Help Indicator - Bottom Left */}
      <div className="absolute bottom-6 left-6 z-40">
        <div className="bg-white/80 backdrop-blur-md border border-purple-200 rounded-lg shadow-purple-glow px-3 py-2">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-purple-600">
              {state.shapes.length > 0 ? `${state.shapes.length} shapes` : 'Start drawing'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Generation Settings Modal */}
          {showGenSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-auto overflow-hidden">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-4">
              <h2 className="text-xl font-semibold text-white">AI Generation Settings</h2>
              <p className="text-purple-100 text-sm mt-1">Customize how AI enhances your drawings</p>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Art Style</label>
                <input 
                  type="text" 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200" 
                  placeholder="e.g., minimalist, watercolor, digital art"
                  value={genSettings.style} 
                  onChange={e => setGenSettings(s => ({...s, style: e.target.value}))} 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Mood & Emotion</label>
                <input 
                  type="text" 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200" 
                  placeholder="e.g., peaceful, energetic, mysterious"
                  value={genSettings.mood} 
                  onChange={e => setGenSettings(s => ({...s, mood: e.target.value}))} 
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Additional Details</label>
                <textarea 
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 resize-none" 
                  rows={3}
                  placeholder="Any specific details, lighting, composition preferences..."
                  value={genSettings.details} 
                  onChange={e => setGenSettings(s => ({...s, details: e.target.value}))} 
                />
              </div>
              
              <div className="flex space-x-3 pt-2">
          <button
                  className="flex-1 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all duration-200"
                  onClick={() => setShowGenSettings(false)}
                >
                  Cancel
          </button>
          <button
                  className="flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg shadow-sm transition-all duration-200"
                  onClick={() => setShowGenSettings(false)}
                >
                  Save Settings
                </button>
                  </div>
                  </div>
                  </div>
                </div>
      )}

      {/* Error Display - Floating */}
      {multimodalError && (
        <div className="absolute right-6 top-20 z-50">
          <div className="bg-red-50 border border-red-200 rounded-lg shadow-sm px-4 py-3 max-w-64">
            <div className="flex items-start space-x-3">
              <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-medium text-red-800">AI Connection Error</h3>
                <p className="text-sm text-red-700 mt-1">{multimodalError}</p>
              </div>
            </div>
              </div>
            </div>
      )}
      
      {/* Drawing Status Indicator - Top Right */}
      {isDrawing && (
        <div className="absolute right-6 top-32 z-40">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg shadow-sm px-3 py-2">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
              <span className="text-xs font-medium text-emerald-700">
                Drawing in progress...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Professional Panels */}
      {state.showLayersPanel && <LayersPanel />}
      {state.showGridSettings && <GridSettings />}

      {/* Render interactive enhanced images */}
      {renderEnhancedImages()}
      
      {/* Main Canvas */}
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
      
      {/* Text Input - Enhanced Styling */}
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
            className="border-2 border-blue-400 px-3 py-2 outline-none rounded-lg shadow-lg bg-white/95 backdrop-blur-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-200"
            style={{
              fontSize: `${state.defaultStyle.fontSize! * state.viewTransform.scale}px`,
              color: state.defaultStyle.strokeColor,
            }}
            placeholder="Type your text..."
          />
        </div>
      )}

      {/* Unified Action Sidebar - Left Side */}
      <div className="absolute left-6 top-80 bottom-6 z-50 flex flex-col space-y-3">
        {/* Save Button */}
        <div className="flex flex-col items-center group">
          <button
            onClick={handleSave}
            className="w-12 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
            title="Save Canvas"
          >
            <svg className="w-5 h-5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Save</span>
        </div>

        {/* Enhance Button */}
        <div className="flex flex-col items-center group">
          <button
            onClick={handleEnhance}
            className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
            title="Enhance with AI"
          >
            <svg className="w-5 h-5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Enhance</span>
        </div>

        {/* Generation Settings Button */}
        <div className="flex flex-col items-center group">
          <button
            onClick={() => setShowGenSettings(true)}
            className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
            title="AI Generation Settings"
          >
            <svg className="w-5 h-5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Settings</span>
        </div>

        {/* Storyboard Button */}
        <div className="flex flex-col items-center group">
          <button
            onClick={toggleStoryboard}
            className="w-12 h-12 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-xl shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
            title="Storyboard"
          >
            <svg className="w-5 h-5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Storyboard</span>
        </div>

        {/* Clear All Button */}
        <div className="flex flex-col items-center group">
          <button
            onClick={handleClearAll}
            className="w-12 h-12 bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white rounded-xl shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-200 group-hover:scale-105"
            title="Clear All"
          >
            <svg className="w-5 h-5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <span className="text-xs font-medium text-slate-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Clear</span>
        </div>
      </div>

      {/* Current Tool Indicator - Above Toolbar */}
      <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 z-40">
        <div className="bg-white/90 backdrop-blur-md border border-purple-200 rounded-lg shadow-purple-glow px-4 py-2">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
            <span className="text-sm font-medium text-purple-700 capitalize">
              {state.tool === 'pixel_eraser' ? 'Pixel Eraser' : 
               state.tool === 'pencil' ? 'Pencil' :
               state.tool === 'rectangle' ? 'Rectangle' :
               state.tool === 'ellipse' ? 'Circle' :
               state.tool === 'line' ? 'Line' :
               state.tool === 'text' ? 'Text' :
               state.tool === 'eraser' ? 'Object Eraser' :
               state.tool === 'pan' ? 'Pan' :
               state.tool === 'select' ? 'Select' : state.tool}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Canvas

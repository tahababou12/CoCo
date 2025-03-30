import React, { useRef, useEffect, useState, createContext, useContext } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { Point } from '../types';
import { Camera } from '@mediapipe/camera_utils';
import { Hands, Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

// Create a context for hand gesture information
interface HandGestureContextType {
  currentGestures: { [key: number]: HandMode };
  isHandTrackingActive: boolean;
}

const HandGestureContext = createContext<HandGestureContextType>({
  currentGestures: {},
  isHandTrackingActive: false
});

export const useHandGesture = () => useContext(HandGestureContext);

// Define hand mode type for better type safety
type HandMode = 'Drawing' | 'Erasing' | 'Clear All' | 'None';

// Hand position smoothing - for stabilizing detection
interface SmoothingBuffer {
  points: Point[];
  maxSize: number;
  modeHistory: HandMode[];
}

// Define an interface for MediaPipe hand landmarks
interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

const HandDrawing: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediapipeRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [isHandTrackingActive, setIsHandTrackingActive] = useState(false);
  const [currentHandCount, setCurrentHandCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWebcamSupported, setIsWebcamSupported] = useState(true);
  const [handCursors, setHandCursors] = useState<{ [key: number]: Point | null }>({
    0: null
  });
  
  // Track drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Make activeHandModesRef state accessible to other components
  const [currentGestures, setCurrentGestures] = useState<{ [key: number]: HandMode }>({
    0: 'None'
  });
  
  // Track previous finger positions for drawing
  const prevPointsRef = useRef<{ [key: number]: Point | null }>({
    0: null
  });

  // Hand tracking state
  const activeHandModesRef = useRef<{ [key: number]: HandMode }>({
    0: 'None'
  });
  
  // Smoothing buffers for hand positions
  const smoothingBuffersRef = useRef<{ [key: number]: SmoothingBuffer }>({
    0: { points: [], maxSize: 5, modeHistory: [] }
  });
  
  // Last time we detected a "Clear All" gesture to avoid rapid clearing
  const lastClearTimeRef = useRef<number>(0);
  const CLEAR_COOLDOWN_MS = 1500; // Cooldown of 1.5 seconds between clear actions
  
  // Add timeout ref to automatically end drawings if no updates for a while
  const lastDrawingUpdateRef = useRef<number>(0);
  const drawingTimeoutRef = useRef<number | null>(null);
  const DRAWING_TIMEOUT_MS = 1000; // End drawing if no updates for 1 second

  // Track drawing state
  const drawingColorsRef = useRef<{ [key: number]: string }>({
    0: '#FF0000' // Red for the hand
  });

  // Drawing thickness
  const drawingThickness = 5;
  
  // Helper function to get a smoothed point
  const getSmoothPoint = (handIndex: number, currentPoint: Point): Point => {
    const buffer = smoothingBuffersRef.current[handIndex];
    
    // Add current point to buffer
    buffer.points.push({ ...currentPoint });
    
    // Keep buffer size limited
    if (buffer.points.length > buffer.maxSize) {
      buffer.points.shift();
    }
    
    // With fewer than 2 points, can't smooth effectively
    if (buffer.points.length < 2) {
      return currentPoint;
    }
    
    // Calculate the weighted average (more recent points have higher weight)
    let totalX = 0;
    let totalY = 0;
    let totalWeight = 0;
    
    buffer.points.forEach((point, idx) => {
      // Weight increases with index (newer points)
      const weight = idx + 1;
      totalX += point.x * weight;
      totalY += point.y * weight;
      totalWeight += weight;
    });
    
    return {
      x: totalX / totalWeight,
      y: totalY / totalWeight
    };
  };
  
  // Helper function to get the stable hand mode
  const getStableHandMode = (handIndex: number, currentMode: HandMode): HandMode => {
    const buffer = smoothingBuffersRef.current[handIndex];
    
    // Add current mode to history
    buffer.modeHistory.push(currentMode);
    
    // Keep history size limited
    if (buffer.modeHistory.length > buffer.maxSize) {
      buffer.modeHistory.shift();
    }
    
    // With fewer than 3 modes, just use the current mode
    if (buffer.modeHistory.length < 3) {
      return currentMode;
    }
    
    // Count occurrences of each mode
    let drawingCount = 0;
    let erasingCount = 0;
    let clearAllCount = 0;
    let noneCount = 0;
    
    buffer.modeHistory.forEach(mode => {
      if (mode === 'Drawing') drawingCount++;
      else if (mode === 'Erasing') erasingCount++;
      else if (mode === 'Clear All') clearAllCount++;
      else if (mode === 'None') noneCount++;
    });
    
    // Find the most common mode
    let mostCommonMode: HandMode = 'None';
    let maxCount = noneCount;
    
    if (drawingCount > maxCount) {
      maxCount = drawingCount;
      mostCommonMode = 'Drawing';
    }
    
    if (erasingCount > maxCount) {
      maxCount = erasingCount;
      mostCommonMode = 'Erasing';
    }
    
    if (clearAllCount > maxCount) {
      maxCount = clearAllCount;
      mostCommonMode = 'Clear All';
    }
    
    // Clear All needs special handling to avoid accidental triggering
    if (mostCommonMode === 'Clear All') {
      const now = Date.now();
      // If we've recently cleared, don't allow another clear yet
      if (now - lastClearTimeRef.current < CLEAR_COOLDOWN_MS) {
        // Find the next most common mode
        if (drawingCount >= erasingCount && drawingCount >= noneCount) {
          return 'Drawing';
        } else if (erasingCount >= drawingCount && erasingCount >= noneCount) {
          return 'Erasing';
        } else {
          return 'None';
        }
      } else {
        // Update the last clear time
        lastClearTimeRef.current = now;
        return 'Clear All';
      }
    }
    
    return mostCommonMode;
  };
  
  // Convert video coordinates to canvas coordinates for cursor display
  const videoToCanvasCoords = (point: Point): Point => {
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
  const canvasToDrawingCoords = (point: Point): Point => {
    // Most important calculation - adjust according to canvas scaling
    return {
      x: (point.x - state.viewTransform.offsetX) / state.viewTransform.scale,
      y: (point.y - state.viewTransform.offsetY) / state.viewTransform.scale
    };
  };
  
  // Update cursor positions
  useEffect(() => {
    // If hand tracking is not active, hide cursors
    if (!isHandTrackingActive) {
      return;
    }
    
    // Otherwise, update the cursor positions based on handCursors state
    Object.entries(handCursors).forEach(([indexStr, point]) => {
      const index = parseInt(indexStr);
      const cursorDiv = document.getElementById(`hand-cursor-${index}`);
      
      if (!cursorDiv || !point) return;
      
      // Convert point to screen coordinates
      const canvasPoint = videoToCanvasCoords(point);
      
      // Position and style cursor
      cursorDiv.style.left = `${canvasPoint.x}px`;
      cursorDiv.style.top = `${canvasPoint.y}px`;
      cursorDiv.style.display = 'block';
      
      // Style based on hand mode
      const mode = activeHandModesRef.current[index];
      cursorDiv.className = `hand-cursor hand-cursor-${index} ${mode.toLowerCase()}-mode`;
      
      // Debug cursor visibility
      console.log(`Updating cursor position: [${canvasPoint.x}, ${canvasPoint.y}], mode: ${mode}, display: ${cursorDiv.style.display}`);
    });
  }, [handCursors, isHandTrackingActive]);
  
  // Initialize MediaPipe Hands and add cursor styles
  useEffect(() => {
    // Check browser compatibility
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsWebcamSupported(false);
      setErrorMessage('Your browser does not support webcam access');
      return;
    }
    
    console.log('Creating cursor elements and adding styles...');
    
    // Add cursor styles
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
    
    // Create initial cursor
    ensureCursorExists(0);
    
    // Clean up on unmount
    return () => {
      // Remove cursor elements
      [0].forEach(index => {
        const cursor = document.getElementById(`hand-cursor-${index}`);
        if (cursor) {
          document.body.removeChild(cursor);
        }
      });
      
      // Remove style
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, []);

  // Initialize MediaPipe Hands
  useEffect(() => {
    if (!isWebcamSupported || !isHandTrackingActive) {
      return;
    }
    
    let videoStream: MediaStream | null = null;
    
    const initializeHandTracking = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        
        // Reset smoothing buffers
        smoothingBuffersRef.current = {
          0: { points: [], maxSize: 5, modeHistory: [] }
        };
        
        // Make sure cursor element exists
        ensureCursorExists(0);
        
        // Initialize MediaPipe Hands
        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });
        
        // Configure MediaPipe Hands
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,  // Lower for better sensitivity
          minTrackingConfidence: 0.5    // Lower for better continuity
        });
        
        // Set up the camera
        if (videoRef.current) {
            // Get user's camera
            videoStream = await navigator.mediaDevices.getUserMedia({ 
              video: { 
                width: 640, 
                height: 480,
                facingMode: 'user' // Use front camera on mobile devices
              } 
            });
            
            // Set video source
            videoRef.current.srcObject = videoStream;
          
          // Set up MediaPipe camera utility
          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && hands) {
                await hands.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });
          
          // Set up the results handler
          hands.onResults(onHandResults);
          
          // Store references
          mediapipeRef.current = hands;
          cameraRef.current = camera;
          
          // Start the camera
          camera.start();
          
          console.log('MediaPipe Hands initialized successfully');
        }
        
        setIsLoading(false);
      } catch (error) {
        setErrorMessage(`Error initializing hand tracking: ${error instanceof Error ? error.message : String(error)}`);
        console.error('Error initializing hand tracking:', error);
        setIsLoading(false);
      }
    };
    
    // Handle results from MediaPipe Hands
    const onHandResults = (results: Results) => {
      if (!canvasRef.current) return;
      
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      // Clear the canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // If we have hands
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        console.log('MediaPipe detected hand landmarks:', results.multiHandLandmarks.length);
        setCurrentHandCount(results.multiHandLandmarks.length);
        
        // Process the first hand only (as we've configured)
        const handIndex = 0;
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw hand landmarks on canvas for debugging
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1 });
        
        // Get index finger tip position
        const indexFinger = landmarks[8];
        const point = {
          x: indexFinger.x, // normalized 0-1 coordinates
          y: indexFinger.y  // normalized 0-1 coordinates
        };
        
        console.log(`Raw index finger position: [${point.x.toFixed(3)}, ${point.y.toFixed(3)}]`);
        
        // Apply smoothing
        const smoothedPoint = getSmoothPoint(handIndex, point);
        
        // Update cursor position
        setHandCursors({ 0: smoothedPoint });
        
        // Determine hand mode based on finger positions
        const mode = determineHandMode(landmarks);
        
        // Apply stability to the hand mode
        const stableMode = getStableHandMode(handIndex, mode);
        activeHandModesRef.current[handIndex] = stableMode;
        
        // Update current gestures
        setCurrentGestures({ 0: stableMode });
        
        // Handle the hand mode
        handleHandMode(stableMode, handIndex, smoothedPoint);
        
        // Debug current shape state
        if (state.currentShape) {
          console.log(`Current shape: id=${state.currentShape.id}, type=${state.currentShape.type}, points=${state.currentShape.points.length}`);
        }
        
        // Debug shapes array length
        console.log(`Total shapes in drawing context: ${state.shapes.length}`);
      } else {
        // No hands detected
        setCurrentHandCount(0);
        
        // End any ongoing drawing when hand disappears
        if (state.currentShape) {
          console.log('No hands detected, saving any active drawing');
          saveDrawing();
        }
        
        // Reset gestures and hide cursor
        setCurrentGestures({ 0: 'None' });
        setHandCursors({ 0: null });
        
        // Reset previous points
        prevPointsRef.current = { 0: null };
      }
    };
    
    // Start hand tracking
      initializeHandTracking();
    
    // Cleanup function
    return () => {
      // End any active drawing before cleanup
      if (state.currentShape) {
        console.log('Ending any active drawing before hand tracking cleanup');
        dispatch({ type: 'END_DRAWING' });
        setIsDrawing(false);
      }
      
      // Stop camera
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      
      // Close MediaPipe Hands
      if (mediapipeRef.current) {
        mediapipeRef.current.close();
      }
      
      // Stop video stream
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      
      // Hide cursor
      setHandCursors({ 0: null });
    };
  }, [isHandTrackingActive, isWebcamSupported]);

  // Determine hand mode from MediaPipe hand landmarks
  const determineHandMode = (landmarks: HandLandmark[]): HandMode => {
    // Calculate finger states - are they extended or not?
    const fingersExtended = [];
    
    // For thumb (using different method)
    // Thumb is extended if the tip is to the left of the IP joint for right hand 
    // or to the right for left hand (simplified)
    const thumbTip = landmarks[4];
    const thumbIP = landmarks[3];
    const wrist = landmarks[0];
    const middleMCP = landmarks[9]; // Use middle finger MCP as reference
    
    // Detect if this is a left or right hand
    const isRightHand = wrist.x < middleMCP.x;
    
    // Check if thumb is extended 
    // For right hand: thumbTip.x < thumbIP.x
    // For left hand: thumbTip.x > thumbIP.x
    const thumbExtended = isRightHand ? thumbTip.x < thumbIP.x : thumbTip.x > thumbIP.x;
    fingersExtended.push(thumbExtended);
    
    // For index finger (8 is tip, 6 is PIP joint)
    fingersExtended.push(landmarks[8].y < landmarks[6].y);
    
    // For middle finger (12 is tip, 10 is PIP joint)
    fingersExtended.push(landmarks[12].y < landmarks[10].y);
    
    // For ring finger (16 is tip, 14 is PIP joint)
    fingersExtended.push(landmarks[16].y < landmarks[14].y);
    
    // For pinky finger (20 is tip, 18 is PIP joint)
    fingersExtended.push(landmarks[20].y < landmarks[18].y);
    
    console.log('Fingers extended:', fingersExtended);
    
    // FEATURE 1: DRAWING MODE - Only index finger is extended
    if (!fingersExtended[0] && fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
      console.log("DETECTED: Drawing mode (index finger only)");
      return 'Drawing';
    }
    // FEATURE 2: ERASING MODE - Closed fist (no fingers extended)
    else if (!fingersExtended[0] && !fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
      console.log("DETECTED: Erasing mode (closed fist)");
      return 'Erasing';
    }
    // FEATURE 3: CLEAR ALL - Only middle finger extended
    else if (!fingersExtended[0] && !fingersExtended[1] && fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) {
      console.log("DETECTED: Clear All mode (middle finger only)");
      return 'Clear All';
    }
    else {
      // Any other hand position
      console.log("DETECTED: None mode (unrecognized gesture)");
      return 'None';
    }
  };

  // Handle different hand modes
  const handleHandMode = (
    mode: HandMode, 
    handIndex: number, 
    currentPoint: Point
  ) => {
    if (!canvasRef.current) return;
    
    // Get the canvas-space position
    const canvasSpacePoint = videoToCanvasCoords(currentPoint);
    
    // Convert to drawing space with transform
    const transformedPoint = canvasToDrawingCoords(canvasSpacePoint);

    // Track previous mode to detect changes
    const prevMode = activeHandModesRef.current[handIndex];
    
    // Handle mode change - always save drawing when switching from Drawing mode
    if (prevMode === 'Drawing' && mode !== 'Drawing' && state.currentShape) {
      console.log(`Hand ${handIndex} changed from Drawing to ${mode}, saving current drawing`);
      saveDrawing();
    }

    // Handle different modes
    if (mode === "Drawing") {
      const prevPoint = prevPointsRef.current[handIndex];
      
      // If this is the first detection for this hand, just store the point
      if (prevPoint === null) {
        console.log(`Hand ${handIndex} first drawing point at`, transformedPoint);
        prevPointsRef.current[handIndex] = transformedPoint;
        
        // Start a new drawing immediately
        console.log('Starting new drawing path');
        
        // Only set tool if not already pencil
        if (state.tool !== 'pencil') {
          dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        }
        
        // Only start drawing if we're not already drawing
        if (!state.currentShape) {
          dispatch({
            type: 'START_DRAWING',
            payload: { 
              point: transformedPoint, 
              type: 'pencil' 
            }
          });
          
          // Set stroke color
          dispatch({
            type: 'SET_STYLE',
            payload: { 
              strokeColor: drawingColorsRef.current[handIndex],
              strokeWidth: drawingThickness
            }
          });
        }
        
        // Update local drawing state
        setIsDrawing(true);
        
        // Update drawing timestamp
        lastDrawingUpdateRef.current = Date.now();
        
        return;
      }
      
      // Check if we've moved enough to draw (prevent jitter)
      const dx = transformedPoint.x - prevPoint.x;
      const dy = transformedPoint.y - prevPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      console.log(`Hand ${handIndex} drawing from [${prevPoint.x.toFixed(1)}, ${prevPoint.y.toFixed(1)}] to [${transformedPoint.x.toFixed(1)}, ${transformedPoint.y.toFixed(1)}], distance=${distance.toFixed(2)}`);
      
      // Only draw if we have a significant movement
      if (distance < 1 && state.currentShape) {
        return;
      }
      
      // Start drawing if not already doing so
      if (!state.currentShape) {
        console.log('Starting new drawing after mode change');
        
        // Switch to pencil tool
        if (state.tool !== 'pencil') {
          dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        }
        
        // Update local drawing state
        setIsDrawing(true);
        
        // Start drawing from the previous point for continuity
        dispatch({
          type: 'START_DRAWING',
          payload: { 
            point: prevPoint, 
            type: 'pencil' 
          }
        });
        
        // Set stroke style
        dispatch({
          type: 'SET_STYLE',
          payload: { 
            strokeColor: drawingColorsRef.current[handIndex],
            strokeWidth: drawingThickness
          }
        });
      } 
      
      // Continue drawing - always update with new point
      dispatch({
        type: 'CONTINUE_DRAWING', 
        payload: transformedPoint
      });
      
      // Update drawing timestamp
      lastDrawingUpdateRef.current = Date.now();
      
      // Store the current point for next frame
      prevPointsRef.current[handIndex] = transformedPoint;
      
      // Periodically save drawing even while in drawing mode
      // This ensures strokes persist even if hand tracking is lost
      const now = Date.now();
      if (now - lastDrawingUpdateRef.current > 500 && state.currentShape && state.currentShape.points.length > 10) {
        saveDrawing();
        
        // Immediately start a new drawing from the current point
        dispatch({
          type: 'START_DRAWING',
          payload: { 
            point: transformedPoint, 
            type: 'pencil' 
          }
        });
        
        // Set stroke style again
        dispatch({
          type: 'SET_STYLE',
          payload: { 
            strokeColor: drawingColorsRef.current[handIndex],
            strokeWidth: drawingThickness
          }
        });
        
        setIsDrawing(true);
      }
    }
    // Eraser mode
    else if (mode === "Erasing") {
      // Save any current drawing
      if (state.currentShape) {
        saveDrawing();
      }
      
      // Switch to eraser tool
      if (state.tool !== 'eraser') {
        dispatch({ type: 'SET_TOOL', payload: 'eraser' });
      }
      
      // Store the current point
      prevPointsRef.current[handIndex] = transformedPoint;
    }
    // Clear all mode
    else if (mode === "Clear All") {
      // Save any current drawing
      if (state.currentShape) {
        saveDrawing();
      }
      
      // Delete all shapes
      const shapeIds = state.shapes.map(shape => shape.id);
      if (shapeIds.length > 0) {
        console.log(`Hand ${handIndex} clearing all ${shapeIds.length} shapes`);
        dispatch({ type: 'DELETE_SHAPES', payload: shapeIds });
      }
      
      // Reset previous points
      prevPointsRef.current = { 0: null };
    }
    else {
      // Any other hand position - stop drawing
      if (state.currentShape) {
        console.log(`Hand ${handIndex} ending drawing due to unrecognized mode`);
        saveDrawing();
      }
      
      // Reset this hand's previous point
      prevPointsRef.current[handIndex] = null;
    }
  };

  // Initialize HandMode
  useEffect(() => {
    // Only monitor drawing data changes when hand tracking is active
    if (!isHandTrackingActive) return;

    // Debug info about rendering and state
    console.log(`Current drawing state update: isDrawing=${isDrawing}, currentShape=${state.currentShape ? state.currentShape.id : 'none'}, shapes=${state.shapes.length}`);

    // Automatically save drawing after some inactivity (acts as a safety net)
    const checkAndSaveTimeout = setTimeout(() => {
      const now = Date.now();
      if (state.currentShape && now - lastDrawingUpdateRef.current > 500) {
        console.log('Auto-saving drawing due to inactivity');
        saveDrawing();
      }
    }, 500);

    return () => {
      clearTimeout(checkAndSaveTimeout);
    };
  }, [isHandTrackingActive, state.currentShape, state.shapes.length]);

  // Add an additional cleanup effect for drawing actions
  useEffect(() => {
    // This effect handles cleanup when the component unmounts or hand tracking is disabled
    return () => {
      // Make sure we end any active drawing
      if (state.currentShape) {
        console.log('HandDrawing cleanup: ending any active drawing');
        dispatch({ type: 'END_DRAWING' });
      }
    };
  }, []);

  // Function to ensure cursor element exists
  const ensureCursorExists = (index: number) => {
    let cursor = document.getElementById(`hand-cursor-${index}`);
    
    // If cursor doesn't exist, create it
    if (!cursor) {
      console.log(`Creating cursor element ${index}`);
      cursor = document.createElement('div');
      cursor.id = `hand-cursor-${index}`;
      cursor.className = `hand-cursor hand-cursor-${index}`;
      cursor.style.position = 'fixed';
      cursor.style.width = '20px';
      cursor.style.height = '20px';
      cursor.style.borderRadius = '50%';
      cursor.style.backgroundColor = drawingColorsRef.current[index];
      cursor.style.opacity = '0.7';
      cursor.style.pointerEvents = 'none';
      cursor.style.zIndex = '9999';
      cursor.style.display = 'none';
      cursor.style.transform = 'translate(-50%, -50%)';
      
      document.body.appendChild(cursor);
      console.log(`Created new cursor ${index}`);
    } else {
      console.log(`Cursor ${index} already exists`);
      // Make sure it's visible
      cursor.style.display = 'none'; // Initially hidden until hand is detected
    }
  };

  // Toggle hand tracking
  const toggleHandTracking = () => {
    // If turning off, make sure we end any active drawing
    if (isHandTrackingActive && state.currentShape) {
      console.log('Ending drawing before disabling hand tracking');
      dispatch({ type: 'END_DRAWING' });
      setIsDrawing(false);
    }
    
    const newActiveState = !isHandTrackingActive;
    
    // If turning on, make sure cursor exists
    if (newActiveState) {
      ensureCursorExists(0);
    } else {
      // Hide cursor when turning off
      const cursor = document.getElementById('hand-cursor-0');
      if (cursor) {
        cursor.style.display = 'none';
      }
    }
    
    setIsHandTrackingActive(newActiveState);
    setErrorMessage(null);
  };

  // Add synchronization effect for drawing state
  useEffect(() => {
    if (state.currentShape && !isDrawing) {
      console.log('HandDrawing detected drawing started externally, syncing state');
      setIsDrawing(true);
    } else if (!state.currentShape && isDrawing) {
      console.log('HandDrawing detected drawing ended externally, syncing state');
      setIsDrawing(false);
    }
  }, [state.currentShape, isDrawing]);

  // Function to check for stale drawings and end them
  const checkStaleDrawings = () => {
    if (state.currentShape && Date.now() - lastDrawingUpdateRef.current > DRAWING_TIMEOUT_MS) {
      console.log('Drawing timed out due to inactivity, ending it');
      dispatch({ type: 'END_DRAWING' });
      setIsDrawing(false);
    }
    
    // Reset the timeout
    drawingTimeoutRef.current = window.setTimeout(checkStaleDrawings, DRAWING_TIMEOUT_MS);
  };
  
  // Initialize the drawing timeout on mount
  useEffect(() => {
    drawingTimeoutRef.current = window.setTimeout(checkStaleDrawings, DRAWING_TIMEOUT_MS);
    
    return () => {
      if (drawingTimeoutRef.current) {
        clearTimeout(drawingTimeoutRef.current);
      }
    };
  }, []);

  // Function to ensure current drawing is saved and persisted
  const saveDrawing = () => {
    // If there's no current shape, nothing to save
    if (!state.currentShape) {
      console.log('No current shape to save');
      return;
    }
    
    // Check if shape has enough points to be valid
    if (state.currentShape.points.length < 2) {
      console.log('Current shape has too few points to save, has', state.currentShape.points.length);
      dispatch({ type: 'END_DRAWING' });
      setIsDrawing(false);
      return;
    }
    
    console.log(`Saving drawing with ${state.currentShape.points.length} points`);
    
    // End the current drawing to save it to shapes array
    dispatch({ type: 'END_DRAWING' });
    setIsDrawing(false);
    
    // Debug output after saving
    setTimeout(() => {
      console.log(`Drawing saved. Total shapes now: ${state.shapes.length}`);
    }, 0);
  };

  return (
    <HandGestureContext.Provider value={{ currentGestures, isHandTrackingActive }}>
      <div className="hand-tracking-container">
        {/* Toggle button */}
        <button 
          className="absolute top-4 right-4 bg-purple-600 text-white p-2 rounded-lg shadow-lg z-20"
          onClick={toggleHandTracking}
          disabled={isLoading || !isWebcamSupported}
        >
          {isLoading ? 'Loading...' : 
           !isWebcamSupported ? 'Not Supported' :
           isHandTrackingActive ? 'Disable Hand Tracking' : 'Enable MediaPipe Hand Tracking'}
        </button>
        
        {/* Video with overlay canvas for visualization */}
        <div className={`absolute top-4 right-4 ${isHandTrackingActive ? 'block' : 'hidden'} z-10`}>
          <div className="relative">
            <video 
              ref={videoRef}
              className="w-64 h-48 object-cover rounded-lg shadow-lg"
              autoPlay 
              playsInline
              muted
              width="640"
              height="480"
              style={{ display: 'block' }} // Make sure it's visible
            ></video>
            <canvas 
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              width={640}
              height={480}
            ></canvas>
          </div>
          <div className="text-xs bg-white p-1 rounded mt-1 text-center">
            {errorMessage ? (
              <span className="text-red-500">{errorMessage}</span>
            ) : currentHandCount > 0 ? (
              `${currentHandCount} hand detected`
            ) : (
              'No hands detected'
            )}
          </div>
        </div>
        
        {/* Hand mode legend */}
        {isHandTrackingActive && (
          <div className="absolute left-4 bottom-4 bg-white p-2 rounded shadow-md text-xs z-10">
            <div className="text-sm font-bold mb-1">Hand Gestures:</div>
            <div className="flex items-center mb-1">
              <div className="w-4 h-4 bg-white border-2 border-red-500 rounded-full mr-2"></div>
              <span>Index Finger Only: Draw</span>
            </div>
            <div className="flex items-center mb-1">
              <div className="w-4 h-4 bg-white border-2 border-dashed border-black rounded-full mr-2"></div>
              <span>Closed Fist: Erase</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-200 mr-2"></div>
              <span>Middle Finger Only: Clear All</span>
            </div>
          </div>
        )}
      </div>
    </HandGestureContext.Provider>
  );
};

export default HandDrawing; 
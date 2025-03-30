import React, { useRef, useEffect, useState } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { Point } from '../types';
import { HandMode, SmoothingBuffer } from '../types/handTracking';
import { Camera } from '@mediapipe/camera_utils';
import { Hands, Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { videoToCanvasCoords, canvasToDrawingCoords } from '../utils/coordinates';
import { determineHandMode, getSmoothPoint, getStableHandMode } from '../utils/handTracking';
import { ensureCursorExists, addCursorStyles, updateCursor, cleanupCursors } from '../utils/cursor';
import { useHandGesture } from '../context/HandGestureContext';

// Debug configuration
const DEBUG = false;
const DEBUG_FINGER_DRAWING = true;

const HandDrawing: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const { isHandTrackingActive, setCurrentGestures, setIsHandTrackingActive } = useHandGesture();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediapipeRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [currentHandCount, setCurrentHandCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWebcamSupported, setIsWebcamSupported] = useState(true);
  const [handCursors, setHandCursors] = useState<{ [key: number]: Point | null }>({
    0: null
  });
  
  // Track drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  
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
  
  // Reference to style element for cursor
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  
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
      const mode = activeHandModesRef.current[index];
      updateCursor(cursorDiv, canvasPoint.x, canvasPoint.y, mode);
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
    
    // Add cursor styles
    styleElementRef.current = addCursorStyles();
    
    // Create initial cursor
    ensureCursorExists(0, drawingColorsRef.current[0]);
    
    // Clean up on unmount
    return () => {
      // Remove cursor elements and styles
      cleanupCursors([0], styleElementRef.current || undefined);
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
        ensureCursorExists(0, drawingColorsRef.current[0]);
        
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
        
        // Apply smoothing
        const smoothedPoint = getSmoothPoint(smoothingBuffersRef.current[handIndex], point);
        
        // Update cursor position
        setHandCursors({ 0: smoothedPoint });
        
        // Determine hand mode based on finger positions
        const mode = determineHandMode(landmarks);
        
        // Apply stability to the hand mode
        const { mode: stableMode, newLastClearTime } = getStableHandMode(
          smoothingBuffersRef.current[handIndex], 
          mode,
          lastClearTimeRef.current,
          CLEAR_COOLDOWN_MS
        );
        
        // Update last clear time if needed
        lastClearTimeRef.current = newLastClearTime;
        
        // Update active mode
        activeHandModesRef.current[handIndex] = stableMode;
        
        // Update current gestures
        setCurrentGestures({ 0: stableMode });
        
        // Handle the hand mode
        handleHandMode(stableMode, handIndex, smoothedPoint);
      } else {
        // No hands detected
        setCurrentHandCount(0);
        
        // End any ongoing drawing when hand disappears
        if (state.currentShape) {
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
    const transformedPoint = canvasToDrawingCoords(
      canvasSpacePoint,
      state.viewTransform.scale,
      state.viewTransform.offsetX,
      state.viewTransform.offsetY
    );

    // Track previous mode to detect changes
    const prevMode = activeHandModesRef.current[handIndex];
    
    // Handle mode change - always save drawing when switching from Drawing mode
    if (prevMode === 'Drawing' && mode !== 'Drawing' && state.currentShape) {
      saveDrawing();
    }

    // Debug finger drawing issues
    if (DEBUG_FINGER_DRAWING && mode === 'Drawing') {
      console.log('Drawing mode detected, transformed point:', transformedPoint);
      console.log('Current drawing state:', state.currentShape ? 'Drawing in progress' : 'No active drawing');
      console.log('Current selected tool:', state.tool);
    }

    // Handle different modes
    if (mode === "Drawing") {
      const prevPoint = prevPointsRef.current[handIndex];
      
      // If this is the first detection for this hand, just store the point
      if (prevPoint === null) {
        prevPointsRef.current[handIndex] = transformedPoint;
        
        // Start a new drawing immediately
        
        // Only set tool if not already pencil
        if (state.tool !== 'pencil') {
          if (DEBUG_FINGER_DRAWING) console.log('Setting tool to pencil');
          dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        }
        
        // Only start drawing if we're not already drawing
        // if (!state.currentShape) {
        //   if (DEBUG_FINGER_DRAWING) console.log('Starting new drawing at', transformedPoint);
        //   dispatch({
        //     type: 'START_DRAWING',
        //     payload: { 
        //       point: transformedPoint, 
        //       type: 'pencil' 
        //     }
        //   });
          
        //   // Set stroke color
        //   dispatch({
        //     type: 'SET_STYLE',
        //     payload: { 
        //       strokeColor: drawingColorsRef.current[handIndex],
        //       strokeWidth: drawingThickness
        //     }
        //   });
        // }
        
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
      
      // Reduce the threshold for movement detection - allow smaller movements
      const MOVEMENT_THRESHOLD = 0.25; // Much smaller threshold for smoother drawing
      
      // Only draw if we have a significant movement, but still update timestamp
      if (distance < MOVEMENT_THRESHOLD && state.currentShape) {
        if (DEBUG_FINGER_DRAWING) console.log('Movement too small, skipping point but updating timestamp');
        lastDrawingUpdateRef.current = Date.now();
        return;
      }
      
      // Start drawing if not already doing so
      if (!state.currentShape) {
        // Switch to pencil tool
        if (state.tool !== 'pencil') {
          if (DEBUG_FINGER_DRAWING) console.log('Setting tool to pencil (during drawing)');
          dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        }
        
        // Update local drawing state
        setIsDrawing(true);
        
        if (DEBUG_FINGER_DRAWING) console.log('Starting drawing from previous point', prevPoint);
        
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
      
      if (DEBUG_FINGER_DRAWING) console.log('Continuing drawing at', transformedPoint);
      
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
        if (DEBUG_FINGER_DRAWING) console.log('Periodic save of drawing with', state.currentShape.points.length, 'points');
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
        if (DEBUG) console.log('Switching to eraser, saving current drawing');
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
        if (DEBUG) console.log('Clearing canvas, saving current drawing first');
        saveDrawing();
      }
      
      // Delete all shapes
      const shapeIds = state.shapes.map(shape => shape.id);
      if (shapeIds.length > 0) {
        dispatch({ type: 'DELETE_SHAPES', payload: shapeIds });
      }
      
      // Reset previous points
      prevPointsRef.current = { 0: null };
    }
    else {
      // Any other hand position - stop drawing
      if (state.currentShape) {
        if (DEBUG) console.log('Hand mode changed, saving drawing');
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

    // Automatically save drawing after some inactivity (acts as a safety net)
    const checkAndSaveTimeout = setTimeout(() => {
      const now = Date.now();
      if (state.currentShape && now - lastDrawingUpdateRef.current > 500) {
        if (DEBUG) console.log('Auto-saving drawing due to inactivity');
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
        if (DEBUG) console.log('Cleanup: ending active drawing');
        dispatch({ type: 'END_DRAWING' });
      }
    };
  }, []);

  // Toggle hand tracking
  const toggleHandTracking = () => {
    // If turning off, make sure we end any active drawing
    if (isHandTrackingActive && state.currentShape) {
      if (DEBUG) console.log('Turning off hand tracking, ending drawing');
      dispatch({ type: 'END_DRAWING' });
      setIsDrawing(false);
    }
    
    const newActiveState = !isHandTrackingActive;
    
    // If turning on, make sure cursor exists
    if (newActiveState) {
      ensureCursorExists(0, drawingColorsRef.current[0]);
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
      if (DEBUG_FINGER_DRAWING) console.log('Syncing local drawing state to true');
      setIsDrawing(true);
    } else if (!state.currentShape && isDrawing) {
      if (DEBUG_FINGER_DRAWING) console.log('Syncing local drawing state to false');
      setIsDrawing(false);
    }
  }, [state.currentShape, isDrawing]);

  // Function to check for stale drawings and end them
  const checkStaleDrawings = () => {
    if (state.currentShape && Date.now() - lastDrawingUpdateRef.current > DRAWING_TIMEOUT_MS) {
      if (DEBUG) console.log('Stale drawing detected, ending drawing');
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
      return;
    }
    
    // Check if shape has enough points to be valid
    if (state.currentShape.points.length < 2) {
      if (DEBUG_FINGER_DRAWING) console.log('Not enough points to save drawing, discarding');
      dispatch({ type: 'END_DRAWING' });
      setIsDrawing(false);
      return;
    }
    
    if (DEBUG_FINGER_DRAWING) {
      console.log('Saving drawing with', state.currentShape.points.length, 'points');
      console.log('First point:', state.currentShape.points[0]);
      console.log('Last point:', state.currentShape.points[state.currentShape.points.length - 1]);
    }
    
    // Make sure stroke style is correct before finalizing
    if (state.currentShape && state.currentShape.style) {
      // Ensure stroke color and width are set correctly
      if (state.currentShape.style.strokeColor !== drawingColorsRef.current[0] ||
          state.currentShape.style.strokeWidth !== drawingThickness) {
        
        // Update style before ending drawing
        dispatch({
          type: 'SET_STYLE',
          payload: { 
            strokeColor: drawingColorsRef.current[0],
            strokeWidth: drawingThickness
          }
        });
      }
    }
    
    // End the current drawing to save it to shapes array
    dispatch({ type: 'END_DRAWING' });
    setIsDrawing(false);
  };

  return (
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
      
      {/* Debug panel for finger drawing - only shown when DEBUG_FINGER_DRAWING is enabled */}
      {isHandTrackingActive && DEBUG_FINGER_DRAWING && (
        <div className="absolute right-4 top-60 bg-white p-2 rounded shadow-md text-xs z-10 max-w-xs">
          <div><strong>Finger Drawing Debug:</strong></div>
          <div>Drawing mode: {activeHandModesRef.current[0]}</div>
          <div>IsDrawing state: {isDrawing ? 'true' : 'false'}</div>
          <div>Has currentShape: {state.currentShape ? 'yes' : 'no'}</div>
          <div>Current tool: {state.tool}</div>
          <div>Shapes in canvas: {state.shapes.length}</div>
          {state.currentShape && (
            <>
              <div>Current points: {state.currentShape.points.length}</div>
              <div>Stroke color: {state.currentShape.style.strokeColor}</div>
              <div>Stroke width: {state.currentShape.style.strokeWidth}</div>
            </>
          )}
          <div>Last cursor position: {handCursors[0] ? 
            `x:${handCursors[0].x.toFixed(2)}, y:${handCursors[0].y.toFixed(2)}` : 
            'none'
          }</div>
          <div>Last transformed point: {prevPointsRef.current[0] ? 
            `x:${prevPointsRef.current[0].x.toFixed(2)}, y:${prevPointsRef.current[0].y.toFixed(2)}` : 
            'none'
          }</div>
          <div>View transform: scale:{state.viewTransform.scale.toFixed(2)}, 
            offset:({state.viewTransform.offsetX.toFixed(0)},{state.viewTransform.offsetY.toFixed(0)})</div>
        </div>
      )}
    </div>
  );
};

export default HandDrawing; 
import React, { useRef, useEffect, useState } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { Point, Shape } from '../types';
import { HandMode, SmoothingBuffer } from '../types/handTracking';
import { Camera } from '@mediapipe/camera_utils';
import { Hands, Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { videoToCanvasCoords, canvasToDrawingCoords } from '../utils/coordinates';
import { determineHandMode, getSmoothPoint, getStableHandMode } from '../utils/handTracking';
import { ensureCursorExists, addCursorStyles, updateCursor, cleanupCursors } from '../utils/cursor';
import { useHandGesture } from '../context/HandGestureContext';
import { useWebSocket } from '../context/WebSocketContext';

// Debug configuration
const DEBUG = true;
const DEBUG_FINGER_DRAWING = true;
const DEBUG_COLLAB = false;

const HandDrawing: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const { isHandTrackingActive, setCurrentGestures, setIsHandTrackingActive } = useHandGesture();
  const webSocket = useWebSocket();
  
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
  
  // Track dual hand mode
  const [dualHandMode, setDualHandMode] = useState(false);
  
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
  
  // Track finger states for debug display
  const [fingerStates, setFingerStates] = useState({
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false,
    handType: 'None'
  });
  
  // Track second hand's finger states for dual mode
  const [secondHandFingerStates, setSecondHandFingerStates] = useState({
    thumb: false,
    index: false,
    middle: false,
    ring: false,
    pinky: false,
    handType: 'None'
  });
  
  // Track if we're currently dragging the canvas
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<Point | null>(null);
  
  // Add a state to track if we're in the process of toggling modes
  const [isToggling, setIsToggling] = useState(false);
  
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
      const mode = activeHandModesRef.current[index] || 'None';
      updateCursor(cursorDiv, canvasPoint.x, canvasPoint.y, mode);
      
      // Send hand cursor position to collaborators if connected
      if (webSocket?.isConnected && webSocket?.sendCursorMove) {
        const cursorPoint = {
          x: canvasPoint.x,
          y: canvasPoint.y,
          isHandTracking: true
        };
        webSocket.sendCursorMove(cursorPoint);
      }
    });
  }, [handCursors, isHandTrackingActive, webSocket]);
  
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
    ensureCursorExists(0, drawingColorsRef.current[0] || '#FF0000');
    
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
    
    // Skip reinitializing while toggling to prevent race conditions
    if (isToggling) {
      return;
    }
    
    let videoStream: MediaStream | null = null;
    let cleanupCompleted = false;
    
    const initializeHandTracking = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        
        // Reset smoothing buffers
        smoothingBuffersRef.current = {
          0: { points: [], maxSize: 5, modeHistory: [] },
          1: { points: [], maxSize: 5, modeHistory: [] }
        };
        
        // Make sure cursor elements exist for both hands
        ensureCursorExists(0, drawingColorsRef.current[0] || '#FF0000');
        ensureCursorExists(1, drawingColorsRef.current[1] || '#00FF00');
        
        // Make sure any previous instances are properly cleaned up
        if (cameraRef.current) {
          try {
            cameraRef.current.stop();
          } catch (e) {
            console.warn("Error stopping camera:", e);
          }
          cameraRef.current = null;
        }
        
        if (mediapipeRef.current) {
          try {
            mediapipeRef.current.close();
          } catch (e) {
            console.warn("Error closing existing MediaPipe Hands instance:", e);
          }
          mediapipeRef.current = null;
        }
        
        // Initialize MediaPipe Hands with a delay to ensure previous instances are cleaned up
        setTimeout(async () => {
          // Skip initialization if component was unmounted during the timeout
          if (cleanupCompleted) return;
          
          try {
            // Initialize MediaPipe Hands
            const hands = new Hands({
              locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
              }
            });
            
            // Configure MediaPipe Hands
            hands.setOptions({
              maxNumHands: dualHandMode ? 2 : 1,
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
                  if (videoRef.current && hands && !cleanupCompleted) {
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
        }, 100); // Short delay to ensure cleanup
      } catch (error) {
        setErrorMessage(`Error in hand tracking setup: ${error instanceof Error ? error.message : String(error)}`);
        console.error('Error in hand tracking setup:', error);
        setIsLoading(false);
      }
    };
    
    // Handle results from MediaPipe Hands
    const onHandResults = (results: Results) => {
      if (!canvasRef.current || cleanupCompleted) return;
      
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      
      // Clear the canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      
      // If we have hands
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        setCurrentHandCount(results.multiHandLandmarks.length);
        
        // Process all detected hands
        const newHandCursors: { [key: number]: Point | null } = { ...handCursors };
        
        results.multiHandLandmarks.forEach((landmarks, index) => {
          // Only process up to 2 hands
          if (index > 1) return;
          
          // Draw hand landmarks on canvas for debugging
          drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: index === 0 ? '#00FF00' : '#0000FF', lineWidth: 2 });
          drawLandmarks(ctx, landmarks, { color: index === 0 ? '#FF0000' : '#FF00FF', lineWidth: 1 });
          
          // Get index finger tip position
          const indexFinger = landmarks[8];
          const point = {
            x: indexFinger.x, // normalized 0-1 coordinates
            y: indexFinger.y  // normalized 0-1 coordinates
          };
          
          // Ensure the smoothing buffer exists for this hand
          if (!smoothingBuffersRef.current[index]) {
            smoothingBuffersRef.current[index] = { points: [], maxSize: 5, modeHistory: [] };
          }
          
          // Apply smoothing
          const smoothedPoint = getSmoothPoint(smoothingBuffersRef.current[index], point);
          
          // Update cursor position for this hand
          newHandCursors[index] = smoothedPoint;
          
          // Determine hand mode based on finger positions
          const { mode, fingerState } = determineHandMode(landmarks);
          
          // Update finger states for the debug display
          if (index === 0) {
            setFingerStates(fingerState);
          } else if (index === 1) {
            setSecondHandFingerStates(fingerState);
          }
          
          // Apply stability to the hand mode
          const { mode: stableMode, newLastClearTime } = getStableHandMode(
            smoothingBuffersRef.current[index], 
            mode,
            lastClearTimeRef.current
          );
          
          // Update last clear time if needed
          lastClearTimeRef.current = newLastClearTime;
          
          // Update active mode
          activeHandModesRef.current[index] = stableMode;
          
          // Handle the hand mode (drawing, erasing, etc.)
          if (smoothedPoint) {
            handleHandMode(stableMode, index, smoothedPoint);
          }
        });
        
        // Update hand cursors state with all detected hands
        setHandCursors(newHandCursors);
        
        // Update gesture context with all hand modes
        setCurrentGestures(activeHandModesRef.current);
      } else {
        // No hands detected
        setCurrentHandCount(0);
        setHandCursors({});
      }
    };
    
    // Start hand tracking
    initializeHandTracking();
    
    // Cleanup function
    return () => {
      // Mark that cleanup is in progress to prevent callbacks
      cleanupCompleted = true;
      
      // End any active drawing before cleanup
      if (state.currentShape) {
        dispatch({ type: 'END_DRAWING' });
        setIsDrawing(false);
      }
      
      // Prevent racing conditions by wrapping cleanup in a safe context
      const safeCleanup = () => {
        // Stop camera first
        if (cameraRef.current) {
          try {
            cameraRef.current.stop();
          } catch (e) {
            console.warn("Error stopping camera during cleanup:", e);
          }
          cameraRef.current = null;
        }
        
        // Give a small delay before closing MediaPipe hands
        setTimeout(() => {
          // Close MediaPipe Hands
          if (mediapipeRef.current) {
            try {
              mediapipeRef.current.close();
            } catch (e) {
              console.warn("Error during cleanup of MediaPipe Hands:", e);
            }
            mediapipeRef.current = null;
          }
          
          // Stop video stream
          if (videoStream) {
            try {
              videoStream.getTracks().forEach(track => track.stop());
            } catch (e) {
              console.warn("Error stopping video stream:", e);
            }
          }
          
          // Hide cursor
          setHandCursors({});
        }, 100);
      };
      
      // Start the safe cleanup process
      safeCleanup();
    };
  }, [isHandTrackingActive, isWebcamSupported, dualHandMode, isToggling]);

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
    
    // Update mode in refs for next frame
    activeHandModesRef.current[handIndex] = mode;
    
    // Process current mode
    switch (mode) {
      case 'Drawing': {
        // Get previous point for this hand - if none, use current point
        const prevPoint = prevPointsRef.current[handIndex] || transformedPoint;
        
        // Filter out erratic movements (very large jumps)
        const distance = Math.sqrt(
          Math.pow(transformedPoint.x - prevPoint.x, 2) + 
          Math.pow(transformedPoint.y - prevPoint.y, 2)
        );
        
        // Skip if the movement is too large (likely tracking error)
        if (distance > 200) {
          if (DEBUG_FINGER_DRAWING) console.log('Skipping large jump:', distance);
          return;
        }
        
        // Update last drawing time
        lastDrawingUpdateRef.current = Date.now();
        
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
          
          // Notify other users about the drawing start via WebSocket
          if (webSocket?.isConnected && webSocket?.startDrawing) {
            if (DEBUG_COLLAB) console.log('[COLLAB] Broadcasting hand drawing start', prevPoint);
            webSocket.startDrawing(prevPoint, 'pencil');
          } else if (DEBUG_COLLAB) {
            console.warn('[COLLAB] WebSocket not connected for drawing start');
          }
        } 
        
        if (DEBUG_FINGER_DRAWING) console.log('Continuing drawing at', transformedPoint);
        
        // Continue drawing - always update with new point
        dispatch({
          type: 'CONTINUE_DRAWING', 
          payload: transformedPoint
        });
        
        // Notify other users about the drawing continuation
        if (webSocket?.isConnected && webSocket?.continueDrawing) {
          if (DEBUG_COLLAB) console.log('[COLLAB] Broadcasting hand drawing update');
          webSocket.continueDrawing(transformedPoint);
        }
        
        // Store the current point for next frame
        prevPointsRef.current[handIndex] = transformedPoint;
        
        // Periodically save drawing even while in drawing mode
        // This ensures strokes persist even if hand tracking is lost
        const now = Date.now();
        if (now - lastDrawingUpdateRef.current > 200 && state.currentShape && state.currentShape.points.length > 5) {
          if (DEBUG_FINGER_DRAWING) console.log('Periodic save of drawing with', state.currentShape.points.length, 'points');
          saveDrawing();
        }
        break;
      }
      
      case 'Dragging': {
        // Get the current cursor element
        const cursorElement = document.getElementById(`hand-cursor-${handIndex}`);
        if (cursorElement) {
          cursorElement.setAttribute('data-dragging', 'true');
        }
        
        // Get the current point for dragging
        const currentPoint = canvasSpacePoint; // Use canvas space for dragging
        
        // When starting a drag operation
        if (!isDragging) {
          console.log('Starting drag operation');
          setIsDragging(true);
          dragStartRef.current = currentPoint;
          // No need to store offsetX/Y, we'll use relative movement
        } 
        // During drag operation
        else if (dragStartRef.current) {
          // Calculate drag delta from last position
          const deltaX = currentPoint.x - dragStartRef.current.x;
          const deltaY = currentPoint.y - dragStartRef.current.y;
          
          if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
            // Apply drag to view transform using the PAN action
            dispatch({
              type: 'PAN',
              payload: { 
                x: deltaX, 
                y: deltaY 
              }
            });
            
            if (DEBUG) console.log('Dragging canvas, delta:', { deltaX, deltaY });
            
            // Update start position for next frame
            dragStartRef.current = currentPoint;
          }
        }
        
        // Store the current point for next frame
        prevPointsRef.current[handIndex] = transformedPoint;
        break;
      }
      
      case 'Clearing': {
        // Clear all drawings when Clearing mode is detected
        console.log('Clearing mode detected - clearing all drawings');
        console.log('Current shapes count:', state.shapes.length);
        console.log('Current drawing state:', state.currentShape ? 'Drawing in progress' : 'No active drawing');
        
        // Call the forceClearAll function
        forceClearAll();
        
        // Show a temporary visual feedback
        const cursorElement = document.getElementById(`hand-cursor-${handIndex}`);
        if (cursorElement) {
          cursorElement.classList.add('clearing-gesture');
          setTimeout(() => {
            cursorElement?.classList.remove('clearing-gesture');
          }, 500);
        }
        
        break;
      }
      
      default:
        // If we were previously dragging, end the drag
        if (isDragging) {
          console.log('Ending drag operation');
          setIsDragging(false);
          dragStartRef.current = null;
          
          // Get the current cursor element and reset dragging state
          const cursorElement = document.getElementById(`hand-cursor-${handIndex}`);
          if (cursorElement) {
            cursorElement.removeAttribute('data-dragging');
          }
        }
        
        // No action for other modes
        break;
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
      ensureCursorExists(0, drawingColorsRef.current[0] || '#FF0000');
      ensureCursorExists(1, drawingColorsRef.current[1] || '#00FF00');
    } else {
      // Hide cursor when turning off
      const cursor0 = document.getElementById('hand-cursor-0');
      const cursor1 = document.getElementById('hand-cursor-1');
      if (cursor0) {
        cursor0.style.display = 'none';
      }
      if (cursor1) {
        cursor1.style.display = 'none';
      }
    }
    
    setIsHandTrackingActive(newActiveState);
    setErrorMessage(null);
  };

  // Toggle dual hand mode
  const toggleDualHandMode = () => {
    // If already toggling, prevent multiple calls
    if (isToggling) return;
    
    // Set toggling state to prevent effect from firing early
    setIsToggling(true);
    
    // End any active drawing
    if (state.currentShape) {
      dispatch({ type: 'END_DRAWING' });
      setIsDrawing(false);
    }

    // Toggle the state
    const newDualHandMode = !dualHandMode;
    setDualHandMode(newDualHandMode);
    
    console.log(`Toggling dual hand mode: ${newDualHandMode ? 'ON' : 'OFF'}`);
    
    // Clear any active cursors
    const cursor0 = document.getElementById('hand-cursor-0');
    const cursor1 = document.getElementById('hand-cursor-1');
    if (cursor0) cursor0.style.display = 'none';
    if (cursor1) cursor1.style.display = 'none';
    
    // If hand tracking is active, we need to restart it with new settings
    if (isHandTrackingActive) {
      // Temporarily disable hand tracking
      setIsHandTrackingActive(false);
      
      // Wait for a short time to ensure cleanup, then re-enable
      setTimeout(() => {
        setIsHandTrackingActive(true);
        
        // Reset toggling flag after a delay to ensure new effect has started
        setTimeout(() => {
          setIsToggling(false);
        }, 200);
      }, 1000); // Longer timeout to ensure proper cleanup
    } else {
      // If hand tracking is not active, just reset the toggling flag
      setTimeout(() => {
        setIsToggling(false);
      }, 200);
    }
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
    if (!state.currentShape) return;
    
    if (DEBUG_FINGER_DRAWING) console.log('Ending and saving drawing');
    
    // Get the current shape ID before ending the drawing
    const shapeId = state.currentShape.id;
    const shapePoints = [...state.currentShape.points]; // Make a copy of points
    
    // First end the drawing in our local state
    dispatch({ type: 'END_DRAWING' });
    
    // Reset transformedPoint for all hands
    Object.keys(prevPointsRef.current).forEach(indexStr => {
      prevPointsRef.current[parseInt(indexStr)] = null;
    });
    
    // Notify other users about the drawing end
    if (webSocket?.isConnected && webSocket?.endDrawing) {
      if (DEBUG_COLLAB) console.log('[COLLAB] Broadcasting hand drawing end to collaborators for shape:', shapeId);
      webSocket.endDrawing();
      
      // Additional check - ensure shape was properly added to the drawing state
      setTimeout(() => {
        const shapeExists = state.shapes.some(shape => shape.id === shapeId);
        if (!shapeExists && shapePoints.length > 1) {
          if (DEBUG_COLLAB) console.warn('[COLLAB] Shape not found after end drawing, reshaping shape');
          
          // If shape wasn't added, create it explicitly
          const newShape: Shape = {
            id: shapeId,
            type: 'pencil',
            points: shapePoints,
            style: { 
              strokeColor: drawingColorsRef.current[0],
              strokeWidth: drawingThickness,
              fillColor: 'transparent',
              opacity: 1,
              fontSize: 16,
            },
            isSelected: false,
          };
          
          dispatch({ type: 'ADD_SHAPE', payload: newShape });
        }
      }, 100);
    } else if (DEBUG_COLLAB) {
      console.warn('[COLLAB] Unable to broadcast drawing end - webSocket not ready');
    }
    
    setIsDrawing(false);
    lastDrawingUpdateRef.current = Date.now();
  };

  // Force clear all drawings
  const forceClearAll = () => {
    console.log('Force clearing all drawings');
    
    // Try to find and click the Clear All button in the Canvas component
    const clearAllButton = document.querySelector('button[title="Clear All Drawings"]');
    if (clearAllButton) {
      console.log('Found Clear All button, clicking it');
      (clearAllButton as HTMLButtonElement).click();
      return;
    }
    
    // Fallback: First make sure any current drawing is ended and saved
    if (state.currentShape) {
      console.log('Ending current drawing before clearing');
      dispatch({ type: 'END_DRAWING' });
      setIsDrawing(false);
    }
    
    // Get all shape IDs
    const shapeIds = state.shapes.map(shape => shape.id);
    console.log('Shape IDs to delete:', shapeIds);
    
    // Delete all shapes if there are any
    if (shapeIds.length > 0) {
      console.log('Dispatching DELETE_SHAPES action with payload:', shapeIds);
      dispatch({ type: 'DELETE_SHAPES', payload: shapeIds });
      
      // Verify the shapes were cleared after a short delay
      setTimeout(() => {
        console.log('After clearing, shapes count:', state.shapes.length);
        
        // If shapes weren't cleared, try again using a different approach
        if (state.shapes.length > 0) {
          console.log('Shapes not cleared on first attempt, trying individual deletion');
          state.shapes.forEach(shape => {
            dispatch({ 
              type: 'DELETE_SHAPES', 
              payload: [shape.id] 
            });
          });
        }
      }, 100);
    } else {
      console.log('No shapes to clear');
    }
  };

  // Update drawing colors
  useEffect(() => {
    // Set colors for each hand
    drawingColorsRef.current = {
      0: '#FF0000', // Red for the first hand
      1: '#00FF00'  // Green for the second hand
    };
    
    // Make sure cursor elements have the right colors
    Object.entries(drawingColorsRef.current).forEach(([indexStr, color]) => {
      const index = parseInt(indexStr);
      ensureCursorExists(index, color);
    });
  }, []);

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
         isHandTrackingActive ? 'Disable Hand Tracking' : 'Enable Hand Tracking'}
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
          {/* Dual hand mode toggle button */}
          <button
            className="absolute bottom-2 left-2 bg-white p-1 rounded-full shadow-lg z-20 transition-transform hover:scale-110"
            onClick={toggleDualHandMode}
            title={dualHandMode ? "Switch to single hand mode" : "Switch to dual hand mode"}
          >
            <span role="img" aria-label="Hands" className="text-lg">
              {dualHandMode ? "🙌" : "👋"}
            </span>
          </button>
        </div>
        <div className="text-xs bg-white p-1 rounded mt-1 text-center">
          {errorMessage ? (
            <span className="text-red-500">{errorMessage}</span>
          ) : currentHandCount > 0 ? (
            `${currentHandCount} hands detected`
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
            <div className="w-4 h-4 bg-white border-2 border-blue-500 rounded-full mr-2"></div>
            <span>Closed Fist: Click Buttons</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 bg-white border-2 border-orange-500 rounded-full mr-2"></div>
            <span>Thumb + Index + Middle: Drag Canvas</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 bg-white border-2 border-red-500 rounded-full mr-2 flex items-center justify-center">
              <span className="text-red-500 font-bold text-xs">✕</span>
            </div>
            <span>Thumb + Pinky: Clear All Drawings</span>
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Tracking Mode: {dualHandMode ? "Dual Hands 🙌" : "Single Hand 👋"}
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
      
      {/* Finger state debug panel */}
      {isHandTrackingActive && (
        <div className="absolute left-4 top-60 bg-white p-2 rounded shadow-md z-10">
          <div className="text-sm font-bold mb-1">
            Hand Finger States: 
            <span className="text-xs font-normal ml-2">
              ({dualHandMode ? "Dual Hand Mode" : "Single Hand Mode"})
            </span>
          </div>
          
          {/* First hand */}
          <div className="mb-2">
            <div className="mb-1">Hand 1: {fingerStates.handType}</div>
            <div className="flex space-x-2">
              <div className={`w-8 h-12 border ${fingerStates.thumb ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                <span className="text-xs font-bold">👍</span>
              </div>
              <div className={`w-8 h-12 border ${fingerStates.index ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                <span className="text-xs font-bold">☝️</span>
              </div>
              <div className={`w-8 h-12 border ${fingerStates.middle ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                <span className="text-xs font-bold">🖕</span>
              </div>
              <div className={`w-8 h-12 border ${fingerStates.ring ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                <span className="text-xs font-bold">💍</span>
              </div>
              <div className={`w-8 h-12 border ${fingerStates.pinky ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                <span className="text-xs font-bold">🤙</span>
              </div>
            </div>
          </div>
          
          {/* Second hand - only show in dual hand mode */}
          {dualHandMode && (
            <div>
              <div className="mb-1">Hand 2: {secondHandFingerStates.handType}</div>
              <div className="flex space-x-2">
                <div className={`w-8 h-12 border ${secondHandFingerStates.thumb ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                  <span className="text-xs font-bold">👍</span>
                </div>
                <div className={`w-8 h-12 border ${secondHandFingerStates.index ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                  <span className="text-xs font-bold">☝️</span>
                </div>
                <div className={`w-8 h-12 border ${secondHandFingerStates.middle ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                  <span className="text-xs font-bold">🖕</span>
                </div>
                <div className={`w-8 h-12 border ${secondHandFingerStates.ring ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                  <span className="text-xs font-bold">💍</span>
                </div>
                <div className={`w-8 h-12 border ${secondHandFingerStates.pinky ? 'bg-green-300 border-green-600' : 'bg-red-300 border-red-600'} flex items-center justify-center rounded`}>
                  <span className="text-xs font-bold">🤙</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HandDrawing; 
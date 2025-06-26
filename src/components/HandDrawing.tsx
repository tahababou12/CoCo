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
import { 
  analyzeFingerSeparation, 
  detectPeaceSign, 
  getFingerTipDistances,
  FingerSeparationAnalysis
} from '../utils/fingerDistance';
import DraggableDebugPanel from './DraggableDebugPanel';

// Debug configuration
const DEBUG = true;
const DEBUG_FINGER_DRAWING = true;
const DEBUG_COLLAB = false;

const HandDrawing: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const { isHandTrackingActive, setCurrentGestures, setIsHandTrackingActive, showDebugPanels } = useHandGesture();
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
  
  // Add finger distance tracking state
  const [fingerDistances, setFingerDistances] = useState<{ [key: string]: number }>({});
  const [peaceSignDetected, setPeaceSignDetected] = useState(false);
  const [fingerSeparationAnalysis, setFingerSeparationAnalysis] = useState<FingerSeparationAnalysis | null>(null);
  
  // Mini toolset state for peace sign gesture
  const [currentStrokeWidth, setCurrentStrokeWidth] = useState(5);
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const colorPalette = ['#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080', '#000000', '#FFFFFF'];
  
  // Use a ref to track the latest stroke width to avoid stale closures in callbacks
  const strokeWidthRef = useRef(currentStrokeWidth);
  useEffect(() => {
    strokeWidthRef.current = currentStrokeWidth;
  }, [currentStrokeWidth]);
  
  // Toolset visibility toggle state
  const [isToolsetVisible, setIsToolsetVisible] = useState(false);
  const [lastPeaceSignState, setLastPeaceSignState] = useState(false);
  const [toolsetPosition, setToolsetPosition] = useState({ x: 20, y: 120 });
  
  // Toggle toolset when peace sign is detected (edge detection)
  useEffect(() => {
    if (peaceSignDetected && !lastPeaceSignState) {
      // Peace sign just detected - toggle toolset
      const wasVisible = isToolsetVisible;
      setIsToolsetVisible(prev => !prev);
      
      // If opening the toolset and we have a cursor position, set toolset position
      if (!wasVisible && handCursors[0]) {
        const canvasSpacePoint = videoToCanvasCoords(handCursors[0]);
        const transformedPoint = canvasToDrawingCoords(
          canvasSpacePoint,
          state.viewTransform.scale,
          state.viewTransform.offsetX,
          state.viewTransform.offsetY
        );
        const screenX = transformedPoint.x * state.viewTransform.scale + state.viewTransform.offsetX;
        const screenY = transformedPoint.y * state.viewTransform.scale + state.viewTransform.offsetY;
        
        // Get canvas position to add offset
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const rect = canvas.getBoundingClientRect();
          const finalX = Math.max(10, Math.min(window.innerWidth - 220, screenX + rect.left - 100));
          const finalY = Math.max(10, screenY + rect.top - 120);
          
          setToolsetPosition({ x: finalX, y: finalY });
        }
      }
    }
    setLastPeaceSignState(peaceSignDetected);
  }, [peaceSignDetected, lastPeaceSignState, isToolsetVisible, handCursors, state.viewTransform]);
  
  // Handle clicking mode interactions with toolset
  useEffect(() => {
    if (!isHandTrackingActive || !isToolsetVisible || !handCursors[0]) return;
    
    const currentMode = activeHandModesRef.current[0];
    if (currentMode !== 'Clicking') return;
    
    // Get cursor screen position
    const canvasSpacePoint = videoToCanvasCoords(handCursors[0]);
    const transformedPoint = canvasToDrawingCoords(
      canvasSpacePoint,
      state.viewTransform.scale,
      state.viewTransform.offsetX,
      state.viewTransform.offsetY
    );
    const screenX = transformedPoint.x * state.viewTransform.scale + state.viewTransform.offsetX;
    const screenY = transformedPoint.y * state.viewTransform.scale + state.viewTransform.offsetY;
    
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const cursorX = screenX + rect.left;
    const cursorY = screenY + rect.top;
    
    // Check if cursor is over the thickness slider
    const sliderElement = document.getElementById('thickness-slider');
    if (sliderElement) {
      const sliderRect = sliderElement.getBoundingClientRect();
      
      if (cursorX >= sliderRect.left && cursorX <= sliderRect.right &&
          cursorY >= sliderRect.top && cursorY <= sliderRect.bottom) {
        
        // Calculate slider position (0-1) based on cursor position
        const sliderProgress = Math.max(0, Math.min(1, (cursorX - sliderRect.left) / sliderRect.width));
        
        // Convert to thickness value (1-100)
        const newThickness = Math.round(1 + sliderProgress * 99);
        
        // Update thickness if it's different
        if (newThickness !== currentStrokeWidth) {
          setCurrentStrokeWidth(newThickness);
        }
      }
    }
    
    // Check if cursor is over color buttons
    const colorButtons = document.querySelectorAll('[data-color-index]');
    colorButtons.forEach((button, index) => {
      const buttonRect = button.getBoundingClientRect();
      
      if (cursorX >= buttonRect.left && cursorX <= buttonRect.right &&
          cursorY >= buttonRect.top && cursorY <= buttonRect.bottom) {
        
        // Click the color button
        if (index !== selectedColorIndex) {
          setSelectedColorIndex(index);
        }
      }
    });
    
  }, [handCursors, isHandTrackingActive, isToolsetVisible, activeHandModesRef.current, state.viewTransform, currentStrokeWidth, selectedColorIndex]);
  
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
      
      // Use the same coordinate transformation as drawing operations
      const canvasSpacePoint = videoToCanvasCoords(point);
      const transformedPoint = canvasToDrawingCoords(
        canvasSpacePoint,
        state.viewTransform.scale,
        state.viewTransform.offsetX,
        state.viewTransform.offsetY
      );
      
      // Convert the transformed drawing coordinates back to screen coordinates for cursor positioning
      const screenX = transformedPoint.x * state.viewTransform.scale + state.viewTransform.offsetX;
      const screenY = transformedPoint.y * state.viewTransform.scale + state.viewTransform.offsetY;
      
      // Get canvas position to add offset
      const canvas = document.querySelector('canvas');
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const finalX = screenX + rect.left;
        const finalY = screenY + rect.top;
        
        // Position and style cursor
        const mode = activeHandModesRef.current[index] || 'None';
        updateCursor(cursorDiv, finalX, finalY, mode, strokeWidthRef.current);
      }
      
      // Send hand cursor position to collaborators if connected
      if (webSocket?.isConnected && webSocket?.sendCursorMove) {
        const cursorPoint = {
          x: canvasSpacePoint.x,
          y: canvasSpacePoint.y,
          isHandTracking: true
        };
        webSocket.sendCursorMove(cursorPoint);
      }
    });
  }, [handCursors, isHandTrackingActive, webSocket, state.viewTransform, strokeWidthRef.current]);
  
  // Reference to style element for cursor
  const styleElementRef = useRef<HTMLStyleElement | null>(null);
  
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
    ensureCursorExists(0, drawingColorsRef.current[0] || '#FF0000', strokeWidthRef.current);
    
    // Clean up on unmount
    return () => {
      // Remove cursor elements and styles
      cleanupCursors([0], styleElementRef.current || undefined);
    };
  }, [strokeWidthRef.current]);

  // Initialize MediaPipe Hands
  useEffect(() => {
    if (!isWebcamSupported || !isHandTrackingActive) {
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
        ensureCursorExists(0, drawingColorsRef.current[0] || '#FF0000', strokeWidthRef.current);
        ensureCursorExists(1, drawingColorsRef.current[1] || '#00FF00', strokeWidthRef.current);
        
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
          
          // Add finger distance tracking for the first hand
          if (index === 0) {
            // Calculate finger distances
            const distances = getFingerTipDistances(landmarks);
            setFingerDistances(distances);
            
            // Detect peace sign gesture
            const isPeaceSign = detectPeaceSign(landmarks);
            setPeaceSignDetected(isPeaceSign);
            
            // Analyze finger separation
            const separationAnalysis = analyzeFingerSeparation(landmarks);
            setFingerSeparationAnalysis(separationAnalysis);
            
            // Log finger distance information for debugging
            if (DEBUG) {
              console.log('Finger distances:', distances);
              console.log('Peace sign detected:', isPeaceSign);
              console.log('Index-Middle distance:', distances.index_middle?.toFixed(4));
              console.log('Fingers stuck together:', separationAnalysis.peaceStuckTogether);
              console.log('Fingers separated (peace):', separationAnalysis.peaceSeparated);
            }
          }
          
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
  }, [isHandTrackingActive, isWebcamSupported, dualHandMode]);

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
    
    // Handle mode change - always save drawing when switching from Drawing or PixelErasing mode
    if ((prevMode === 'Drawing' || prevMode === 'PixelErasing') && mode !== prevMode && state.currentShape) {
      saveDrawing();
    }

    // Reset style when switching from PixelErasing to any other mode
    if (prevMode === 'PixelErasing' && mode !== 'PixelErasing') {
      // Reset only the composite operation to normal drawing
      dispatch({
        type: 'SET_STYLE',
        payload: { 
          globalCompositeOperation: 'source-over' // Reset to normal drawing
        }
      });
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
        // Set drawing state immediately when Drawing mode is detected
        setIsDrawing(true);
        
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
        
        // Update local drawing state - this should already be true from above
        // setIsDrawing(true); - Removed duplicate call
        
        // Start drawing if not already doing so
        if (!state.currentShape) {
          // Switch to pencil tool
          if (state.tool !== 'pencil') {
            if (DEBUG_FINGER_DRAWING) console.log('Setting tool to pencil (during drawing)');
            dispatch({ type: 'SET_TOOL', payload: 'pencil' });
          }
          
          if (DEBUG_FINGER_DRAWING) console.log('Starting drawing from previous point', prevPoint);
          if (DEBUG_FINGER_DRAWING) console.log('Current defaultStyle:', state.defaultStyle);
          
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
              strokeWidth: strokeWidthRef.current,
              globalCompositeOperation: 'source-over' // Ensure normal drawing mode
            }
          });
          
          if (DEBUG_FINGER_DRAWING) console.log('After setting style, defaultStyle:', state.defaultStyle);
          
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
        /*
        const now = Date.now();
        if (now - lastDrawingUpdateRef.current > 200 && state.currentShape && state.currentShape.points.length > 5) {
          if (DEBUG_FINGER_DRAWING) console.log('Periodic save of drawing with', state.currentShape.points.length, 'points');
          saveDrawing();
        }
        */
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
      
      case 'PixelErasing': {
        // Set drawing state immediately when PixelErasing mode is detected
        setIsDrawing(true);
        
        // Get previous point for this hand - if none, use current point
        const prevPoint = prevPointsRef.current[handIndex] || transformedPoint;
        
        // Filter out erratic movements (very large jumps)
        const distance = Math.sqrt(
          Math.pow(transformedPoint.x - prevPoint.x, 2) + 
          Math.pow(transformedPoint.y - prevPoint.y, 2)
        );
        
        // Skip if the movement is too large (likely tracking error)
        if (distance > 200) {
          if (DEBUG_FINGER_DRAWING) console.log('Skipping large jump during erasing:', distance);
          return;
        }
        
        // Update last drawing time
        lastDrawingUpdateRef.current = Date.now();
        
        // Start erasing if not already doing so
        if (!state.currentShape) {
          // Switch to pencil tool for erasing strokes
          if (state.tool !== 'pencil') {
            if (DEBUG_FINGER_DRAWING) console.log('Setting tool to pencil (during erasing)');
            dispatch({ type: 'SET_TOOL', payload: 'pencil' });
          }
          
          if (DEBUG_FINGER_DRAWING) console.log('Starting erasing from previous point', prevPoint);
          
          // Start erasing from the previous point for continuity
          dispatch({
            type: 'START_DRAWING',
            payload: { 
              point: prevPoint, 
              type: 'pencil' 
            }
          });
          
          // Set erasing style by painting with background color
          dispatch({
            type: 'SET_STYLE',
            payload: { 
              strokeColor: '#fffbeb', // Use background color to "erase" by painting over
              strokeWidth: strokeWidthRef.current * 2.5, // Larger width for erasing
              globalCompositeOperation: 'source-over' // Normal drawing operation
            }
          });
          
          // Notify other users about the erasing start via WebSocket
          if (webSocket?.isConnected && webSocket?.startDrawing) {
            if (DEBUG_COLLAB) console.log('[COLLAB] Broadcasting hand erasing start', prevPoint);
            webSocket.startDrawing(prevPoint, 'pencil');
          } else if (DEBUG_COLLAB) {
            console.warn('[COLLAB] WebSocket not connected for erasing start');
          }
        } 
        
        if (DEBUG_FINGER_DRAWING) console.log('Continuing erasing at', transformedPoint);
        
        // Continue erasing - always update with new point
        dispatch({
          type: 'CONTINUE_DRAWING', 
          payload: transformedPoint
        });
        
        // Notify other users about the erasing continuation
        if (webSocket?.isConnected && webSocket?.continueDrawing) {
          if (DEBUG_COLLAB) console.log('[COLLAB] Broadcasting hand erasing update');
          webSocket.continueDrawing(transformedPoint);
        }
        
        // Store the current point for next frame
        prevPointsRef.current[handIndex] = transformedPoint;
        
        // Periodically save erasing even while in erasing mode
        // This ensures erasing strokes persist even if hand tracking is lost
        /*
        const now = Date.now();
        if (now - lastDrawingUpdateRef.current > 200 && state.currentShape && state.currentShape.points.length > 5) {
          if (DEBUG_FINGER_DRAWING) console.log('Periodic save of erasing with', state.currentShape.points.length, 'points');
          saveDrawing();
        }
        */
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
      ensureCursorExists(0, drawingColorsRef.current[0] || '#FF0000', strokeWidthRef.current);
      ensureCursorExists(1, drawingColorsRef.current[1] || '#00FF00', strokeWidthRef.current);
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
    setDualHandMode(prev => !prev);
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
    
    // End the drawing normally
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
              strokeWidth: strokeWidthRef.current,
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
    dispatch({ type: 'CLEAR_ALL' });
  };

  // Update drawing colors based on selected color
  useEffect(() => {
    const selectedColor = colorPalette[selectedColorIndex];
    drawingColorsRef.current = {
      0: selectedColor, // Use selected color for the first hand
      1: selectedColor  // Use selected color for the second hand too
    };
    
    // Make sure cursor elements have the right colors
    Object.entries(drawingColorsRef.current).forEach(([indexStr, color]) => {
      const index = parseInt(indexStr);
      ensureCursorExists(index, color, strokeWidthRef.current);
    });
  }, [selectedColorIndex, colorPalette, strokeWidthRef.current]);

  // Update stroke width in drawing context when currentStrokeWidth changes
  useEffect(() => {
    // Update the default style with the new stroke width from the toolset
    dispatch({
      type: 'SET_STYLE',
      payload: { 
        strokeWidth: strokeWidthRef.current,
        strokeColor: drawingColorsRef.current[0] // Also update color to ensure consistency
      }
    });
  }, [strokeWidthRef.current, selectedColorIndex]);

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
      {isHandTrackingActive && showDebugPanels && (
        <DraggableDebugPanel 
          title="Hand Gestures"
          initialPosition={{ x: 20, y: window.innerHeight - 200 }}
        >
          <div className="text-xs">
            <div className="flex items-center mb-1">
              <div className="w-4 h-4 bg-white border-2 border-red-500 rounded-full mr-2"></div>
              <span>Index Finger Only: Draw</span>
            </div>
            <div className="flex items-center mb-1">
              <div className="w-4 h-4 bg-white border-2 border-purple-500 rounded-full mr-2 flex items-center justify-center">
                <span className="text-purple-500 font-bold text-xs">⌽</span>
              </div>
              <span>Index + Middle: Pixel Eraser</span>
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
      {isHandTrackingActive && (
        <div className="absolute left-4 bottom-4 bg-white p-2 rounded shadow-md text-xs z-10">
          <div className="text-sm font-bold mb-1">Hand Gestures:</div>
          <div className="flex items-center mb-1">
            <span className="text-lg mr-2">🖐️</span>
            <span>Open palm - all fingers extended: Draw</span>
          </div>
          <div className="flex items-center mb-1">
            <span className="text-lg mr-2">🤙</span>
            <span>Thumb + pinky extended: Clear</span>
          </div>
          <div className="flex items-center mb-1">
            <span className="text-lg mr-2">✊</span>
            <span>Closed fist - all fingers curled: Click</span>
          </div>
        </DraggableDebugPanel>
      )}
      
      {/* Debug panel for finger drawing - only shown when DEBUG_FINGER_DRAWING is enabled */}
      {isHandTrackingActive && DEBUG_FINGER_DRAWING && showDebugPanels && (
        <DraggableDebugPanel 
          title="Finger Drawing Debug"
          initialPosition={{ x: window.innerWidth - 400, y: 240 }}
        >
          <div className="text-xs">
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
        </DraggableDebugPanel>
      )}
      
      {/* Finger state debug panel */}
      {isHandTrackingActive && showDebugPanels && (
        <DraggableDebugPanel 
          title="Hand Finger States"
          initialPosition={{ x: 20, y: 240 }}
        >
          <div className="text-xs">
            <div className="text-sm font-bold mb-1">
              ({dualHandMode ? "Dual Hand Mode" : "Single Hand Mode"})
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
        </DraggableDebugPanel>
      )}
      
      {/* Finger Distance Tracking Panel */}
      {isHandTrackingActive && showDebugPanels && (
        <DraggableDebugPanel 
          title="Finger Distance Tracking 🤏"
          initialPosition={{ x: 20, y: 20 }}
        >
          <div className="text-xs max-w-xs">
            {/* Peace Sign Detection */}
            <div className={`mb-2 p-2 rounded ${peaceSignDetected ? 'bg-green-100 border border-green-400' : 'bg-gray-100 border border-gray-300'}`}>
              <div className="font-bold text-center">
                {peaceSignDetected ? '✌️ Peace Sign Detected!' : '✌️ Peace Sign: Not Detected'}
              </div>
            </div>
            
            {/* Finger Separation Analysis */}
            {fingerSeparationAnalysis && (
              <div className="mb-2">
                <div className="font-bold">Finger Analysis:</div>
                <div className={`text-xs ${fingerSeparationAnalysis.peaceSeparated ? 'text-green-600' : 'text-gray-500'}`}>
                  • Peace (Separated): {fingerSeparationAnalysis.peaceSeparated ? 'Yes ✓' : 'No'}
                </div>
                <div className={`text-xs ${fingerSeparationAnalysis.peaceStuckTogether ? 'text-orange-600' : 'text-gray-500'}`}>
                  • Peace (Stuck Together): {fingerSeparationAnalysis.peaceStuckTogether ? 'Yes ⚠️' : 'No'}
                </div>
              </div>
            )}
            
            {/* Finger Distances */}
            <div className="mb-2">
              <div className="font-bold">Finger Distances:</div>
              <div className="max-h-32 overflow-y-auto">
                {Object.entries(fingerDistances).map(([pair, distance]) => {
                  const isStuck = distance < 0.03;
                  const isSeparated = distance > 0.05;
                  
                  return (
                    <div key={pair} className="text-xs flex justify-between items-center py-0.5">
                      <span className="flex-1">
                        • {pair.replace('_', ' ↔ ')}: 
                        <span className="font-mono ml-1">{distance.toFixed(4)}</span>
                      </span>
                      <span className={`ml-2 px-1 rounded text-xs font-bold ${
                        isStuck ? 'bg-orange-200 text-orange-800' : 
                        isSeparated ? 'bg-green-200 text-green-800' : 
                        'bg-gray-200 text-gray-700'
                      }`}>
                        {isStuck ? '🤏 Stuck' : isSeparated ? '✋ Apart' : '👌 Normal'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Instructions */}
            <div className="text-xs text-gray-600 mt-2 border-t pt-1">
              <div className="font-bold">Try these gestures:</div>
              <div>• ✌️ Peace sign (separated fingers)</div>
              <div>• 🤏 Index + middle stuck together</div>
              <div>• 👆 Single finger pointing</div>
            </div>
          </div>
        </DraggableDebugPanel>
      )}
       
      {/* Mini Toolset - toggles on/off with peace sign */}
      {isHandTrackingActive && isToolsetVisible && (
        <div 
          className="fixed z-30 bg-white rounded-lg shadow-lg border border-gray-300 p-3 pointer-events-auto"
          style={{
            top: toolsetPosition.y,
            left: toolsetPosition.x,
            minWidth: '200px'
          }}
        >
          <div className="text-xs font-bold text-center mb-2 text-gray-700 flex items-center justify-between">
            <span>✌️ CoCo Toolset</span>
            <button
              onClick={() => setIsToolsetVisible(false)}
              className="ml-2 text-gray-400 hover:text-gray-600 text-sm"
              title="Close toolset"
            >
              ✕
            </button>
          </div>
          
          {/* Stroke Width Slider */}
          <div className="mb-3">
            <div className="text-xs text-gray-600 mb-1">
              Stroke Width: {strokeWidthRef.current}px
            </div>
            <input
              id="thickness-slider"
              type="range"
              min="1"
              max="100"
              step="1"
              value={strokeWidthRef.current}
              onChange={(e) => setCurrentStrokeWidth(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #4F46E5 0%, #4F46E5 ${((strokeWidthRef.current - 1) / 99) * 100}%, #D1D5DB ${((strokeWidthRef.current - 1) / 99) * 100}%, #D1D5DB 100%)`
              }}
            />
          </div>
          
          {/* Color Palette */}
          <div className="mb-2">
            <div className="text-xs text-gray-600 mb-1">Colors:</div>
            <div className="grid grid-cols-5 gap-1">
              {colorPalette.map((color, index) => (
                <button
                  key={index}
                  data-color-index={index}
                  className={`w-6 h-6 rounded-full border-2 transition-all ${
                    selectedColorIndex === index 
                      ? 'border-gray-800 scale-110' 
                      : 'border-gray-300 hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setSelectedColorIndex(index)}
                  title={`Color ${index + 1}`}
                />
              ))}
            </div>
          </div>
          
          {/* Current Mode Display */}
          <div className="text-xs text-center text-gray-500 mt-2 pt-2 border-t border-gray-200">
            Mode: {activeHandModesRef.current[0] || 'None'}
          </div>
        </div>
      )}
    </div>
  );
};

export default HandDrawing;
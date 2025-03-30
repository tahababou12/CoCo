import React, { useRef, useEffect, useState } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { useWebSocket } from '../context/WebSocketContext';
import { Point } from '../types';

// Define hand mode type for better type safety
type HandMode = 'Drawing' | 'Erasing' | 'Clear All' | 'None';

// Define types for handtrack.js
interface HandPrediction {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  label: string;
  score: number;
}

interface HandTrackModel {
  detect: (input: HTMLVideoElement) => Promise<HandPrediction[]>;
  dispose: () => void;
}

// Add the missing type for window handtrack object
declare global {
  interface Window {
    handTrack: {
      load: (params: HandTrackParams) => Promise<HandTrackModel>;
      startVideo: (video: HTMLVideoElement) => Promise<boolean>;
      stopVideo: (video: HTMLVideoElement) => void;
    }
  }
}

// Parameters for handtrack.js model
interface HandTrackParams {
  flipHorizontal: boolean;
  maxNumBoxes: number;
  iouThreshold: number;
  scoreThreshold: number;
}

// Hand position smoothing - for stabilizing detection
interface SmoothingBuffer {
  points: Point[];
  maxSize: number;
  modeHistory: HandMode[];
}

const HandDrawing: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const webSocket = useWebSocket();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isHandTrackingActive, setIsHandTrackingActive] = useState(false);
  const [currentHandCount, setCurrentHandCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWebcamSupported, setIsWebcamSupported] = useState(true);
  const [isWebcamShared, setIsWebcamShared] = useState(false);
  const [handCursors, setHandCursors] = useState<{ [key: number]: Point | null }>({
    0: null,
    1: null
  });
  
  // Track previous finger positions for drawing
  const prevPointsRef = useRef<{ [key: number]: Point | null }>({
    0: null, 
    1: null
  });

  // Hand tracking state
  const activeHandModesRef = useRef<{ [key: number]: HandMode }>({
    0: 'None',
    1: 'None'
  });
  
  // Smoothing buffers for hand positions
  const smoothingBuffersRef = useRef<{ [key: number]: SmoothingBuffer }>({
    0: { points: [], maxSize: 2, modeHistory: [] },
    1: { points: [], maxSize: 2, modeHistory: [] }
  });
  
  // Last time we detected a "Clear All" gesture to avoid rapid clearing
  const lastClearTimeRef = useRef<number>(0);
  const CLEAR_COOLDOWN_MS = 1000; // Reduced cooldown from 1500ms to 1000ms

  // Track drawing state
  const drawingColorsRef = useRef<{ [key: number]: string }>({
    0: '#FF0000', // Red for first hand
    1: '#00FF00'  // Green for second hand
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
    
    // With only 1 point, can't smooth effectively
    if (buffer.points.length < 2) {
      return currentPoint;
    }
    
    // Calculate a weighted average with MUCH higher weight for the most recent point
    let totalX = 0;
    let totalY = 0;
    let totalWeight = 0;
    
    buffer.points.forEach((point, idx) => {
      // Higher weight for more recent points (much higher exponential weighting)
      const weight = Math.pow(3, idx); // Changed from 2 to 3 for more responsiveness
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
    
    // First, normalize the point relative to the video dimensions
    const normalizedPoint = {
      x: point.x / (videoRef.current?.videoWidth || 320),
      y: point.y / (videoRef.current?.videoHeight || 240)
    };
    
    // Apply a multiplier to speed up cursor movement (making it more responsive)
    const speedMultiplier = 1.1;
    
    // Then, scale to the window dimensions with the speed multiplier
    return {
      x: normalizedPoint.x * window.innerWidth * speedMultiplier,
      y: normalizedPoint.y * window.innerHeight * speedMultiplier
    };
  };
  
  // Convert canvas coordinates to drawing coordinates (with transform)
  const canvasToDrawingCoords = (point: Point): Point => {
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
    });
  }, [handCursors, isHandTrackingActive]);
  
  // Check browser compatibility
  useEffect(() => {
    // Check if the browser supports getUserMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsWebcamSupported(false);
      setErrorMessage('Your browser does not support webcam access');
    }
    
    // Check if WebGL is supported (required for handtrack.js)
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) {
        setErrorMessage('WebGL is not supported or enabled in your browser');
      }
    } catch (error) {
      setErrorMessage(`Error initializing WebGL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Check if handtrack.js is loaded
    if (!window.handTrack) {
      setErrorMessage('HandTrack.js failed to load');
    }
    
    // Add cursor elements to the document
    const createCursorElement = (index: number) => {
      // Check if cursor already exists
      let cursor = document.getElementById(`hand-cursor-${index}`);
      if (cursor) return;
      
      cursor = document.createElement('div');
      cursor.id = `hand-cursor-${index}`;
      cursor.className = `hand-cursor hand-cursor-${index}`;
      cursor.style.position = 'absolute';
      cursor.style.width = '20px';
      cursor.style.height = '20px';
      cursor.style.borderRadius = '50%';
      cursor.style.backgroundColor = 'rgba(255,255,255,0.5)';
      cursor.style.opacity = '0.8';
      cursor.style.pointerEvents = 'none'; // Don't interfere with normal pointer events
      cursor.style.zIndex = '1000';
      cursor.style.display = 'none';
      cursor.style.transform = 'translate(-50%, -50%) scale(1.2)'; // Center the cursor and make slightly larger
      
      document.body.appendChild(cursor);
    };
    
    // Create cursors for both hands
    createCursorElement(0);
    createCursorElement(1);
    
    // Add cursor styles
    const style = document.createElement('style');
    style.innerHTML = `
      .hand-cursor {
        transition: transform 0.05s ease-out, opacity 0.1s ease; /* Faster transition */
        box-shadow: 0 0 8px rgba(0,0,0,0.7);
        z-index: 10000;
      }
      .hand-cursor-0 {
        border: 3px solid #FF0000;
      }
      .hand-cursor-1 {
        border: 3px solid #00FF00;
      }
      .drawing-mode {
        background-color: rgba(255,255,255,0.9) !important;
        width: 15px !important;
        height: 15px !important;
        opacity: 1 !important;
      }
      .erasing-mode {
        background-color: rgba(255,255,255,0.8) !important;
        width: 30px !important;
        height: 30px !important;
        border: 3px dashed #000 !important;
        opacity: 1 !important;
      }
      .clear-all-mode {
        background-color: rgba(255,0,0,0.5) !important;
        width: 40px !important;
        height: 40px !important;
        border-radius: 0 !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
    
    // Clean up on unmount
    return () => {
      // Remove cursor elements
      [0, 1].forEach(index => {
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

  // Initialize hand tracking
  const initializeHandTracking = async () => {
    if (!window.handTrack) {
      setErrorMessage('HandTrack.js not loaded');
      console.error('HandTrack.js not loaded');
      return;
    }
    
    if (!isWebcamSupported) {
      setErrorMessage('Webcam access not supported in your browser');
      return;
    }

    let handTracker: HandTrackModel | null = null;
    let requestId = 0;
    let videoStream: MediaStream | null = null;
    let isDetectionRunning = false;
    let frameCount = 0;  // Track frames for potential skipping
    
    try {
      setIsLoading(true);
      setErrorMessage(null);
      
      // Reset smoothing buffers
      smoothingBuffersRef.current = {
        0: { points: [], maxSize: 2, modeHistory: [] },
        1: { points: [], maxSize: 2, modeHistory: [] }
      };
      
      // Initialize the model with parameters
      const modelParams: HandTrackParams = {
        flipHorizontal: true,  // flip horizontal for webcam
        maxNumBoxes: 1,        // Reduced from 2 to 1 to improve detection speed
        iouThreshold: 0.3,     // Further lowered threshold for better detection sensitivity
        scoreThreshold: 0.55   // Further lowered for better responsiveness
      };
      
      try {
        // Load the model with timeout
        const modelPromise = window.handTrack.load(modelParams);
        
        // Add timeout for model loading
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Model loading timed out')), 15000);
        });
        
        handTracker = await Promise.race([modelPromise, timeoutPromise]) as HandTrackModel;
        console.log('HandTrack model loaded successfully');
      } catch (modelError) {
        setErrorMessage(`Failed to load hand tracking model: ${modelError instanceof Error ? modelError.message : String(modelError)}`);
        setIsLoading(false);
        return;
      }
      
      // Request camera access
      if (isHandTrackingActive && videoRef.current) {
        try {
          // Get user's camera with lower resolution for better performance
          videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: { ideal: 160, max: 320 }, 
              height: { ideal: 120, max: 240 },
              frameRate: { ideal: 10, max: 15 }, // Further reduced frameRate
              facingMode: 'user'
            } 
          });
          
          // Set video source
          videoRef.current.srcObject = videoStream;
          videoRef.current.width = 160;
          videoRef.current.height = 120;
          
          // Wait for video to start playing
          await new Promise<void>((resolve) => {
            if (videoRef.current) {
              // Only start detection after video is playing
              videoRef.current.onloadedmetadata = () => {
                if (videoRef.current) {
                  videoRef.current.play().then(() => {
                    // Add a small delay to ensure video dimensions are available
                    setTimeout(() => {
                      console.log(`Video dimensions: ${videoRef.current?.videoWidth}x${videoRef.current?.videoHeight}`);
                      
                      // Ensure canvas dimensions match video
                      if (canvasRef.current && videoRef.current) {
                        canvasRef.current.width = videoRef.current.videoWidth || 640;
                        canvasRef.current.height = videoRef.current.videoHeight || 480;
                      }
                      
                      resolve();
                    }, 1000); // Longer delay to ensure video is fully loaded
                  }).catch(err => {
                    setErrorMessage(`Error playing video: ${err.message}`);
                    console.error('Error playing video:', err);
                    resolve();
                  });
                } else {
                  resolve();
                }
              };
              
              // Handle video errors
              videoRef.current.onerror = (e) => {
                setErrorMessage(`Video error: ${e}`);
                console.error('Video error:', e);
                resolve();
              };
            } else {
              resolve();
            }
          });
          
          // Start detection loop only if video has dimensions
          if (videoRef.current && 
              videoRef.current.videoWidth > 0 && 
              videoRef.current.videoHeight > 0) {
            // Reset starting points
            prevPointsRef.current = { 0: null, 1: null };
            activeHandModesRef.current = { 0: 'None', 1: 'None' };
            setHandCursors({ 0: null, 1: null });
            isDetectionRunning = true;
            detectHands();
          } else {
            setErrorMessage('Video dimensions not available');
            console.error('Video dimensions not available');
          }
        } catch (err) {
          setErrorMessage(`Error accessing webcam: ${err instanceof Error ? err.message : String(err)}`);
          console.error('Error accessing webcam:', err);
        }
      }
      
      setIsLoading(false);
    } catch (error) {
      setErrorMessage(`Error initializing hand tracking: ${error instanceof Error ? error.message : String(error)}`);
      console.error('Error initializing hand tracking:', error);
      setIsLoading(false);
    }
  };

  // Function to detect hands and process results
  const detectHands = () => {
    if (!videoRef.current || !canvasRef.current || !handTracker || !isDetectionRunning) {
      return;
    }
    
    // Request next frame first to ensure smooth animation
    requestId = requestAnimationFrame(detectHands);
    
    // Skip some frames to reduce CPU usage
    frameCount++;
    if (frameCount % 1 !== 0) { // Changed from 2 to 1 - process every frame for responsiveness
      return;
    }
    
    // Verify video has dimensions and is playing
    if (videoRef.current.videoWidth === 0 || 
        videoRef.current.videoHeight === 0 ||
        videoRef.current.paused || 
        videoRef.current.ended) {
      return;
    }
    
    // Only clear canvas every 3 frames to reduce draw operations
    if (frameCount % 3 === 0) {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }
    }
    
    // Use try/catch to prevent unhandled errors in detection
    try {
      handTracker.detect(videoRef.current)
        .then((predictions: HandPrediction[]) => {
          // Process predictions
          if (predictions.length > 0) {
            setCurrentHandCount(predictions.length);
            
            // Keep track of which hand indices were processed this frame
            const processedHandIndices = new Set<number>();
            const newHandCursors: { [key: number]: Point | null } = { ...handCursors };
            
            // Process each detected hand
            predictions.forEach((prediction, index) => {
              if (index > 1) return; // Only process first two hands
              
              processedHandIndices.add(index);
              const { bbox } = prediction;
              
              // Extract hand coordinates
              const handX = bbox[0] + bbox[2] / 2;
              const handY = bbox[1] + bbox[3] / 2;
              
              // Calculate finger positions based on bounding box
              // In a real implementation, you'd use actual finger landmarks
              // For handtrack.js we're using the center of the bounding box
              const rawFingerTip = { x: handX, y: handY };
              
              // Apply smoothing to stabilize the finger position but with less smoothing
              // Use a more responsive smoothing for fast movements
              const smoothedPoint = getSmoothPoint(index, rawFingerTip);
              
              // Update cursor position
              newHandCursors[index] = smoothedPoint;
              
              // Determine hand mode
              const detectedMode = determineHandMode(prediction);
              
              // Apply stability to the hand mode
              const stableMode = getStableHandMode(index, detectedMode);
              activeHandModesRef.current[index] = stableMode;
              
              // Handle the stable hand mode
              handleHandMode(stableMode, index, smoothedPoint);
              
              // Draw visualization if canvas is available (but less frequently)
              if (canvasRef.current && frameCount % 3 === 0) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) {
                  // Draw bounding box
                  ctx.strokeStyle = drawingColorsRef.current[index] || '#FF0000';
                  ctx.lineWidth = 2;
                  ctx.strokeRect(bbox[0], bbox[1], bbox[2], bbox[3]);
                  
                  // Only draw hand mode label - skip drawing points to improve performance
                  ctx.fillStyle = '#FFFFFF';
                  ctx.font = '12px Arial';
                  ctx.fillText(stableMode, bbox[0], bbox[1] > 20 ? bbox[1] - 5 : bbox[1] + 15);
                }
              }
            });
            
            // Update cursors state
            setHandCursors(newHandCursors);
            
            // For any hands that were previously detected but not in this frame,
            // trigger "None" mode to end any ongoing drawing
            [0, 1].forEach(handIndex => {
              if (!processedHandIndices.has(handIndex) && 
                  prevPointsRef.current[handIndex] !== null) {
                handleHandMode('None', handIndex, { x: 0, y: 0 });
                newHandCursors[handIndex] = null;
              }
            });
            
            // Update cursor visibility
            setHandCursors(newHandCursors);
          } else {
            // No hands detected
            setCurrentHandCount(0);
            
            // End any ongoing drawing for both hands
            [0, 1].forEach(handIndex => {
              if (prevPointsRef.current[handIndex] !== null) {
                handleHandMode('None', handIndex, { x: 0, y: 0 });
              }
            });
            
            // Hide cursors
            setHandCursors({ 0: null, 1: null });
          }
        })
        .catch((error: unknown) => {
          console.error('Error detecting hands:', error);
          setErrorMessage(`Error detecting hands: ${error instanceof Error ? error.message : String(error)}`);
        });
    } catch (error) {
      console.error('Error in detection process:', error);
    }
  };

  // Simple hand mode determination using handtrack.js predictions
  const determineHandMode = (prediction: HandPrediction): HandMode => {
    // For handtrack.js, we'll use the label as a simple determiner
    const { label, score } = prediction;
    
    // Reduced confidence threshold for more responsive detection
    if (score < 0.6) {
      return 'None';
    }
    
    // Basic mapping based on label
    // Handtrack.js only provides these basic gestures:
    // open, closed, point, face, pinch
    if (label === 'open') {
      return 'Drawing';
    } else if (label === 'closed') {
      return 'Erasing';
    } else if (label === 'point') {
      return 'Clear All';
    } else {
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
    
    // Get the canvas-space position (relative to video)
    const canvasSpacePoint = videoToCanvasCoords(currentPoint);
    
    // Then convert to drawing space (with transform)
    const transformedPoint = canvasToDrawingCoords(canvasSpacePoint);

    // If we have a new mode for this hand, end any previous drawing
    const prevMode = activeHandModesRef.current[handIndex];
    if (prevMode !== mode && prevMode === 'Drawing' && state.currentShape) {
      dispatch({ type: 'END_DRAWING' });
    }

    // Handle different modes
    if (mode === "Drawing") {
      const prevPoint = prevPointsRef.current[handIndex];
      
      // If this is the first detection for this hand, just store the point
      if (prevPoint === null) {
        prevPointsRef.current[handIndex] = transformedPoint;
        return;
      }
      
      // Check if we've moved enough to draw
      const dx = transformedPoint.x - prevPoint.x;
      const dy = transformedPoint.y - prevPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Only draw if we've moved enough (prevents tiny jitter)
      // Further reduced minimum distance to 1.0 for increased responsiveness
      if (distance < 1.0 && state.currentShape) {
        return;
      }
      
      // Start drawing if not already drawing
      if (!state.currentShape) {
        // Switch to pencil tool if not already
        if (state.tool !== 'pencil') {
          dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        }
        
        // Start drawing from the previous point
        dispatch({
          type: 'START_DRAWING',
          payload: { 
            point: prevPoint, 
            type: 'pencil' 
          }
        });
        
        // Set stroke color based on hand
        dispatch({
          type: 'SET_STYLE',
          payload: { 
            strokeColor: drawingColorsRef.current[handIndex],
            strokeWidth: drawingThickness
          }
        });
        
        // Continue to the current point
        dispatch({
          type: 'CONTINUE_DRAWING', 
          payload: transformedPoint
        });
      } 
      // Continue drawing
      else {
        dispatch({
          type: 'CONTINUE_DRAWING', 
          payload: transformedPoint
        });
      }
      
      // Store the current point for next frame
      prevPointsRef.current[handIndex] = transformedPoint;
    }
    // Eraser mode
    else if (mode === "Erasing") {
      // Switch to eraser tool
      if (state.tool !== 'eraser') {
        dispatch({ type: 'SET_TOOL', payload: 'eraser' });
      }
      
      // End any active drawing
      if (state.currentShape) {
        dispatch({ type: 'END_DRAWING' });
      }
      
      // To implement true erasing with finger motions like in Python,
      // we would need to add a new eraser mode that tracks movement
      // and deletes shapes directly
      
      // Store the current point
      prevPointsRef.current[handIndex] = transformedPoint;
    }
    // Clear all mode
    else if (mode === "Clear All") {
      // Delete all shapes
      const shapeIds = state.shapes.map(shape => shape.id);
      if (shapeIds.length > 0) {
        console.log(`Hand ${handIndex} clearing all ${shapeIds.length} shapes`);
        dispatch({ type: 'DELETE_SHAPES', payload: shapeIds });
      }
      
      // Reset previous points
      prevPointsRef.current = { 0: null, 1: null };
    }
    else {
      // Any other hand position - stop drawing
      if (state.currentShape) {
        dispatch({ type: 'END_DRAWING' });
      }
      
      // Reset this hand's previous point
      prevPointsRef.current[handIndex] = null;
    }
  };

  // Function to stop hand tracking
  const stopHandTracking = () => {
    // Stop video capture
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    
    // Reset states
    setCurrentHandCount(0);
    setHandCursors({ 0: null, 1: null });
    
    // Hide cursors
    [0, 1].forEach(index => {
      const cursor = document.getElementById(`hand-cursor-${index}`);
      if (cursor) {
        cursor.style.display = 'none';
      }
    });
  };

  // Toggle hand tracking
  const toggleHandTracking = async () => {
    // Toggle the state
    const newState = !isHandTrackingActive;
    setIsHandTrackingActive(newState);
    
    // Notify other users via WebSocket
    if (webSocket) {
      webSocket.toggleHandTracking(newState);
    }
    
    if (newState) {
      try {
        await initializeHandTracking();
      } catch (error) {
        console.error('Failed to initialize hand tracking:', error);
        setIsHandTrackingActive(false);
        setErrorMessage(`Failed to initialize hand tracking: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // Stop hand tracking
      stopHandTracking();
    }
  };
  
  // Toggle webcam sharing
  const toggleWebcamSharing = async () => {
    try {
      if (!isWebcamShared) {
        // Start webcam sharing - simplified approach without relying on handtrack
        if (webSocket) {
          try {
            // Get webcam directly without using handtrack.js
            if (!navigator.mediaDevices) {
              throw new Error('Media devices not supported in this browser');
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { width: 320, height: 240 },
              audio: false
            });
            
            // Share the stream with other users
            await webSocket.startWebcamSharing();
            setIsWebcamShared(true);
            
            // If we're also using hand tracking, connect the stream
            if (isHandTrackingActive && videoRef.current) {
              videoRef.current.srcObject = stream;
            }
          } catch (mediaError) {
            console.error('Failed to access webcam:', mediaError);
            setErrorMessage(`Failed to access webcam: ${mediaError instanceof Error ? mediaError.message : String(mediaError)}`);
          }
        }
      } else {
        // Stop webcam sharing
        if (webSocket) {
          webSocket.stopWebcamSharing();
          setIsWebcamShared(false);
          
          // If hand tracking is active, we need to reinitialize it
          if (isHandTrackingActive) {
            try {
              await initializeHandTracking();
            } catch (error) {
              console.error('Failed to reinitialize hand tracking:', error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error toggling webcam sharing:', error);
      setErrorMessage(`Error toggling webcam sharing: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="hand-drawing-container">
      {/* Video element for webcam (hidden) */}
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          width: '160px',
          height: '120px',
          top: '10px',
          right: '10px',
          zIndex: -1,
          opacity: isHandTrackingActive ? 0.2 : 0, // Slightly visible when active
          transform: 'scaleX(-1)' // Mirror the video
        }}
      />
      
      {/* Canvas for hand tracking debug visualization */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          width: '160px',
          height: '120px',
          top: '10px',
          right: '10px',
          zIndex: -1,
          opacity: 0 // Hidden
        }}
      />
      
      {/* Control buttons */}
      <div className="hand-tracking-controls" style={{
        position: 'absolute',
        bottom: '20px',
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        zIndex: 1000,
      }}>
        {/* Hand tracking toggle button */}
        <button
          onClick={toggleHandTracking}
          className={`hand-tracking-toggle ${isHandTrackingActive ? 'active' : ''}`}
          style={{
            backgroundColor: isHandTrackingActive ? '#4caf50' : '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          disabled={isLoading}
        >
          {isLoading ? 'Loading...' : (isHandTrackingActive ? 'Disable Hand Tracking' : 'Enable Hand Tracking')}
        </button>
        
        {/* Webcam sharing toggle button */}
        {/* <button
          onClick={toggleWebcamSharing}
          className={`webcam-sharing-toggle ${isWebcamShared ? 'active' : ''}`}
          style={{
            backgroundColor: isWebcamShared ? '#4caf50' : '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 12px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          }}
          disabled={isLoading}
        >
          {isWebcamShared ? 'Stop Sharing Webcam' : 'Share Webcam'}
        </button> */}
      </div>
      
      {/* Error message */}
      {errorMessage && (
        <div className="hand-tracking-error" style={{
          position: 'absolute',
          bottom: '80px',
          right: '20px',
          backgroundColor: 'rgba(244, 67, 54, 0.9)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          maxWidth: '300px',
          fontSize: '14px',
          zIndex: 1000,
        }}>
          {errorMessage}
        </div>
      )}
      
      {/* Hand count indicator */}
      {isHandTrackingActive && (
        <div className="hand-count-indicator" style={{
          position: 'absolute',
          top: '140px',
          right: '20px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000,
        }}>
          Hands: {currentHandCount}
        </div>
      )}
    </div>
  );
};

export default HandDrawing; 
import React, { useRef, useEffect, useState } from 'react';
import { useDrawing } from '../context/DrawingContext';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isHandTrackingActive, setIsHandTrackingActive] = useState(false);
  const [currentHandCount, setCurrentHandCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isWebcamSupported, setIsWebcamSupported] = useState(true);
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
    0: { points: [], maxSize: 3, modeHistory: [] },
    1: { points: [], maxSize: 3, modeHistory: [] }
  });
  
  // Last time we detected a "Clear All" gesture to avoid rapid clearing
  const lastClearTimeRef = useRef<number>(0);
  const CLEAR_COOLDOWN_MS = 1500; // Cooldown of 1.5 seconds between clear actions

  // Track the last positions of hands to maintain identity
  const lastHandPositionsRef = useRef<Point[]>([]);

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
  
  // Helper function to assign consistent hand identities to prevent jumping
  const assignHandIdentity = (detectionIndex: number, currentPoint: Point): number => {
    // If this is the first detection, just use the original index
    if (lastHandPositionsRef.current.length === 0) {
      // Initialize with the current point
      lastHandPositionsRef.current[detectionIndex] = { ...currentPoint };
      return detectionIndex;
    }
    
    // Calculate distances to previous hand positions
    const distances: number[] = [];
    
    // Check distances to all previously known hand positions
    lastHandPositionsRef.current.forEach((lastPos, idx) => {
      if (!lastPos) return;
      
      const dx = currentPoint.x - lastPos.x;
      const dy = currentPoint.y - lastPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      distances[idx] = distance;
    });
    
    // Find the closest previous hand position
    let closestIndex = detectionIndex;
    let minDistance = Number.MAX_VALUE;
    
    distances.forEach((distance, idx) => {
      if (distance && distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });
    
    // If the closest hand is reasonably close, use that index
    if (minDistance < 200) { // Threshold for considering it the same hand
      // Update the hand position
      lastHandPositionsRef.current[closestIndex] = { ...currentPoint };
      return closestIndex;
    }
    
    // Otherwise, use the original detection index and update its position
    lastHandPositionsRef.current[detectionIndex] = { ...currentPoint };
    return detectionIndex;
  };
  
  // Convert video coordinates to canvas coordinates for cursor display
  const videoToCanvasCoords = (point: Point): Point => {
    if (!point) return { x: 0, y: 0 };
    
    // First, normalize the point relative to the video dimensions
    const normalizedPoint = {
      x: point.x / (videoRef.current?.videoWidth || 640),
      y: point.y / (videoRef.current?.videoHeight || 480)
    };
    
    // Then, scale to the window dimensions
    return {
      x: normalizedPoint.x * window.innerWidth,
      y: normalizedPoint.y * window.innerHeight
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
      cursor.style.backgroundColor = drawingColorsRef.current[index];
      cursor.style.opacity = '0.7';
      cursor.style.pointerEvents = 'none'; // Don't interfere with normal pointer events
      cursor.style.zIndex = '1000';
      cursor.style.display = 'none';
      cursor.style.transform = 'translate(-50%, -50%)'; // Center the cursor
      
      document.body.appendChild(cursor);
    };
    
    // Create cursors for both hands
    createCursorElement(0);
    createCursorElement(1);
    
    // Add cursor styles
    const style = document.createElement('style');
    style.innerHTML = `
      .hand-cursor {
        transition: all 0.05s ease-out;
        box-shadow: 0 0 5px rgba(0,0,0,0.5);
      }
      .hand-cursor-0 {
        border: 2px solid #FF0000;
      }
      .hand-cursor-1 {
        border: 2px solid #00FF00;
      }
      .drawing-mode {
        background-color: rgba(255,255,255,0.8) !important;
        width: 15px !important;
        height: 15px !important;
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
  useEffect(() => {
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
    
    const initializeHandTracking = async () => {
      try {
        setIsLoading(true);
        setErrorMessage(null);
        
        // Reset smoothing buffers
        smoothingBuffersRef.current = {
          0: { points: [], maxSize: 3, modeHistory: [] },
          1: { points: [], maxSize: 3, modeHistory: [] }
        };
        
        // Initialize the model with parameters
        const modelParams: HandTrackParams = {
          flipHorizontal: true,  // flip horizontal for webcam
          maxNumBoxes: 2,        // maximum number of hands to detect
          iouThreshold: 0.5,     // intersection over union threshold
          scoreThreshold: 0.7    // confidence threshold
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
            videoRef.current.width = 640;
            videoRef.current.height = 480;
            
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
      
      // Verify video has dimensions and is playing
      if (videoRef.current.videoWidth === 0 || 
          videoRef.current.videoHeight === 0 ||
          videoRef.current.paused || 
          videoRef.current.ended) {
        console.warn('Video is not ready, skipping detection');
        requestId = requestAnimationFrame(detectHands);
        return;
      }
      
      // Clear canvas before detection
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
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
                
                const { bbox } = prediction;
                
                // Extract hand coordinates
                const handX = bbox[0] + bbox[2] / 2;
                const handY = bbox[1] + bbox[3] / 2;
                
                // Calculate finger positions based on bounding box
                const rawFingerTip = { x: handX, y: handY };
                
                // Assign hand identity based on position
                const handIndex = assignHandIdentity(index, rawFingerTip);
                processedHandIndices.add(handIndex);
                
                // Apply smoothing to stabilize the finger position
                const smoothedPoint = getSmoothPoint(handIndex, rawFingerTip);
                
                // Update cursor position
                newHandCursors[handIndex] = smoothedPoint;
                
                // Determine hand mode
                const detectedMode = determineHandMode(prediction);
                
                // Apply stability to the hand mode
                const stableMode = getStableHandMode(handIndex, detectedMode);
                activeHandModesRef.current[handIndex] = stableMode;
                
                // Handle the stable hand mode
                handleHandMode(stableMode, handIndex, smoothedPoint);
                
                // Draw visualization if canvas is available
                if (canvasRef.current) {
                  const ctx = canvasRef.current.getContext('2d');
                  if (ctx) {
                    // Draw bounding box
                    ctx.strokeStyle = drawingColorsRef.current[handIndex] || '#FF0000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(bbox[0], bbox[1], bbox[2], bbox[3]);
                    
                    // Draw raw finger position
                    ctx.beginPath();
                    ctx.arc(rawFingerTip.x, rawFingerTip.y, 3, 0, 2 * Math.PI);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.fill();
                    
                    // Draw smoothed finger position
                    ctx.beginPath();
                    ctx.arc(smoothedPoint.x, smoothedPoint.y, 5, 0, 2 * Math.PI);
                    ctx.fillStyle = drawingColorsRef.current[handIndex] || '#FF0000';
                    ctx.fill();
                    
                    // Show hand mode label
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = '12px Arial';
                    ctx.fillText(`Hand ${handIndex}: ${stableMode}`, bbox[0], bbox[1] > 20 ? bbox[1] - 5 : bbox[1] + 15);
                    
                    // If in drawing mode, show a thicker point
                    if (stableMode === 'Drawing') {
                      ctx.beginPath();
                      ctx.arc(smoothedPoint.x, smoothedPoint.y, 8, 0, 2 * Math.PI);
                      ctx.strokeStyle = drawingColorsRef.current[handIndex];
                      ctx.lineWidth = 2;
                      ctx.stroke();
                    }
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
            
            // Continue detection loop
            if (isDetectionRunning) {
              requestId = requestAnimationFrame(detectHands);
            }
          })
          .catch((error: unknown) => {
            console.error('Error detecting hands:', error);
            setErrorMessage(`Error detecting hands: ${error instanceof Error ? error.message : String(error)}`);
            
            // Still continue the detection loop - might be a temporary error
            if (isDetectionRunning) {
              requestId = requestAnimationFrame(detectHands);
            }
          });
      } catch (error) {
        console.error('Error in detection process:', error);
        
        // Continue the loop despite errors
        if (isDetectionRunning) {
          requestId = requestAnimationFrame(detectHands);
        }
      }
    };
    
    // Initialize if hand tracking is active
    if (isHandTrackingActive) {
      initializeHandTracking();
    } else {
      // Hide cursors when not active
      setHandCursors({ 0: null, 1: null });
      
      // Remove cursor elements
      [0, 1].forEach(index => {
        const cursor = document.getElementById(`hand-cursor-${index}`);
        if (cursor) {
          cursor.style.display = 'none';
        }
      });
    }
    
    // Cleanup function
    return () => {
      // Stop detection loop
      isDetectionRunning = false;
      if (requestId) {
        cancelAnimationFrame(requestId);
      }
      
      // Stop video stream
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
      
      // Dispose model
      if (handTracker) {
        handTracker.dispose();
      }
      
      // Hide cursors
      setHandCursors({ 0: null, 1: null });
    };
  }, [isHandTrackingActive, isWebcamSupported]);

  // Simple hand mode determination using handtrack.js predictions
  const determineHandMode = (prediction: HandPrediction): HandMode => {
    // For handtrack.js, we'll use the label as a simple determiner
    const { label, score } = prediction;
    
    // Only use high-confidence predictions
    if (score < 0.7) {
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
      console.log(`Hand ${handIndex} changed mode from ${prevMode} to ${mode}, ending drawing`);
      dispatch({ type: 'END_DRAWING' });
    }

    // Handle different modes
    if (mode === "Drawing") {
      const prevPoint = prevPointsRef.current[handIndex];
      
      // If this is the first detection for this hand, just store the point
      if (prevPoint === null) {
        console.log(`Hand ${handIndex} first drawing point stored at`, transformedPoint);
        prevPointsRef.current[handIndex] = transformedPoint;
        return;
      }
      
      // Check if we've moved enough to draw
      const dx = transformedPoint.x - prevPoint.x;
      const dy = transformedPoint.y - prevPoint.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Only draw if we've moved enough (prevents tiny jitter)
      // But don't filter if we're just starting to draw
      if (distance < 5 && state.currentShape) {
        // Small movements still update the cursor
        return;
      }
      
      console.log(`Hand ${handIndex} DRAWING from`, prevPoint, 'to', transformedPoint, `distance=${distance.toFixed(2)}`);
      
      // Start drawing if not already drawing
      if (!state.currentShape) {
        // Switch to pencil tool
        dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        
        // Start drawing from the current point (more reliable than using prevPoint)
        dispatch({
          type: 'START_DRAWING',
          payload: { 
            point: transformedPoint, 
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
      
      // Implement direct erasing by finding shapes under the cursor
      // This simulates actual erasing rather than just setting the tool
      const shapeIds = findShapesUnderPoint(transformedPoint);
      if (shapeIds.length > 0) {
        dispatch({ type: 'DELETE_SHAPES', payload: shapeIds });
      }
      
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

  // Helper function to find shapes under a point
  const findShapesUnderPoint = (point: Point): string[] => {
    // Get nearby shapes that intersect with this point
    const nearbyShapes = state.shapes.filter(shape => {
      // For now, we'll implement a simple hit test for pencil lines
      if (shape.type === 'pencil' && shape.points.length >= 2) {
        // Check if point is close to any segment of the line
        for (let i = 1; i < shape.points.length; i++) {
          const p1 = shape.points[i-1];
          const p2 = shape.points[i];
          
          // Calculate distance from point to line segment
          const distance = distanceToLineSegment(p1, p2, point);
          
          // If point is close enough to the line, include this shape
          if (distance < 20) { // 20px threshold for erasing
            return true;
          }
        }
      }
      return false;
    });
    
    return nearbyShapes.map(shape => shape.id);
  };
  
  // Helper to calculate distance from point to line segment
  const distanceToLineSegment = (p1: Point, p2: Point, p: Point): number => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSquared = dx * dx + dy * dy;
    
    // If segment is a point, just return distance to that point
    if (lenSquared === 0) {
      return Math.sqrt((p.x - p1.x) * (p.x - p1.x) + (p.y - p1.y) * (p.y - p1.y));
    }
    
    // Calculate projection of point onto line
    let t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / lenSquared;
    t = Math.max(0, Math.min(1, t)); // Clamp t to range [0,1]
    
    // Calculate closest point on line segment
    const closest = {
      x: p1.x + t * dx,
      y: p1.y + t * dy
    };
    
    // Return distance to closest point
    return Math.sqrt((p.x - closest.x) * (p.x - closest.x) + (p.y - closest.y) * (p.y - closest.y));
  };

  // Toggle hand tracking
  const toggleHandTracking = () => {
    setIsHandTrackingActive(!isHandTrackingActive);
    setErrorMessage(null);
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
         isHandTrackingActive ? 'Disable Hand Tracking' : 'Enable Hand Tracking'}
      </button>
      
      {/* Video with overlay canvas for visualization */}
      <div className={`absolute top-0 right-0 ${isHandTrackingActive ? 'block' : 'hidden'} z-10`}>
        <div className="relative">
          <video 
            ref={videoRef}
            className="w-64 h-48 object-cover rounded-lg shadow-lg"
            autoPlay 
            playsInline
            muted
            width="640"
            height="480"
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
            `${currentHandCount} hand${currentHandCount > 1 ? 's' : ''} detected`
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
            <span>Open Hand: Draw</span>
          </div>
          <div className="flex items-center mb-1">
            <div className="w-4 h-4 bg-white border-2 border-dashed border-black rounded-full mr-2"></div>
            <span>Closed Fist: Erase</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-200 mr-2"></div>
            <span>Pointing: Clear All</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default HandDrawing; 
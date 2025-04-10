import React, { useRef, useState, useEffect } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { useDrawing } from '../context/DrawingContext';
import { Point, Shape } from '../types';

// Define hand mode type for better type safety
type HandMode = 'Drawing' | 'Clicking' | 'None';

// Extend window interface to work with MediaPipe
declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}

// Define interfaces for smoothing buffers
interface SmoothingBuffer {
  points: Point[];
  maxSize: number;
  modeHistory: HandMode[];
}

const SimpleWebcam: React.FC = () => {
  const webSocketContext = useWebSocket();
  const { state, dispatch } = useDrawing();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State variables
  const [isWebcamShared, setIsWebcamShared] = useState<boolean>(false);
  const [isHandTrackingActive, setIsHandTrackingActive] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [currentHandCount, setCurrentHandCount] = useState(0);
  const [isWebcamSupported, setIsWebcamSupported] = useState(true);
  
  // Track the active hand modes
  const activeHandModesRef = useRef<{ [key: number]: HandMode }>({
    0: 'None',
    1: 'None'
  });

  // Previous hand positions for tracking movement
  const prevHandPositions = useRef<{ [key: number]: Point | null }>({
    0: null,
    1: null
  });
  
  // Store MediaPipe Hands instance
  const handsRef = useRef<any>(null);
  
  // Smoothing buffer for hand position tracking
  const smoothingBuffersRef = useRef<{ [key: number]: SmoothingBuffer }>({
    0: { points: [], maxSize: 5, modeHistory: [] },
    1: { points: [], maxSize: 5, modeHistory: [] }
  });
  
  // Get smoothed point to reduce jitter
  const getSmoothPoint = (handIndex: number, currentPoint: Point): Point => {
    const buffer = smoothingBuffersRef.current[handIndex];
    
    // Add current point to buffer
    buffer.points.push(currentPoint);
    
    // Keep buffer size limited
    if (buffer.points.length > buffer.maxSize) {
      buffer.points.shift();
    }
    
    // Calculate average position
    const avgX = buffer.points.reduce((sum, p) => sum + p.x, 0) / buffer.points.length;
    const avgY = buffer.points.reduce((sum, p) => sum + p.y, 0) / buffer.points.length;
    
    return { x: avgX, y: avgY };
  };
  
  // Get stable hand mode to reduce jitter
  const getStableHandMode = (handIndex: number, currentMode: HandMode): HandMode => {
    const buffer = smoothingBuffersRef.current[handIndex];
    
    // Add current mode to buffer
    buffer.modeHistory.push(currentMode);
    
    // Keep buffer size limited
    if (buffer.modeHistory.length > buffer.maxSize) {
      buffer.modeHistory.shift();
    }
    
    // Find most common mode in buffer
    const modeCounts: Record<string, number> = {};
    let maxCount = 0;
    let mostFrequentMode: HandMode = currentMode;
    
    buffer.modeHistory.forEach(mode => {
      modeCounts[mode] = (modeCounts[mode] || 0) + 1;
      if (modeCounts[mode] > maxCount) {
        maxCount = modeCounts[mode];
        mostFrequentMode = mode;
      }
    });
    
    return mostFrequentMode;
  };
  
  // Convert from video coordinates to canvas
  const videoToCanvasCoords = (point: Point): Point => {
    if (!localVideoRef.current || !canvasRef.current) return point;
    
    const videoWidth = localVideoRef.current.videoWidth;
    const videoHeight = localVideoRef.current.videoHeight;
    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;
    
    // Scale coordinates from video to canvas
    return {
      x: point.x * (canvasWidth / videoWidth),
      y: point.y * (canvasHeight / videoHeight)
    };
  };
  
  // Convert from canvas coordinates to drawing coordinates
  const canvasToDrawingCoords = (point: Point): Point => {
    return {
      x: (point.x - state.viewTransform.offsetX) / state.viewTransform.scale,
      y: (point.y - state.viewTransform.offsetY) / state.viewTransform.scale
    };
  };
  
  // Determine hand mode from landmarks
  const determineHandMode = (landmarks: any[]): HandMode => {
    // Check if any landmarks are available
    if (!landmarks || landmarks.length === 0) return 'None';
    
    // Get thumb tip, index tip, middle tip, and palm positions
    const thumbTip = landmarks[4];  // Thumb tip
    const indexTip = landmarks[8];  // Index finger tip
    const middleTip = landmarks[12]; // Middle finger tip
    const ringTip = landmarks[16];  // Ring finger tip
    const pinkyTip = landmarks[20]; // Pinky tip
    
    // Check if the hand is closed (all fingers curled)
    const thumbIsClosed = thumbTip.y > landmarks[2].y;
    const indexIsClosed = indexTip.y > landmarks[6].y;
    const middleIsClosed = middleTip.y > landmarks[10].y;
    const ringIsClosed = ringTip.y > landmarks[14].y;
    const pinkyIsClosed = pinkyTip.y > landmarks[18].y;
    
    // Fist (all fingers closed) = Clicking
    if (indexIsClosed && middleIsClosed && ringIsClosed && pinkyIsClosed) {
      return "Clicking";
    }
    
    // Open palm (all fingers extended) = Drawing
    if (!indexIsClosed && !middleIsClosed && !ringIsClosed && !pinkyIsClosed) {
      return "Drawing";
    }
    
    // Default - no special gesture detected
    return "None";
  };
  
  // Create or update hand cursors to make them visible
  const updateHandCursors = (results: any) => {
    // Hide all cursors first
    [0, 1].forEach(index => {
      const cursorDiv = document.getElementById(`hand-cursor-${index}`);
      if (cursorDiv) {
        cursorDiv.style.display = 'none';
      }
    });
    
    // Then show and update positions for detected hands
    if (results.multiHandLandmarks) {
      results.multiHandLandmarks.forEach((landmarks: any, index: number) => {
        if (index > 1) return; // Only support up to 2 hands
        
        let cursorDiv = document.getElementById(`hand-cursor-${index}`);
        
        // Create cursor if it doesn't exist
        if (!cursorDiv) {
          cursorDiv = document.createElement('div');
          cursorDiv.id = `hand-cursor-${index}`;
          cursorDiv.className = 'hand-cursor';
          document.body.appendChild(cursorDiv);
        }
        
        // Get index finger tip position (landmark 8)
        const indexTip = landmarks[8];
        const videoWidth = localVideoRef.current?.videoWidth || 640;
        const videoHeight = localVideoRef.current?.videoHeight || 480;
        
        // Convert to pixel coordinates
        const x = indexTip.x * videoWidth;
        const y = indexTip.y * videoHeight;
        
        // Get hand point for tracking
        const handPoint: Point = { x, y };
        
        // Get smoothed point for better tracking
        const smoothedPoint = getSmoothPoint(index, handPoint);
        
        // Convert to canvas coordinates
        const canvasPoint = videoToCanvasCoords(smoothedPoint);
        
        // Update cursor styles
        cursorDiv.style.position = 'absolute';
        cursorDiv.style.width = '20px';
        cursorDiv.style.height = '20px';
        cursorDiv.style.borderRadius = '50%';
        cursorDiv.style.pointerEvents = 'none';
        cursorDiv.style.transform = 'translate(-50%, -50%)';
        cursorDiv.style.zIndex = '1000';
        cursorDiv.style.display = 'block';
        cursorDiv.style.left = `${canvasPoint.x}px`;
        cursorDiv.style.top = `${canvasPoint.y}px`;
        
        // Determine hand mode from landmarks
        const mode = determineHandMode(landmarks);
        const stableMode = getStableHandMode(index, mode);
        
        // Store the current mode
        activeHandModesRef.current[index] = stableMode;
        
        // Update cursor appearance based on hand mode
        if (stableMode === 'Drawing') {
          cursorDiv.style.backgroundColor = index === 0 ? 'rgba(0, 128, 255, 0.7)' : 'rgba(255, 64, 128, 0.7)';
          cursorDiv.style.border = '2px solid white';
        } else if (stableMode === 'Clicking') {
          cursorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
          cursorDiv.style.border = '2px solid black';
          cursorDiv.style.width = '30px';
          cursorDiv.style.height = '30px';
        } else {
          cursorDiv.style.backgroundColor = 'rgba(200, 200, 200, 0.5)';
          cursorDiv.style.border = '1px solid gray';
        }
        
        // Convert to drawing coordinates
        const transformedPoint = canvasToDrawingCoords(canvasPoint);
        
        // Handle different hand modes
        handleHandMode(stableMode, index, transformedPoint);
      });
    }
  };
  
  // Process results from MediaPipe Hands
  const onResults = (results: any) => {
    if (!isWebcamShared || !results) return;
    
    try {
      // Get canvas for visualization if needed
      const canvas = canvasRef.current;
      const video = localVideoRef.current;
      
      if (canvas && canvas.getContext && video) {
        // Match canvas size to video
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
        
        // Get canvas context for drawing
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Draw video frame for debugging
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Draw hand landmarks using MediaPipe drawing utils
          if (results.multiHandLandmarks && window.drawConnectors && window.drawLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
              // Draw connections between landmarks
              window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, 
                {color: '#00FF00', lineWidth: 2});
              
              // Draw the landmarks
              window.drawLandmarks(ctx, landmarks, {
                color: '#FF0000',
                lineWidth: 1,
                radius: 3
              });
            }
          }
        }
      }
      
      // Update hand count
      setCurrentHandCount(results.multiHandLandmarks ? results.multiHandLandmarks.length : 0);
      
      // Update hand cursors and handle interactions
      updateHandCursors(results);
      
      // If no hands detected, reset any active drawing
      if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        if (state.currentShape) {
          dispatch({ type: 'END_DRAWING' });
        }
        
        // Hide hand cursors when no hands detected
        [0, 1].forEach(index => {
          const cursorDiv = document.getElementById(`hand-cursor-${index}`);
          if (cursorDiv) {
            cursorDiv.style.display = 'none';
          }
        });
        
        // Clear any active hand modes
        activeHandModesRef.current = { 0: 'None', 1: 'None' };
      }
    } catch (error) {
      console.error('Error processing hand tracking results:', error);
      setErrorMessage(`Hand tracking error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Initialize MediaPipe Hands
  const initializeHandTracking = async (): Promise<boolean> => {
    try {
      console.log('Initializing MediaPipe Hands...');
      if (!window.Hands) {
        console.error('MediaPipe Hands not loaded yet');
        setErrorMessage('MediaPipe Hands not loaded. Please wait or refresh the page.');
        return false;
      }
      
      // Initialize MediaPipe Hands with a proper file locator function
      const hands = new window.Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });
      
      // Log that we're configuring the model
      console.log('Configuring MediaPipe Hands model...');
      
      // Configure the model with more lenient parameters
      hands.setOptions({
        maxNumHands: 2,               // Track up to 2 hands
        modelComplexity: 1,           // 0, 1 or 2 (higher = better but slower)
        minDetectionConfidence: 0.3,  // Lower threshold to detect hands more easily
        minTrackingConfidence: 0.3    // Lower threshold to keep tracking even with less confidence
      });
      
      // Set up result handling
      console.log('Setting up MediaPipe results handler...');
      hands.onResults(onResults);
      
      // Store the hands instance for later use
      handsRef.current = hands;
      
      // Create or ensure hand cursors exist
      [0, 1].forEach(index => {
        let cursorDiv = document.getElementById(`hand-cursor-${index}`);
        if (!cursorDiv) {
          cursorDiv = document.createElement('div');
          cursorDiv.id = `hand-cursor-${index}`;
          cursorDiv.className = 'hand-cursor';
          document.body.appendChild(cursorDiv);
        }
      });
      
      console.log('MediaPipe Hands initialized successfully');
      setIsHandTrackingActive(true);
      return true;
    } catch (error) {
      console.error('Error initializing MediaPipe Hands:', error);
      setErrorMessage(`Error initializing hand tracking: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  
  // Start the camera and hand tracking
  const startCamera = async () => {
    if (!localVideoRef.current) {
      console.error('Video element not available for startCamera');
      return false;
    }
    
    try {
      console.log('Starting camera with MediaPipe...');
      
      // Ensure we have a valid video element with a stream
      if (!localVideoRef.current.srcObject) {
        console.error('No video source object set before starting camera');
        return false;
      }
      
      // Initialize MediaPipe camera utilities if available
      if (window.Camera) {
        console.log('Using MediaPipe Camera utilities');
        const camera = new window.Camera(localVideoRef.current, {
          onFrame: async () => {
            if (handsRef.current && localVideoRef.current) {
              try {
                await handsRef.current.send({image: localVideoRef.current});
              } catch (e) {
                console.error('Error sending frame to MediaPipe:', e);
              }
            }
          },
          width: 640,
          height: 480
        });
        
        console.log('Starting MediaPipe camera');
        await camera.start();
        console.log('Camera started with MediaPipe camera utils');
        return true;
      } else {
        console.log('MediaPipe camera utils not available, using manual processing');
        
        // If MediaPipe camera utils aren't available, manually process frames
        const processFrame = async () => {
          if (!isHandTrackingActive || !handsRef.current || !localVideoRef.current) {
            console.log('Stopping manual frame processing');
            return;
          }
          
          try {
            // Check if video is playing and has dimensions before sending frame
            if (localVideoRef.current.readyState >= 2 && 
                localVideoRef.current.videoWidth > 0 && 
                localVideoRef.current.videoHeight > 0) {
              await handsRef.current.send({image: localVideoRef.current});
            } else {
              console.log('Video not ready yet:', localVideoRef.current.readyState);
            }
          } catch (e) {
            console.error('Error in manual frame processing:', e);
          }
          
          // Continue processing frames
          requestAnimationFrame(processFrame);
        };
        
        console.log('Starting manual frame processing');
        requestAnimationFrame(processFrame);
        return true;
      }
    } catch (error) {
      console.error('Error starting camera:', error);
      setErrorMessage(`Failed to start camera: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };
  
  // Handle drawing based on hand mode
  const handleHandMode = (mode: HandMode, handIndex: number, transformedPoint: Point) => {
    // Drawing settings
    const drawingColor = handIndex === 0 ? '#4285F4' : '#DB4437'; // Blue for first hand, red for second
    const drawingThickness = 3;
    
    if (mode === "Drawing") {
      // If we don't have a current shape, start drawing
      if (!state.currentShape) {
        // Switch to pencil tool if not already
        if (state.tool !== 'pencil') {
          dispatch({ type: 'SET_TOOL', payload: 'pencil' });
        }
        
        // Start drawing from previous point
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
            strokeColor: drawingColor,
            strokeWidth: drawingThickness
          }
        });
        
        // Continue to current point
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
    }
    else if (mode === "Clicking") {
      // End any active drawing first
      if (state.currentShape) {
        dispatch({ type: 'END_DRAWING' });
      }

      // Switch to eraser tool
      if (state.tool !== 'eraser') {
        dispatch({ type: 'SET_TOOL', payload: 'pencil' }); // Use pencil with eraser style
        
        // Set a wider stroke for eraser
        dispatch({
          type: 'SET_STYLE',
          payload: { strokeWidth: drawingThickness * 3 }
        });
      }
      
      // Start erasing from previous point
      dispatch({
        type: 'START_DRAWING',
        payload: { 
          point: transformedPoint,
          type: 'pencil'
        }
      });
      
      // Continue to current point
      dispatch({
        type: 'CONTINUE_DRAWING', 
        payload: transformedPoint
      });
      
      // End the erasing stroke immediately to make it apply
      dispatch({ type: 'END_DRAWING' });
      
      // Store the current point
      prevHandPositions.current[handIndex] = transformedPoint;
    }
    else {
      // Any other hand position - stop drawing
      if (state.currentShape) {
        dispatch({ type: 'END_DRAWING' });
      }
    }
  };
  
  // Toggle webcam sharing on/off
  const toggleWebcamSharing = async () => {
    try {
      if (!isWebcamShared) {
        setIsLoading(true);
        setErrorMessage(null);
        
        if (webSocketContext) {
          // Get webcam directly - with a lot of debugging
          if (!navigator.mediaDevices) {
            throw new Error('Media devices not supported in this browser');
          }
          
          console.log('Requesting webcam access with specific constraints...');
          
          // Try different approaches to get the webcam stream
          let stream;
          try {
            // First attempt with ideal values
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
              },
              audio: false
            });
          } catch (err) {
            console.error('First attempt failed:', err);
            
            try {
              // Second attempt with just basic video: true
              console.log('Trying fallback approach...');
              stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
              });
            } catch (err2) {
              console.error('Second attempt failed too:', err2);
              throw new Error('Could not access webcam after multiple attempts');
            }
          }
          
          console.log('Webcam access granted, tracks:', stream.getVideoTracks().length);
          console.log('Video track settings:', stream.getVideoTracks()[0]?.getSettings());
          
          // Show in our local preview - make sure video appears before doing anything else
          if (localVideoRef.current) {
            console.log('Setting video source object...');
            localVideoRef.current.srcObject = stream;
            
            // Force the video to play
            try {
              // Wait for the video to be ready to play
              await new Promise<void>((resolve) => {
                if (localVideoRef.current) {
                  localVideoRef.current.onloadedmetadata = () => {
                    console.log('Video metadata loaded, ready to play');
                    resolve();
                  };
                  // Add a timeout just in case
                  setTimeout(resolve, 1000);
                } else {
                  resolve();
                }
              });
              
              const playPromise = localVideoRef.current.play();
              if (playPromise !== undefined) {
                playPromise.then(() => {
                  console.log("Local video playing successfully");
                }).catch(err => {
                  console.error('Error playing video:', err);
                });
              }
              
              // Additional debugging to check if video is actually playing
              setTimeout(() => {
                if (localVideoRef.current) {
                  console.log('Video element current state:', {
                    readyState: localVideoRef.current.readyState,
                    videoWidth: localVideoRef.current.videoWidth,
                    videoHeight: localVideoRef.current.videoHeight,
                    paused: localVideoRef.current.paused
                  });
                }
              }, 1000);
              
            } catch (err) {
              console.error('Error playing video:', err);
            }
          } else {
            console.error('Video element ref is null');
          }
          
          // Set the stream directly to make sure it's available
          setLocalStream(stream);
          
          // First set webcam as shared so the UI updates
          setIsWebcamShared(true);
          
          // Wait briefly for video to initialize before starting MediaPipe
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Store the stream in the WebSocket context for sharing with collaborators
          webSocketContext.setSharedWebcamStream(stream);
          
          // Then start the WebRTC sharing through WebSocket context (pass the stream)
          await webSocketContext.startWebcamSharing(stream);
          
          // Initialize MediaPipe Hands after the video is visible
          const success = await initializeHandTracking();
          if (success) {
            // Start the camera and processing
            await startCamera();
            console.log("Hand tracking started successfully");
          }
        }
        setIsLoading(false);
      } else {
        // Stop webcam sharing
        if (webSocketContext) {
          // Tell the WebSocket context to stop sharing but KEEP stream alive
          // This way we keep using the stream for hand tracking locally
          webSocketContext.stopWebcamSharing(true);
          
          setIsWebcamShared(false);
          setIsHandTrackingActive(false);
          
          // Stop MediaPipe
          if (handsRef.current) {
            try {
              handsRef.current.close();
              handsRef.current = null;
            } catch (e) {
              console.error('Error closing MediaPipe Hands:', e);
            }
          }
          
          // Clear local preview
          if (localVideoRef.current) {
            const stream = localVideoRef.current.srcObject as MediaStream | null;
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            localVideoRef.current.srcObject = null;
          }
          
          // Now fully stop the stream in the WebSocket context
          webSocketContext.setSharedWebcamStream(null);
          
          // Hide hand cursors
          [0, 1].forEach(index => {
            const cursorDiv = document.getElementById(`hand-cursor-${index}`);
            if (cursorDiv) {
              cursorDiv.style.display = 'none';
            }
          });
        }
      }
    } catch (error) {
      console.error('Error toggling webcam:', error);
      setErrorMessage(`Failed to access webcam: ${error instanceof Error ? error.message : String(error)}`);
      setIsLoading(false);
    }
  };
  
  // Load MediaPipe script when component mounts
  useEffect(() => {
    console.log('Component mounted, MediaPipe libraries should be loaded via HTML');
    
    // Clean up on unmount
    return () => {
      // Stop any active tracking
      if (handsRef.current) {
        try {
          handsRef.current.close();
        } catch (e) {
          console.error('Error closing MediaPipe on unmount:', e);
        }
      }
      
      // Stop video stream
      if (localVideoRef.current) {
        const stream = localVideoRef.current.srcObject as MediaStream | null;
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      }
    };
  }, []);
  
  // Use this for the local video preview so it's properly visible
  return (
    <div 
      className="simple-webcam-container" 
      style={{
        position: 'absolute',
        top: '20px',  // Change from bottom to top
        right: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      {/* Webcam toggle button - moved to top */}
      {/* <button
        onClick={toggleWebcamSharing}
        style={{
          backgroundColor: isWebcamShared ? '#4caf50' : '#2196f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          fontSize: '14px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '10px', // Add margin to separate from video
        }}
        disabled={isLoading}
      >
        {isLoading ? 'Loading...' : (isWebcamShared ? 'Stop Sharing Webcam' : 'Share Webcam')}
      </button> */}

      {/* Local preview (only visible when sharing) */}
      {isWebcamShared && (
        <div 
          className="webcam-preview"
          style={{
            borderRadius: '8px',
            overflow: 'hidden',
            border: '2px solid rgba(0, 120, 255, 0.8)',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
            backgroundColor: '#000',
            width: '320px',
            height: '240px',
            position: 'relative',
          }}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              transform: 'scaleX(-1)', // Mirror the video
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              backgroundColor: '#000',
            }}
          />
          <div 
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              padding: '2px 5px',
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            Your camera {isHandTrackingActive ? '(Hand tracking active)' : '(Preview only)'}
          </div>
        </div>
      )}
      
      {/* Canvas for hand tracking visualization */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          width: '320px',
          height: '240px',
          top: '50px', // Position below button instead of at bottom
          right: '20px',
          zIndex: 999,
          opacity: isHandTrackingActive ? 0.7 : 0,
          pointerEvents: 'none',
        }}
      />
      
      {/* Error display */}
      {errorMessage && (
        <div 
          style={{
            marginTop: '8px',
            color: 'red',
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            maxWidth: '320px',
            textAlign: 'center',
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
};

export default SimpleWebcam; 
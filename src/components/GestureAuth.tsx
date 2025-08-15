import React, { useEffect, useState, useRef } from 'react';
import { Camera } from '@mediapipe/camera_utils';
import { Hands, Results, HAND_CONNECTIONS } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { determineHandMode } from '../utils/handTracking';

interface GestureAuthProps {
  onSuccess: () => void;
  onFailure: () => void;
}

const GestureAuth: React.FC<GestureAuthProps> = ({ onSuccess, onFailure }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediapipeRef = useRef<Hands | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const [currentGesture, setCurrentGesture] = useState<string>('');
  const [targetGestures, setTargetGestures] = useState<string[]>([]);
  const [currentGestureIndex, setCurrentGestureIndex] = useState(0);
  const currentGestureIndexRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const isCompletedRef = useRef(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDebouncing, setIsDebouncing] = useState(false);
  
  // Add debounce mechanism to prevent same gesture detection
  const lastGestureTimeRef = useRef<number>(0);
  const lastDetectedGestureRef = useRef<string>('');
  const GESTURE_DEBOUNCE_MS = 300; // Reduced from 1000ms to 300ms for faster response

  // Available gestures for the challenge
  const availableGestures = ['Drawing', 'Clicking', 'Clearing'];

  // Function to get detailed instructions for each gesture
  const getGestureInstructions = (gesture: string) => {
    switch (gesture) {
      case 'Drawing':
        return {
          emoji: '☝️',
          instruction: 'Index finger pointing up, all other fingers closed',
          description: 'Point your index finger up with other fingers closed'
        };
      case 'Clearing':
        return {
          emoji: '🤙',
          instruction: 'Thumb and pinky extended - palm facing camera',
          description: 'Extend your thumb and pinky, keep other fingers closed, palm facing camera'
        };
      case 'Clicking':
        return {
          emoji: '✊',
          instruction: 'Closed fist - all fingers curled into palm',
          description: 'Make a fist with all fingers closed'
        };
      default:
        return {
          emoji: '🤔',
          instruction: 'Unknown gesture',
          description: 'Unknown gesture type'
        };
    }
  };

  // Generate fixed gestures for the challenge
  const generateTargetGestures = () => {
    // Always use the same three gestures in order: Drawing, Clearing, Clicking
    const selected: string[] = ['Drawing', 'Clearing', 'Clicking'];
    setTargetGestures(selected);
  };

  // Reset gesture recognition state
  const resetGestureAuth = () => {
    setCurrentGestureIndex(0);
    currentGestureIndexRef.current = 0;
    setIsDebouncing(false);
    setIsCompleted(false);
    isCompletedRef.current = false;
    setError(null);
    setIsLoading(true);
  };

  // Cleanup function
  const cleanup = () => {
    const cleanupStartTime = Date.now();
    console.log('Cleaning up gesture auth resources...');
    
    // Prevent multiple cleanup calls
    if (mediapipeRef.current === null && cameraRef.current === null) {
      console.log('Cleanup already completed, skipping...');
      return;
    }
    
    if (cameraRef.current) {
      console.log('Stopping camera...');
      const cameraStartTime = Date.now();
      try {
        cameraRef.current.stop();
        console.log('Camera stop time:', Date.now() - cameraStartTime, 'ms');
      } catch (error) {
        console.error('Error stopping camera:', error);
      }
      cameraRef.current = null;
    }
    
    if (mediapipeRef.current) {
      console.log('Closing MediaPipe...');
      const mediapipeStartTime = Date.now();
      try {
        mediapipeRef.current.close();
        console.log('MediaPipe close time:', Date.now() - mediapipeStartTime, 'ms');
      } catch (error) {
        console.error('Error closing MediaPipe:', error);
      }
      mediapipeRef.current = null;
    }
    
    if (videoRef.current?.srcObject) {
      console.log('Stopping video tracks...');
      const videoStartTime = Date.now();
      try {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          console.log('Stopping track:', track.kind);
          track.stop();
        });
        videoRef.current.srcObject = null;
        console.log('Video tracks stop time:', Date.now() - videoStartTime, 'ms');
      } catch (error) {
        console.error('Error stopping video tracks:', error);
      }
    }
    
    console.log('Total cleanup time:', Date.now() - cleanupStartTime, 'ms');
  };

  useEffect(() => {
    generateTargetGestures();
  }, []);

  // Preload MediaPipe model in background
  useEffect(() => {
    let preloadHands: Hands | null = null;
    
    const preloadMediaPipe = async () => {
      try {
        console.log('Preloading MediaPipe model...');
        preloadHands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        preloadHands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.3,
          minTrackingConfidence: 0.3
        });

        // Just initialize the model, don't start processing
        console.log('MediaPipe model preloaded successfully');
      } catch (error) {
        console.error('Error preloading MediaPipe:', error);
      }
    };

    preloadMediaPipe();

    return () => {
      if (preloadHands) {
        preloadHands.close();
      }
    };
  }, []);

  useEffect(() => {
    let videoStream: MediaStream | null = null;
    let isInitialized = false;

    const initializeHandTracking = async () => {
      try {
        console.log('Starting gesture auth initialization...');
        
        // Initialize MediaPipe Hands with optimized settings for speed
        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        // Optimized settings for faster detection and startup - minimal WebGL usage
        hands.setOptions({
          maxNumHands: 1,                    // Only need 1 hand for auth
          modelComplexity: 0,                // Use light model for faster startup
          minDetectionConfidence: 0.3,       // Lower threshold for faster detection
          minTrackingConfidence: 0.3         // Lower threshold for faster tracking
        });

        // Set up the camera with minimal resolution for fastest processing
        if (videoRef.current) {
          console.log('Getting camera stream...');
          videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: 320,                    // Minimal resolution for fastest processing
              height: 240,                   // Minimal resolution for fastest processing
              facingMode: 'user'
            }
          });

          videoRef.current.srcObject = videoStream;
          console.log('Camera stream set, waiting for video to load...');

          // Wait for video to be ready
          await new Promise((resolve) => {
            if (videoRef.current) {
              videoRef.current.onloadedmetadata = () => {
                console.log('Video metadata loaded');
                resolve(true);
              };
            }
          });

          console.log('Setting up MediaPipe camera...');
          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              // Aggressive guard - return immediately if completed
              if (isCompletedRef.current) {
                return;
              }
              
              if (videoRef.current && hands && isInitialized && !isCompletedRef.current) {
                try {
                  await hands.send({ image: videoRef.current });
                } catch (error) {
                  // Only log errors occasionally to avoid spam
                  if (Math.random() < 0.01) {
                    console.error('Error sending frame to MediaPipe:', error);
                  }
                }
              }
            },
            width: 320,                      // Match the minimal resolution
            height: 240
          });

          // Start camera immediately after creating it
          console.log('Starting camera...');
          await camera.start();
          console.log('Camera started successfully');

          // Show warming up state while MediaPipe initializes
          setIsWarmingUp(true);
          setIsLoading(false);

          console.log('Setting up MediaPipe results handler...');
          hands.onResults(onHandResults);
          mediapipeRef.current = hands;
          cameraRef.current = camera;
          
          // Start MediaPipe processing immediately
          console.log('Starting MediaPipe processing...');
          isInitialized = true;
          setIsWarmingUp(false);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error in gesture auth initialization:', error);
        setError(`Error initializing hand tracking: ${error instanceof Error ? error.message : String(error)}`);
        setIsLoading(false);
      }
    };

    const onHandResults = (results: Results) => {
      // Guard against processing after completion - check this FIRST
      if (isCompletedRef.current) {
        return;
      }
      
      // Guard against processing after cleanup
      if (mediapipeRef.current === null) {
        return;
      }
      
      if (!canvasRef.current) return;

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Clear the canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      // Only draw hand landmarks if not completed
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0 && !isCompletedRef.current) {
        const landmarks = results.multiHandLandmarks[0];

        // Draw hand landmarks
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1 });

        // Only process gesture detection if not completed
        if (!isCompletedRef.current) {
          // Determine current gesture
          const { mode } = determineHandMode(landmarks);
          setCurrentGesture(mode);

          // Optimized gesture matching with shorter debounce
          const now = Date.now();
          const isSameGesture = mode === lastDetectedGestureRef.current;
          const isWithinDebounceTime = now - lastGestureTimeRef.current < GESTURE_DEBOUNCE_MS;
          
          // Only log occasionally to reduce console spam
          if (Math.random() < 0.1) { // Log only 10% of the time
            console.log(`Gesture check: ${mode} vs target: ${targetGestures[currentGestureIndexRef.current]}`);
          }
          
          if (mode === targetGestures[currentGestureIndexRef.current] && 
              !isWithinDebounceTime) {
            
            console.log('Gesture matched:', mode); // Debug log
            setIsDebouncing(false);
            
            // Update last detected gesture and time
            lastDetectedGestureRef.current = mode;
            lastGestureTimeRef.current = now;
            
            // Move to next gesture or complete
            if (currentGestureIndexRef.current < targetGestures.length - 1) {
              console.log('Moving to next gesture'); // Debug log
              currentGestureIndexRef.current += 1;
              setCurrentGestureIndex(currentGestureIndexRef.current);
            } else {
              console.log('All gestures completed'); // Debug log
              const startTime = Date.now();
              console.log('=== GESTURE COMPLETION TIMELINE ===');
              console.log('0ms: Gesture completion detected');
              
              isCompletedRef.current = true;
              console.log('1ms: isCompletedRef set to true');
              
              setIsCompleted(true);
              console.log('2ms: setIsCompleted called');
              
              // Force stop camera immediately
              if (cameraRef.current) {
                console.log('3ms: Starting camera stop...');
                try {
                  cameraRef.current.stop();
                  console.log('4ms: camera.stop() called');
                  cameraRef.current = null;
                  console.log('5ms: cameraRef set to null');
                } catch (error) {
                  console.error('Error force stopping camera:', error);
                }
              }
              
              // Call onSuccess immediately - let React handle the unmounting
              console.log('6ms: Calling onSuccess...');
              onSuccess();
              console.log('7ms: onSuccess called');
              console.log('=== END TIMELINE ===');
            }
          } else if (mode === targetGestures[currentGestureIndexRef.current] && isSameGesture && isWithinDebounceTime) {
            console.log('Gesture matched but debounced - waiting for new gesture or timeout');
            setIsDebouncing(true);
          } else {
            setIsDebouncing(false);
          }
        }
      }
    };

    initializeHandTracking();

    return () => {
      console.log('Gesture auth cleanup triggered');
      isInitialized = false;
      isCompletedRef.current = false;
      cleanup();
    };
  }, [targetGestures, onSuccess, isCompleted]);

  if (isLoading) {
    return (
      <div className="text-center space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
        <div className="text-sm text-gray-600">Initializing hand tracking...</div>
      </div>
    );
  }

  if (isWarmingUp) {
    return (
      <div className="flex flex-col items-center space-y-1">
        <div className="relative w-56 h-42" style={{ width: '224px', height: '168px' }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover rounded-lg shadow-lg"
            autoPlay
            playsInline
            muted
            width="320"
            height="240"
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <div className="text-center space-y-2">
          <div className="animate-pulse text-sm text-purple-600">Warming up hand tracking...</div>
          <div className="text-xs text-gray-500">Camera is ready, initializing AI model</div>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 text-center">{error}</div>;
  }

  if (isCompleted) {
    return null;
  }

  return (
    <div className="flex flex-col items-center space-y-1">
      <div className="relative w-56 h-42" style={{ width: '224px', height: '168px' }}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover rounded-lg shadow-lg"
          autoPlay
          playsInline
          muted
          width="640"
          height="480"
          style={{ width: '100%', height: '100%' }}
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          width={640}
          height={480}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
      
      <div className="text-center space-y-1">
        <div className="flex justify-center space-x-1">
          {targetGestures.map((gesture, index) => (
            <div
              key={index}
              className={`px-3 py-1.5 rounded text-sm ${
                index === currentGestureIndex
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200'
              }`}
            >
              {gesture}
            </div>
          ))}
        </div>
        
        {/* Current gesture instructions */}
        {targetGestures[currentGestureIndex] && (
          <div className="mt-1 p-1 bg-purple-50 rounded border border-purple-200">
            <div className="flex items-center justify-center gap-1">
              <span className="text-lg">{getGestureInstructions(targetGestures[currentGestureIndex]).emoji}</span>
              <span className="text-base text-purple-800">
                {getGestureInstructions(targetGestures[currentGestureIndex]).instruction}
              </span>
            </div>
          </div>
        )}
        
        <p className="text-xs text-gray-600">
          {currentGesture}
          {isDebouncing && (
            <span className="ml-2 text-orange-600">
              (waiting...)
            </span>
          )}
        </p>
      </div>
    </div>
  );
};

export default GestureAuth; 
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isDebouncing, setIsDebouncing] = useState(false);
  
  // Add debounce mechanism to prevent same gesture detection
  const lastGestureTimeRef = useRef<number>(0);
  const lastDetectedGestureRef = useRef<string>('');
  const GESTURE_DEBOUNCE_MS = 1000; // 1 second debounce

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
  const resetGestureState = () => {
    setCurrentGestureIndex(0);
    setCurrentGesture('');
    setIsDebouncing(false);
    lastGestureTimeRef.current = 0;
    lastDetectedGestureRef.current = '';
    setIsCompleted(false);
    generateTargetGestures();
  };

  // Cleanup function
  const cleanup = () => {
    console.log('Cleaning up gesture auth resources...');
    if (cameraRef.current) {
      console.log('Stopping camera...');
      cameraRef.current.stop();
    }
    if (mediapipeRef.current) {
      console.log('Closing MediaPipe...');
      mediapipeRef.current.close();
    }
    if (videoRef.current?.srcObject) {
      console.log('Stopping video tracks...');
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        console.log('Stopping track:', track.kind);
        track.stop();
      });
    }
  };

  useEffect(() => {
    generateTargetGestures();
  }, []);

  useEffect(() => {
    let videoStream: MediaStream | null = null;

    const initializeHandTracking = async () => {
      try {
        // Initialize MediaPipe Hands
        const hands = new Hands({
          locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
          }
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        // Set up the camera
        if (videoRef.current) {
          videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: 640,
              height: 480,
              facingMode: 'user'
            }
          });

          videoRef.current.srcObject = videoStream;

          const camera = new Camera(videoRef.current, {
            onFrame: async () => {
              if (videoRef.current && hands) {
                await hands.send({ image: videoRef.current });
              }
            },
            width: 640,
            height: 480
          });

          hands.onResults(onHandResults);
          mediapipeRef.current = hands;
          cameraRef.current = camera;
          camera.start();
        }

        setIsLoading(false);
      } catch (error) {
        setError(`Error initializing hand tracking: ${error instanceof Error ? error.message : String(error)}`);
        setIsLoading(false);
      }
    };

    const onHandResults = (results: Results) => {
      if (!canvasRef.current) return;

      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;

      // Clear the canvas
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      // If we have hands
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Draw hand landmarks
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
        drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1 });

        // Determine current gesture
        const { mode } = determineHandMode(landmarks);
        setCurrentGesture(mode);

        // Check if the current gesture matches the target with debouncing
        const now = Date.now();
        const isSameGesture = mode === lastDetectedGestureRef.current;
        const isWithinDebounceTime = now - lastGestureTimeRef.current < GESTURE_DEBOUNCE_MS;
        
        console.log(`Gesture check: ${mode} vs target: ${targetGestures[currentGestureIndex]}`);
        console.log(`Same gesture: ${isSameGesture}, Within debounce: ${isWithinDebounceTime}`);
        
        if (mode === targetGestures[currentGestureIndex] && 
            (!isSameGesture || !isWithinDebounceTime)) {
          
          console.log('Gesture matched:', mode); // Debug log
          setIsDebouncing(false);
          
          // Update last detected gesture and time
          lastDetectedGestureRef.current = mode;
          lastGestureTimeRef.current = now;
          
          // Move to next gesture or complete
          if (currentGestureIndex < targetGestures.length - 1) {
            console.log('Moving to next gesture'); // Debug log
            setCurrentGestureIndex(prev => prev + 1);
          } else {
            console.log('All gestures completed'); // Debug log
            setIsCompleted(true);
            // Call onSuccess first to trigger state changes
            onSuccess();
            
            // Then cleanup after a small delay to ensure state changes are processed
            setTimeout(() => {
              cleanup();
            }, 100);
          }
        } else if (mode === targetGestures[currentGestureIndex] && isSameGesture && isWithinDebounceTime) {
          console.log('Gesture matched but debounced - waiting for new gesture or timeout');
          setIsDebouncing(true);
        } else {
          setIsDebouncing(false);
        }
      }
    };

    initializeHandTracking();

    return () => {
      if (!isCompleted) {
        cleanup();
      }
    };
  }, [targetGestures, currentGestureIndex, onSuccess, isCompleted]);

  if (isLoading) {
    return <div className="text-center">Loading gesture recognition...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center">{error}</div>;
  }

  if (isCompleted) {
    return null;
  }

  return (
    <div className="flex flex-col items-center space-y-1">
      <div className="relative">
        <video
          ref={videoRef}
          className="w-56 h-42 object-cover rounded-lg shadow-lg"
          autoPlay
          playsInline
          muted
          width="640"
          height="480"
        />
        <canvas
          ref={canvasRef}
          className="absolute top-0 left-0 w-full h-full pointer-events-none"
          width={640}
          height="480"
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
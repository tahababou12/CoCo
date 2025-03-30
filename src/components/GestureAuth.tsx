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

  // Available gestures for the challenge
  const availableGestures = ['Drawing', 'Erasing', 'Clear All'];

  // Generate random gestures for the challenge
  const generateTargetGestures = () => {
    const gestures = [...availableGestures];
    const selected: string[] = [];
    for (let i = 0; i < 3; i++) {
      const randomIndex = Math.floor(Math.random() * gestures.length);
      selected.push(gestures[randomIndex]);
    }
    setTargetGestures(selected);
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
        const mode = determineHandMode(landmarks);
        setCurrentGesture(mode);

        // Check if the current gesture matches the target
        if (mode === targetGestures[currentGestureIndex]) {
          // Move to next gesture or complete
          if (currentGestureIndex < targetGestures.length - 1) {
            setCurrentGestureIndex(prev => prev + 1);
          } else {
            onSuccess();
          }
        }
      }
    };

    initializeHandTracking();

    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
      if (mediapipeRef.current) {
        mediapipeRef.current.close();
      }
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [targetGestures, currentGestureIndex, onSuccess]);

  if (isLoading) {
    return <div className="text-center">Loading gesture recognition...</div>;
  }

  if (error) {
    return <div className="text-red-500 text-center">{error}</div>;
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="relative">
        <video
          ref={videoRef}
          className="w-64 h-48 object-cover rounded-lg shadow-lg"
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
          height={480}
        />
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">Perform these gestures in order:</h3>
        <div className="flex space-x-2">
          {targetGestures.map((gesture, index) => (
            <div
              key={index}
              className={`px-3 py-1 rounded ${
                index === currentGestureIndex
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-200'
              }`}
            >
              {gesture}
            </div>
          ))}
        </div>
        <p className="text-sm text-gray-600">
          Current gesture: {currentGesture}
        </p>
      </div>
    </div>
  );
};

export default GestureAuth; 
import React, { useState, useEffect, useRef } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { useShapes } from '../ShapesContext';
import { Mic, MicOff, Send, Volume2, X, Minimize2, Maximize2, MessageCircle } from 'lucide-react';
import { renderShape } from '../utils/renderShape';

interface MultimodalAIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  audioUrl?: string;
}

const MultimodalAIAssistant: React.FC<MultimodalAIAssistantProps> = ({ isOpen, onClose }) => {
  const { state } = useDrawing();
  const { canvasRef } = useShapes();
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Audio and WebSocket refs
  const webSocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const pcmDataRef = useRef<number[]>([]);
  const currentFrameRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Audio playback
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // Initialize WebSocket connection
  useEffect(() => {
    console.log('🚨 MULTIMODAL ASSISTANT USEEFFECT TRIGGERED!');
    console.log('🚨 isOpen value:', isOpen);
    
    if (isOpen) {
      console.log('🚨 COMPONENT IS OPEN - STARTING EVERYTHING!');
      connectWebSocket();
      initializeAudioContext();
      const cleanupCanvasCapture = startCanvasCapture();
      
      return () => {
        console.log('🚨 COMPONENT UNMOUNTING - CLEANING UP!');
        disconnectWebSocket();
        if (cleanupCanvasCapture) {
          cleanupCanvasCapture();
        }
      };
    } else {
      console.log('🚨 COMPONENT IS CLOSED - DISCONNECTING!');
      disconnectWebSocket();
    }

    return () => {
      console.log('🚨 COMPONENT UNMOUNTING - CLEANING UP!');
      disconnectWebSocket();
    };
  }, [isOpen]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectWebSocket = () => {
    try {
      console.log('Attempting to connect to multimodal server...');
      webSocketRef.current = new WebSocket('ws://localhost:1212');
      
      webSocketRef.current.onopen = () => {
        console.log('✅ Connected to multimodal server');
        setIsConnected(true);
        setError(null);
        sendInitialSetup();
      };

      webSocketRef.current.onmessage = handleWebSocketMessage;
      
      webSocketRef.current.onclose = () => {
        console.log('❌ Disconnected from multimodal server');
        setIsConnected(false);
        setIsRecording(false);
      };

      webSocketRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setError('Failed to connect to AI assistant');
        setIsConnected(false);
      };
    } catch (err) {
      console.error('❌ Failed to connect:', err);
      setError('Failed to connect to AI assistant');
    }
  };

  const disconnectWebSocket = () => {
    if (webSocketRef.current) {
      webSocketRef.current.close();
      webSocketRef.current = null;
    }
    setIsConnected(false);
    setIsRecording(false);
  };

  const sendInitialSetup = () => {
    if (webSocketRef.current?.readyState === WebSocket.OPEN) {
      const setupMessage = {
        setup: {
          generation_config: { response_modalities: ["AUDIO", "TEXT"] },
        },
      };
      webSocketRef.current.send(JSON.stringify(setupMessage));
    }
  };

  const handleWebSocketMessage = (event: MessageEvent) => {
    console.log('🔍 [DEBUG] === WEBSOCKET MESSAGE RECEIVED ===');
    console.log('🔍 [DEBUG] Raw message:', event.data);
    
    try {
      const data = JSON.parse(event.data);
      console.log('🔍 [DEBUG] Parsed message:', data);
      
      if (data.text) {
        console.log('🔍 [DEBUG] Text message received:', data.text);
        // Add text message to chat
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          type: 'assistant',
          content: data.text,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, newMessage]);
        console.log('✅ [DEBUG] Text message added to chat');
      }
      
      if (data.audio) {
        console.log('🔍 [DEBUG] Audio message received, length:', data.audio.length);
        // Queue audio for playback
        audioQueueRef.current.push(data.audio);
        playNextAudio();
        console.log('✅ [DEBUG] Audio queued for playback');
      }
      
      console.log('🔍 [DEBUG] === WEBSOCKET MESSAGE PROCESSED ===');
    } catch (err) {
      console.error('❌ [DEBUG] Error parsing WebSocket message:', err);
      console.error('❌ [DEBUG] Raw message that failed to parse:', event.data);
    }
  };

  const initializeAudioContext = async () => {
    try {
      console.log('🔊 Initializing audio context...');
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ 
        sampleRate: 24000 
      });
      
      // Load PCM processor worklet
      console.log('🔊 Loading PCM processor worklet...');
      await audioContextRef.current.audioWorklet.addModule('/pcm-processor.js');
      console.log('✅ Audio context initialized successfully');
    } catch (err) {
      console.error('❌ Failed to initialize audio context:', err);
      setError('Failed to initialize audio system');
    }
  };

  const startCanvasCapture = () => {
    console.log('🚨 STARTING CANVAS CAPTURE - THIS SHOULD APPEAR!');
    
    const captureAndSend = () => {
      console.log('🚨 CAPTURE CYCLE RUNNING - EVERY SECOND!');
      
      // Simple approach: just get the main canvas directly
      const canvas = document.querySelector('canvas');
      console.log('🚨 Canvas found:', !!canvas);
      
      if (canvas && webSocketRef.current?.readyState === WebSocket.OPEN) {
        console.log('🚨 Canvas and WebSocket ready, taking screenshot...');
        
        // Take screenshot
        const imageData = canvas.toDataURL('image/png', 1.0).split(',')[1];
        
        // Send to Gemini
        const payload = {
          realtime_input: {
            media_chunks: [{
              mime_type: "image/png",
              data: imageData,
            }],
          },
        };
        
        webSocketRef.current.send(JSON.stringify(payload));
        console.log('🚨 SCREENSHOT SENT TO GEMINI, size:', imageData.length);
      } else {
        console.log('🚨 CANNOT CAPTURE - Canvas or WebSocket not ready');
        console.log('🚨 Canvas exists:', !!canvas);
        console.log('🚨 WebSocket ready:', webSocketRef.current?.readyState === WebSocket.OPEN);
      }
    };

    // Send screenshot every 1 second
    const interval = setInterval(captureAndSend, 1000);
    console.log('🚨 INTERVAL SET UP - SHOULD RUN EVERY SECOND!');
    
    // Send first screenshot immediately
    captureAndSend();
    
    return () => {
      console.log('🚨 CLEANING UP CANVAS CAPTURE INTERVAL');
      clearInterval(interval);
    };
  };

  // Manual canvas capture for testing
  const manualCaptureCanvas = () => {
    const canvas = document.querySelector('canvas');
    
    if (canvas && webSocketRef.current?.readyState === WebSocket.OPEN) {
      const imageData = canvas.toDataURL('image/png', 1.0).split(',')[1];
      
      const payload = {
        realtime_input: {
          media_chunks: [{
            mime_type: "image/png",
            data: imageData,
          }],
        },
      };
      
      webSocketRef.current.send(JSON.stringify(payload));
      console.log('📷 Manual screenshot sent to Gemini, size:', imageData.length);
    } else {
      console.log('❌ Manual capture failed - Canvas or WebSocket not ready');
    }
  };

  // Make the debug function globally accessible
  useEffect(() => {
    if (isOpen) {
      // @ts-ignore
      window.testCanvasCapture = manualCaptureCanvas;
      // @ts-ignore
      window.triggerImmediateCanvasCapture = manualCaptureCanvas;
      // @ts-ignore
      window.testCanvasScreenshot = () => {
        const canvas = document.querySelector('canvas');
        if (canvas) {
          const dataUrl = canvas.toDataURL('image/png', 1.0);
          console.log('📷 TEST: Canvas screenshot taken');
          console.log('📷 TEST: Data URL length:', dataUrl.length);
          console.log('📷 TEST: Canvas size:', canvas.width + 'x' + canvas.height);
          
          // Create a preview image to see what was captured
          const img = new Image();
          img.onload = () => {
            console.log('📷 TEST: Preview image loaded, size:', img.width + 'x' + img.height);
            // You can also open this in a new tab to see the actual screenshot
            const newWindow = window.open();
            if (newWindow) {
              newWindow.document.write('<img src="' + dataUrl + '" style="border: 2px solid red;" />');
              newWindow.document.title = 'Canvas Screenshot Test';
            }
          };
          img.src = dataUrl;
        } else {
          console.log('❌ TEST: No canvas found');
        }
      };
      console.log('🔧 Test function available: window.testCanvasCapture()');
      console.log('🔧 Canvas capture function available: window.triggerImmediateCanvasCapture()');
      console.log('🔧 Screenshot test function available: window.testCanvasScreenshot()');
    }
    
    return () => {
      // @ts-ignore
      delete window.testCanvasCapture;
      // @ts-ignore
      delete window.triggerImmediateCanvasCapture;
      // @ts-ignore
      delete window.testCanvasScreenshot;
    };
  }, [isOpen]);

  const startRecording = async () => {
    console.log('🎤 Starting recording...');
    if (!isConnected || !audioContextRef.current) {
      console.log('❌ Cannot start recording - not connected or no audio context');
      setError('Not connected to AI assistant');
      return;
    }

    try {
      console.log('🎤 Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('✅ Microphone access granted');
      mediaRecorderRef.current = new MediaRecorder(stream);
      pcmDataRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          // Convert audio data to PCM
          const reader = new FileReader();
          reader.onload = () => {
            const arrayBuffer = reader.result as ArrayBuffer;
            const pcmData = new Int16Array(arrayBuffer);
            pcmDataRef.current.push(...Array.from(pcmData));
          };
          reader.readAsArrayBuffer(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        console.log('🎤 Recording stopped, sending voice message...');
        sendVoiceMessage();
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start(100); // Collect data every 100ms
      setIsRecording(true);
      setError(null);
      console.log('✅ Recording started successfully');
    } catch (err) {
      console.error('❌ Failed to start recording:', err);
      setError('Failed to access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendVoiceMessage = () => {
    console.log('📤 Sending voice message...');
    if (!webSocketRef.current || !currentFrameRef.current) {
      console.log('❌ Cannot send voice message - no WebSocket or canvas frame');
      return;
    }

    // Convert PCM data to base64
    const buffer = new ArrayBuffer(pcmDataRef.current.length * 2);
    const view = new DataView(buffer);
    pcmDataRef.current.forEach((value, index) => {
      view.setInt16(index * 2, value, true);
    });

    const base64Audio = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));

    const payload = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: "audio/pcm",
            data: base64Audio,
          },
          {
            mime_type: "image/jpeg",
            data: currentFrameRef.current,
          },
        ],
      },
    };

    console.log('📤 Sending payload to WebSocket:', {
      audioSize: base64Audio.length,
      imageSize: currentFrameRef.current.length,
      totalPayloadSize: JSON.stringify(payload).length
    });

    webSocketRef.current.send(JSON.stringify(payload));
    pcmDataRef.current = [];
    console.log('✅ Voice message sent successfully');
  };

  const playNextAudio = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setIsPlayingAudio(true);

    try {
      const base64Audio = audioQueueRef.current.shift()!;
      const audioData = atob(base64Audio);
      const arrayBuffer = new ArrayBuffer(audioData.length);
      const view = new Uint8Array(arrayBuffer);
      
      for (let i = 0; i < audioData.length; i++) {
        view[i] = audioData.charCodeAt(i);
      }

      // Convert to Float32Array for audio playback
      const pcmData = new Int16Array(arrayBuffer);
      const float32Data = new Float32Array(pcmData.length);
      
      for (let i = 0; i < pcmData.length; i++) {
        float32Data[i] = pcmData[i] / 32768;
      }

      // Play audio using AudioContext
      if (audioContextRef.current) {
        const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);
        
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        
        source.onended = () => {
          isPlayingRef.current = false;
          setIsPlayingAudio(false);
          playNextAudio(); // Play next audio in queue
        };
        
        source.start();
      }
    } catch (err) {
      console.error('Error playing audio:', err);
      isPlayingRef.current = false;
      setIsPlayingAudio(false);
      playNextAudio(); // Try next audio
    }
  };

  const sendTextMessage = () => {
    if (!currentMessage.trim() || !webSocketRef.current) return;

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: currentMessage,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, newMessage]);
    setCurrentMessage('');

    // Send text message to Gemini
    const payload = {
      realtime_input: {
        media_chunks: [
          {
            mime_type: "text/plain",
            data: btoa(currentMessage),
          },
          {
            mime_type: "image/jpeg",
            data: currentFrameRef.current || '',
          },
        ],
      },
    };

    webSocketRef.current.send(JSON.stringify(payload));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  if (!isOpen) return null;

  console.log('🎨 Rendering MultimodalAIAssistant, isConnected:', isConnected, 'isRecording:', isRecording);

  return (
    <div className="fixed top-4 right-4 z-50">
      {/* Debug info - remove this later */}
      <div className="absolute -bottom-8 left-0 bg-black text-white text-xs px-2 py-1 rounded">
        Connected: {isConnected ? 'Yes' : 'No'} | Recording: {isRecording ? 'Yes' : 'No'}
      </div>
      
      {/* Minimized state - just a small button */}
      {isMinimized ? (
        <button
          onClick={() => setIsMinimized(false)}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-colors duration-200"
          title="Open AI Assistant"
        >
          <MessageCircle size={20} />
        </button>
      ) : (
        /* Expanded state - full chat interface */
        <div className="bg-white rounded-xl shadow-2xl w-80 h-96 flex flex-col border border-gray-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-xl">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <h3 className="font-semibold">AI Drawing Assistant</h3>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="text-white hover:text-gray-200 p-1"
                title="Minimize"
              >
                <Minimize2 size={16} />
              </button>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-200 p-1"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm mt-8">
                <p className="font-medium">Start a conversation!</p>
                <p className="text-xs mt-1">Draw something and ask questions</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                      message.type === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-800 border border-gray-200'
                    }`}
                  >
                    <p>{message.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t p-3 bg-white rounded-b-xl">
            <div className="flex items-center space-x-2">
              {/* Voice Recording Button */}
              <button
                onClick={() => {
                  console.log('🎤 Mic button clicked!');
                  console.log('🎤 Current state - isConnected:', isConnected, 'isRecording:', isRecording);
                  console.log('🎤 Audio context:', audioContextRef.current);
                  console.log('🎤 WebSocket:', webSocketRef.current?.readyState);
                  
                  if (isRecording) {
                    console.log('🎤 Stopping recording...');
                    stopRecording();
                  } else {
                    console.log('🎤 Starting recording...');
                    startRecording();
                  }
                }}
                disabled={!isConnected}
                className={`relative p-2 rounded-full transition-colors ${
                  isRecording
                    ? 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } ${!isConnected && 'opacity-50 cursor-not-allowed'}`}
                title={isRecording ? 'Stop Recording' : 'Start Recording'}
              >
                {/* Recording status indicator */}
                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                  isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'
                }`}></div>
                
                {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
              </button>

              {/* Manual Capture Button for Testing */}
              <button
                onClick={manualCaptureCanvas}
                disabled={!isConnected}
                className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Manual Canvas Capture"
              >
                📷
              </button>

              {/* Audio Playback Indicator */}
              {isPlayingAudio && (
                <div className="flex items-center text-blue-600">
                  <Volume2 size={14} className="animate-pulse" />
                </div>
              )}

              {/* Text Input */}
              <div className="flex-1">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type a message..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  disabled={!isConnected}
                />
              </div>

              {/* Send Button */}
              <button
                onClick={sendTextMessage}
                disabled={!currentMessage.trim() || !isConnected}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send Message"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MultimodalAIAssistant; 
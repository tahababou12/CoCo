import React, { useState, useEffect, useRef } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { useShapes } from '../ShapesContext';
import { Mic, MicOff, Send, Volume2, X, Minimize2, Maximize2, MessageCircle, Sparkles, Wand2 } from 'lucide-react';
import { renderShape } from '../utils/renderShape';
import html2canvas from 'html2canvas';

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
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening'>('idle');

  // Speech Recognition for voice commands
  const [isListeningForCommands, setIsListeningForCommands] = useState(false);
  const [recognizedText, setRecognizedText] = useState('');
  const speechRecognitionRef = useRef<SpeechRecognition | null>(null);
  const [enhancementStatus, setEnhancementStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  // Voice command patterns for enhancement
  const enhanceCommands = [
    /enhance\s+(?:this\s+)?(?:drawing|image|sketch|picture)\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)/i,
    /enhance\s+(?:with\s+)?(?:gemini|ai|artificial intelligence)/i,
    /(?:gemini|ai|artificial intelligence)\s+enhance\s+(?:this\s+)?(?:drawing|image|sketch|picture)/i,
    /enhance\s+(?:drawing|image|sketch|picture)/i,
    /enhance\s+(?:this\s+)?(?:drawing|image|sketch|picture)/i,
    /enhance\s+(?:with\s+)?(?:more\s+)?(?:detail|artistic|style)/i
  ];

  const isEnhanceCommand = (text: string): boolean => {
    return enhanceCommands.some(pattern => pattern.test(text));
  };

  const callEnhancementAPI = async (prompt: string = '') => {
    try {
      setEnhancementStatus('processing');
      
      const response = await fetch('http://localhost:5001/api/enhance-image-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Enhancement started:', result);
        
        // Add success message to chat
        const successMessage: ChatMessage = {
          id: Date.now().toString(),
          type: 'assistant',
          content: `🎨 Enhancement started! I'm processing your drawing with Gemini AI. This may take a few moments...`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, successMessage]);
        
        setEnhancementStatus('success');
        
        // Poll for completion status
        if (result.requestId) {
          pollEnhancementStatus(result.requestId);
        }
        
        return result;
      } else {
        const errorData = await response.json();
        console.error('❌ Enhancement failed:', errorData);
        
        const errorMessage: ChatMessage = {
          id: Date.now().toString(),
          type: 'assistant',
          content: `❌ Sorry, I couldn't start the enhancement. Please try again.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        
        setEnhancementStatus('error');
        return null;
      }
    } catch (error) {
      console.error('❌ Error calling enhancement API:', error);
      
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'assistant',
        content: `❌ Sorry, there was an error starting the enhancement. Please try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      
      setEnhancementStatus('error');
      return null;
    }
  };

  const pollEnhancementStatus = async (requestId: string) => {
    try {
      const response = await fetch(`http://localhost:5001/api/enhancement-status/${requestId}`);
      if (response.ok) {
        const status = await response.json();
        
        if (status.status === 'complete') {
          const successMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'assistant',
            content: `🎉 Enhancement complete! Your drawing has been enhanced with Gemini AI. Check the enhanced images section!`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, successMessage]);
          setEnhancementStatus('success');
        } else if (status.status === 'error') {
          const errorMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'assistant',
            content: `❌ Enhancement failed: ${status.message || 'Unknown error'}`,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, errorMessage]);
          setEnhancementStatus('error');
        } else if (status.status === 'processing') {
          // Continue polling
          setTimeout(() => pollEnhancementStatus(requestId), 2000);
        }
      }
    } catch (error) {
      console.error('❌ Error polling enhancement status:', error);
    }
  };

  const triggerManualEnhancement = () => {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: 'Enhance with Gemini',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    callEnhancementAPI('Enhance this drawing with more detail and artistic flair');
  };

  // Separate speech recognition for voice commands (independent of multimodal)
  const initializeVoiceCommandRecognition = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.error('❌ Speech recognition not supported in this browser');
      setError('Speech recognition not supported in this browser');
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    const voiceCommandRecognition = new SpeechRecognition();
    
    voiceCommandRecognition.continuous = false; // Only listen for one command at a time
    voiceCommandRecognition.interimResults = false; // Only final results
    voiceCommandRecognition.lang = 'en-US';
    voiceCommandRecognition.maxAlternatives = 1;

    voiceCommandRecognition.onstart = () => {
      console.log('🎤 Voice command recognition started');
      setRecognizedText('Listening for commands...');
    };

    voiceCommandRecognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript.toLowerCase();
      console.log('🎤 Voice command recognized:', transcript);
      setRecognizedText(transcript);

      // Check for enhance commands
      if (isEnhanceCommand(transcript)) {
        console.log('🎯 Enhance command detected:', transcript);
        
        // Add user message to chat
        const userMessage: ChatMessage = {
          id: Date.now().toString(),
          type: 'user',
          content: transcript,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMessage]);
        
        // Call enhancement API
        callEnhancementAPI(transcript);
        
        // Clear recognized text
        setTimeout(() => setRecognizedText(''), 2000);
      }
    };

    voiceCommandRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('❌ Voice command recognition error:', event.error);
      setRecognizedText('');
      if (event.error === 'no-speech') {
        // Restart if no speech detected
        setTimeout(() => {
          if (isListeningForCommands) {
            voiceCommandRecognition.start();
          }
        }, 1000);
      }
    };

    voiceCommandRecognition.onend = () => {
      console.log('🎤 Voice command recognition ended');
      // Restart if we're supposed to be listening
      if (isListeningForCommands) {
        setTimeout(() => voiceCommandRecognition.start(), 100);
      }
    };

    // Store the recognition instance
    speechRecognitionRef.current = voiceCommandRecognition;
    return true;
  };

  const startVoiceCommandRecognition = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.start();
      } catch (error) {
        console.error('❌ Error starting voice command recognition:', error);
      }
    }
  };

  const stopVoiceCommandRecognition = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (error) {
        console.error('❌ Error stopping voice command recognition:', error);
      }
    }
  };

  const toggleVoiceCommands = () => {
    if (isListeningForCommands) {
      setIsListeningForCommands(false);
      stopVoiceCommandRecognition();
      setRecognizedText('');
    } else {
      setIsListeningForCommands(true);
      if (!speechRecognitionRef.current) {
        if (!initializeVoiceCommandRecognition()) {
          return;
        }
      }
      startVoiceCommandRecognition();
    }
  };

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
        stopVoiceCommandRecognition();
        if (cleanupCanvasCapture) {
          cleanupCanvasCapture();
        }
      };
    } else {
      console.log('🚨 COMPONENT IS CLOSED - DISCONNECTING!');
      disconnectWebSocket();
      stopVoiceCommandRecognition();
    }

    return () => {
      console.log('🚨 COMPONENT UNMOUNTING - CLEANING UP!');
      disconnectWebSocket();
      stopVoiceCommandRecognition();
    };
  }, [isOpen]);

  // Add cleanup on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('🚨 PAGE UNLOADING - CLEANING UP WEBSOCKET!');
      disconnectWebSocket();
      
      // Send browser close signal to backend
      try {
        // Use sendBeacon for reliable delivery during page unload
        if (navigator.sendBeacon) {
          navigator.sendBeacon('http://localhost:5001/api/browser-closed', JSON.stringify({}));
          console.log('📡 Browser close signal sent via sendBeacon');
        } else {
          // Fallback to fetch if sendBeacon not available
          fetch('http://localhost:5001/api/browser-closed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            keepalive: true
          }).catch(err => console.log('📡 Browser close signal sent via fetch'));
        }
      } catch (err) {
        console.log('📡 Browser close signal failed:', err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        console.log('🚨 PAGE HIDDEN - CLEANING UP WEBSOCKET!');
        disconnectWebSocket();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      disconnectWebSocket();
    };
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectWebSocket = () => {
    try {
      console.log('Attempting to connect to multimodal server...');
      webSocketRef.current = new WebSocket('ws://localhost:9083');
      
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
      console.log('🔌 Disconnecting WebSocket...');
      
      // Remove all event listeners to prevent memory leaks
      webSocketRef.current.onopen = null;
      webSocketRef.current.onmessage = null;
      webSocketRef.current.onclose = null;
      webSocketRef.current.onerror = null;
      
      // Close the connection properly
      if (webSocketRef.current.readyState === WebSocket.OPEN) {
        webSocketRef.current.close(1000, 'User disconnected');
      }
      
      webSocketRef.current = null;
    }
    setIsConnected(false);
    setIsRecording(false);
    setVoiceStatus('idle');
    console.log('✅ WebSocket disconnected and cleaned up');
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
        
        // Check if this is an enhancement command response
        if (data.command_detected === 'enhance') {
          // Add special enhancement message to chat
          const newMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'assistant',
            content: data.text,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, newMessage]);
          console.log('✅ [DEBUG] Enhancement command message added to chat');
        } else if (data.enhancement_started) {
          // Add enhancement started message
          const newMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'assistant',
            content: data.text,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, newMessage]);
          console.log('✅ [DEBUG] Enhancement started message added to chat');
          
          // TODO: Could add polling for enhancement status here
        } else if (data.enhancement_error) {
          // Add enhancement error message
          const newMessage: ChatMessage = {
            id: Date.now().toString(),
            type: 'assistant',
            content: data.text,
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, newMessage]);
          console.log('❌ [DEBUG] Enhancement error message added to chat');
        } else {
          // Regular text message
        const newMessage: ChatMessage = {
          id: Date.now().toString(),
          type: 'assistant',
          content: data.text,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, newMessage]);
          console.log('✅ [DEBUG] Regular text message added to chat');
        }
      }
      
      if (data.audio) {
        console.log('🔍 [DEBUG] Audio message received, length:', data.audio.length);
        // Queue audio for playback
        audioQueueRef.current.push(data.audio);
        playNextAudio();
        console.log('✅ [DEBUG] Audio queued for playback');
      }
      
      if (data.voice_status) {
        console.log('🔍 [DEBUG] Voice status update:', data.voice_status);
        setVoiceStatus(data.voice_status);
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
      
      // Capture the entire canvas container (includes enhanced images)
      const canvasContainer = document.querySelector('[data-canvas-container]');
      console.log('🚨 Canvas container found:', !!canvasContainer);
      
      if (canvasContainer && webSocketRef.current?.readyState === WebSocket.OPEN) {
        console.log('🚨 Canvas container and WebSocket ready, taking screenshot...');
        
        // Use html2canvas to capture the entire container
        html2canvas(canvasContainer as HTMLElement, {
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#fafaf9', // stone-50 background
          scale: 1,
          logging: false
        }).then(canvas => {
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
        }).catch(err => {
          console.error('❌ Failed to capture canvas container:', err);
        });
      } else {
        console.log('🚨 CANNOT CAPTURE - Canvas container or WebSocket not ready');
        console.log('🚨 Canvas container exists:', !!canvasContainer);
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
    const canvasContainer = document.querySelector('[data-canvas-container]');
    
    if (canvasContainer && webSocketRef.current?.readyState === WebSocket.OPEN) {
      html2canvas(canvasContainer as HTMLElement, {
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#fafaf9',
        scale: 1,
        logging: false
      }).then(canvas => {
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
      }).catch(err => {
        console.error('❌ Manual capture failed:', err);
      });
    } else {
      console.log('❌ Manual capture failed - Canvas container or WebSocket not ready');
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
        const canvasContainer = document.querySelector('[data-canvas-container]');
        if (canvasContainer) {
          html2canvas(canvasContainer as HTMLElement, {
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#fafaf9',
            scale: 1,
            logging: false
          }).then(canvas => {
          const dataUrl = canvas.toDataURL('image/png', 1.0);
            console.log('📷 TEST: Canvas container screenshot taken');
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
                newWindow.document.title = 'Canvas Container Screenshot Test';
            }
          };
          img.src = dataUrl;
          }).catch(err => {
            console.error('❌ TEST: Failed to capture canvas container:', err);
          });
        } else {
          console.log('❌ TEST: No canvas container found');
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
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-medium text-blue-800 mb-2">💡 Voice Commands:</p>
                  <p className="text-xs text-blue-700 mb-1">
                    • Click the sparkles button to enable voice commands
                  </p>
                  <p className="text-xs text-blue-700 mb-1">
                    • Say: "Enhance with Gemini" or "Enhance this drawing"
                  </p>
                  <p className="text-xs text-blue-700">
                    • Your drawing will be automatically enhanced with AI!
                  </p>
                </div>
                <div className="mt-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                  <p className="text-xs font-medium text-orange-800 mb-2">✨ Manual Enhancement:</p>
                  <p className="text-xs text-orange-700">
                    Click the wand button to instantly enhance your drawing with Gemini AI
                  </p>
                </div>
                <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs font-medium text-purple-800 mb-2">🎤 Multimodal Chat:</p>
                  <p className="text-xs text-purple-700">
                    Use the microphone button to chat with the AI assistant about your drawings
                  </p>
                </div>
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

              {/* Voice Commands Button */}
              <button
                onClick={toggleVoiceCommands}
                disabled={!isConnected}
                className={`relative p-2 rounded-full transition-colors ${
                  isListeningForCommands
                    ? 'bg-purple-500 text-white hover:bg-purple-600'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                } ${!isConnected && 'opacity-50 cursor-not-allowed'}`}
                title={isListeningForCommands ? 'Stop Voice Commands' : 'Start Voice Commands'}
              >
                {/* Voice commands status indicator */}
                <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                  isListeningForCommands ? 'bg-purple-500 animate-pulse' : 'bg-blue-500'
                }`}></div>
                
                <Sparkles size={16} />
              </button>

              {/* Manual Enhancement Button */}
              <button
                onClick={triggerManualEnhancement}
                disabled={!isConnected || enhancementStatus === 'processing'}
                className="p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Enhance with Gemini"
              >
                <Wand2 size={16} />
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

              {/* Voice Activity Indicator */}
              {voiceStatus === 'listening' && (
                <div className="flex items-center text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse mr-1"></div>
                  <span className="text-xs">Listening...</span>
                </div>
              )}

              {/* Voice Commands Indicator */}
              {isListeningForCommands && (
                <div className="flex items-center text-purple-600">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse mr-1"></div>
                  <span className="text-xs">Voice Commands Active</span>
                </div>
              )}

              {/* Enhancement Status Indicator */}
              {enhancementStatus === 'processing' && (
                <div className="flex items-center text-orange-600">
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse mr-1"></div>
                  <span className="text-xs">Enhancing...</span>
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

            {/* Recognized Text Display */}
            {recognizedText && (
              <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-xs text-purple-700 font-medium">Recognized:</p>
                <p className="text-sm text-purple-800">{recognizedText}</p>
              </div>
            )}

            {/* Voice Commands Help */}
            {isListeningForCommands && (
              <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-700 font-medium">💡 Voice Commands:</p>
                <p className="text-xs text-blue-800">
                  Try saying: "Enhance with Gemini" or "Enhance this drawing"
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MultimodalAIAssistant; 
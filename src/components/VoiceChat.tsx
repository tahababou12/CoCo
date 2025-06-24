import React, { useState, useEffect, useRef } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { useWebSocket } from '../context/WebSocketContext';
import { Mic, MicOff, Volume2, VolumeX, Phone, PhoneOff } from 'lucide-react';

const VoiceChat: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const webSocket = useWebSocket();
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [isConnecting, setIsConnecting] = useState(false);
  const audioElementsRef = useRef<Record<string, HTMLAudioElement>>({});

  // Initialize voice chat
  const startVoiceChat = async () => {
    try {
      setIsConnecting(true);
      
      // Get user audio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false
      });

      setLocalStream(stream);
      dispatch({ type: 'TOGGLE_VOICE_CHAT', payload: true });

      // Add audio tracks to existing peer connections
      if (webSocket && state.collaborators.length > 0) {
        for (const collaborator of state.collaborators) {
          const peerConnection = state.peerConnections[collaborator.id];
          if (peerConnection) {
            // Add audio tracks
            stream.getTracks().forEach(track => {
              peerConnection.addTrack(track, stream);
            });
          }
        }
      }

      setIsConnecting(false);
    } catch (error) {
      console.error('Error starting voice chat:', error);
      setIsConnecting(false);
    }
  };

  // Stop voice chat
  const stopVoiceChat = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }

    // Remove audio elements
    Object.values(audioElementsRef.current).forEach(audio => {
      audio.remove();
    });
    audioElementsRef.current = {};

    dispatch({ type: 'TOGGLE_VOICE_CHAT', payload: false });
  };

  // Toggle mute
  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = state.voiceChat.isMuted;
      });
    }
    dispatch({ type: 'SET_VOICE_MUTE', payload: !state.voiceChat.isMuted });
  };

  // Handle remote audio streams
  useEffect(() => {
    Object.entries(state.remoteStreams).forEach(([userId, stream]) => {
      // Check if this stream has audio tracks
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0 && !audioElementsRef.current[userId]) {
        // Create audio element for remote user
        const audioElement = document.createElement('audio');
        audioElement.srcObject = stream;
        audioElement.autoplay = true;
        audioElement.volume = 0.8;
        document.body.appendChild(audioElement);
        
        audioElementsRef.current[userId] = audioElement;
      }
    });

    // Clean up removed users
    Object.keys(audioElementsRef.current).forEach(userId => {
      if (!state.remoteStreams[userId]) {
        const audioElement = audioElementsRef.current[userId];
        if (audioElement) {
          audioElement.remove();
          delete audioElementsRef.current[userId];
        }
      }
    });
  }, [state.remoteStreams]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      Object.values(audioElementsRef.current).forEach(audio => {
        audio.remove();
      });
    };
  }, [localStream]);

  // Don't show if not connected to a room
  if (!webSocket?.isConnected || !webSocket?.currentRoom) {
    return null;
  }

  return (
    <div className="fixed right-4 z-50" style={{ top: '280px' }}>
                      <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[200px]">
          {/* Header */}
          <div className="flex items-center space-x-2 mb-2 pb-2 border-b border-gray-100">
            <Volume2 size={16} className="text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Voice Chat</span>
          </div>
          
          <div className="flex items-center space-x-3">
          {/* Voice Chat Toggle */}
          {!state.voiceChat.isEnabled ? (
            <button
              onClick={startVoiceChat}
              disabled={isConnecting}
              className="flex items-center space-x-2 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
              title="Start Voice Chat"
            >
              <Phone size={16} />
              <span className="text-sm">
                {isConnecting ? 'Connecting...' : 'Voice Chat'}
              </span>
            </button>
          ) : (
            <div className="flex items-center space-x-2">
              {/* Mute Toggle */}
              <button
                onClick={toggleMute}
                className={`p-2 rounded-lg transition-colors ${
                  state.voiceChat.isMuted 
                    ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                    : 'bg-green-100 text-green-600 hover:bg-green-200'
                }`}
                title={state.voiceChat.isMuted ? 'Unmute' : 'Mute'}
              >
                {state.voiceChat.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>

              {/* End Call */}
              <button
                onClick={stopVoiceChat}
                className="p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                title="End Voice Chat"
              >
                <PhoneOff size={16} />
              </button>

              {/* Active Participants Indicator */}
              <div className="flex items-center space-x-1 text-sm text-gray-600">
                <Volume2 size={14} />
                <span>{state.collaborators.length + 1}</span>
                <span className="text-xs text-gray-500">
                  {state.collaborators.length === 0 ? 'person' : 'people'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Active Participants List */}
        {state.voiceChat.isEnabled && (
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-500 mb-1">In Voice Chat:</div>
            <div className="space-y-1">
              {/* Current User */}
              <div className="flex items-center space-x-2 text-xs">
                <div className={`w-2 h-2 rounded-full ${state.voiceChat.isMuted ? 'bg-red-400' : 'bg-green-400'}`} />
                <span>{state.currentUser?.name || 'You'} (You)</span>
              </div>
              
              {/* Other Participants */}
              {state.collaborators.map(collaborator => (
                <div key={collaborator.id} className="flex items-center space-x-2 text-xs">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span>{collaborator.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceChat; 
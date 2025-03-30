import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from 'react';
import { useDrawing } from './DrawingContext';
import { WebSocketMessage, Shape, User, UserPosition, Point } from '../types';
import { v4 as uuidv4 } from '../utils/uuid';

// URL of the WebSocket server
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

// Array of colors for different users
const USER_COLORS = [
  '#FF5733', // Red-orange
  '#33FF57', // Green
  '#3357FF', // Blue
  '#FF33F5', // Pink
];

// Default positions for users
const DEFAULT_POSITIONS: UserPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
];

// WebRTC configuration
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
};

interface WebSocketContextType {
  socket: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  users: User[];
  currentUser: User | null;
  peerConnections: Record<string, RTCPeerConnection>;
  remoteStreams: Record<string, MediaStream>;
  connect: (userName: string, position: UserPosition) => void;
  disconnect: () => void;
  sendCursorMove: (position: Point) => void;
  startDrawing: (point: Point, tool: string) => void;
  continueDrawing: (point: Point) => void;
  endDrawing: () => void;
  addShape: (shape: Shape) => void;
  deleteShape: (shapeId: string) => void;
  updateViewTransform: (offsetX: number, offsetY: number, scale: number) => void;
  startWebcamSharing: (existingStream?: MediaStream) => Promise<MediaStream | null>;
  stopWebcamSharing: (keepStreamAlive?: boolean) => void;
  sharedWebcamStream: MediaStream | null;
  setSharedWebcamStream: React.Dispatch<React.SetStateAction<MediaStream | null>>;
  sendMessage: (message: WebSocketMessage) => void;
  toggleHandTracking: (isEnabled: boolean) => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { state, dispatch } = useDrawing();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [peerConnections, setPeerConnections] = useState<Record<string, RTCPeerConnection>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [sharedWebcamStream, setSharedWebcamStream] = useState<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const userIdRef = useRef<string>(uuidv4());
  
  // Calculate available positions
  const availablePositions = DEFAULT_POSITIONS.filter(
    pos => !state.collaborators.some(user => user.position === pos) || 
           (state.currentUser && state.currentUser.position === pos)
  );

  // Add cursor batch handling state
  const lastCursorPosition = useRef<{x: number, y: number} | null>(null);
  const cursorUpdateTimeoutRef = useRef<number | null>(null);
  
  // Function to create a peer connection for a specific user
  const createPeerConnection = async (targetUserId: string, isInitiator = false) => {
    try {
      console.log(`Creating peer connection with ${targetUserId}, initiator: ${isInitiator}`);
      const peerConnection = new RTCPeerConnection(ICE_SERVERS);
      
      // Add local stream tracks to the peer connection
      if (state.currentUser && state.currentUser.id === targetUserId) {
        state.currentUser.stream.getTracks().forEach(track => {
          peerConnection.addTrack(track, state.currentUser.stream);
        });
      }
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          dispatch({
            type: 'WEBCAM_ICE_CANDIDATE',
            payload: {
              userId: userIdRef.current,
              targetUserId,
              candidate: event.candidate
            }
          });
        }
      };
      
      // Handle incoming streams
      peerConnection.ontrack = (event) => {
        console.log(`Received remote stream from ${targetUserId}`);
        const [remoteStream] = event.streams;
        dispatch({
          type: 'ADD_REMOTE_STREAM',
          payload: { userId: targetUserId, stream: remoteStream }
        });
      };
      
      // Store the peer connection
      dispatch({
        type: 'ADD_PEER_CONNECTION',
        payload: { userId: targetUserId, peerConnection }
      });
      
      // If we're the initiator, create and send an offer
      if (isInitiator && state.currentUser && state.currentUser.id === targetUserId) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        dispatch({
          type: 'WEBCAM_OFFER',
          payload: {
            userId: userIdRef.current,
            targetUserId,
            offer
          }
        });
      }
      
      return peerConnection;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      return null;
    }
  };
  
  // Function to handle incoming WebRTC offers
  const handleWebcamOffer = async (userId: string, offer: RTCSessionDescriptionInit) => {
    try {
      console.log(`Received WebRTC offer from ${userId}`);
      
      // Create a peer connection if it doesn't exist
      let peerConnection = peerConnections[userId];
      if (!peerConnection) {
        const newConnection = await createPeerConnection(userId, true);
        if (!newConnection) return;
        peerConnection = newConnection;
      }
      
      // Set the remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create and send an answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      dispatch({
        type: 'WEBCAM_ANSWER',
        payload: {
          userId: userIdRef.current,
          targetUserId: userId,
          answer
        }
      });
    } catch (error) {
      console.error('Error handling WebRTC offer:', error);
    }
  };
  
  // Function to handle incoming WebRTC answers
  const handleWebcamAnswer = async (userId: string, answer: RTCSessionDescriptionInit) => {
    try {
      console.log(`Received WebRTC answer from ${userId}`);
      
      const peerConnection = peerConnections[userId];
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (error) {
      console.error('Error handling WebRTC answer:', error);
    }
  };
  
  // Function to handle incoming ICE candidates
  const handleIceCandidate = async (userId: string, candidate: RTCIceCandidateInit) => {
    try {
      const peerConnection = peerConnections[userId];
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (error) {
      console.error('Error handling ICE candidate:', error);
    }
  };

  // Function to toggle hand tracking status
  const toggleHandTracking = (isEnabled: boolean) => {
    if (isConnected) {
      // Update local state
      dispatch({
        type: 'UPDATE_HAND_TRACKING_STATUS',
        payload: { userId: userIdRef.current, isEnabled }
      });
      
      // Notify other users
      dispatch({
        type: 'HAND_TRACKING_STATUS',
        payload: { userId: userIdRef.current, isEnabled }
      });
    }
  };
  
  // Function to start webcam sharing
  const startWebcamSharing = async (existingStream?: MediaStream) => {
    try {
      // Use existing stream if provided, otherwise get a new one
      let stream = existingStream || sharedWebcamStream;

      // Only request a new stream if we don't have one yet
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        
        // Save the stream for future use
        setSharedWebcamStream(stream);
      }

      if (!wsRef.current || !state.currentUser) {
        console.error('Cannot start webcam sharing: websocket or user not initialized');
        return null;
      }

      // Update user status to indicate webcam is enabled
      dispatch({
        type: 'USER_STATUS_UPDATE',
        payload: {
          isHandTrackingEnabled: true,
          webcamStreamId: state.currentUser.id
        }
      });

      // Create RTCPeerConnection for each user
      if (state.collaborators.length > 0) {
        for (const user of state.collaborators) {
          // Skip self
          if (user.id === state.currentUser.id) continue;

          const peerConnection = await createPeerConnection(user.id, true);
          
          // Add all tracks from the stream to the peer connection
          stream.getTracks().forEach(track => {
            peerConnection.addTrack(track, stream!);
          });

          // Create and send offer
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          
          dispatch({
            type: 'WEBCAM_OFFER',
            payload: {
              userId: userIdRef.current,
              targetUserId: user.id,
              offer: peerConnection.localDescription
            }
          });
        }
      }

      return stream;
    } catch (error) {
      console.error('Error starting webcam sharing:', error);
      return null;
    }
  };
  
  // Function to stop webcam sharing
  const stopWebcamSharing = (keepStreamAlive = false) => {
    if (!wsRef.current || !state.currentUser) return;

    // Update user status to indicate webcam is disabled
    dispatch({
      type: 'USER_STATUS_UPDATE',
      payload: {
        isHandTrackingEnabled: false,
        webcamStreamId: null
      }
    });

    // Close all peer connections
    Object.values(peerConnections).forEach(connection => {
      try {
        connection.close();
      } catch (e) {
        console.error('Error closing peer connection:', e);
      }
    });
    
    // Clear peer connections
    setPeerConnections({});
    
    // Only stop the stream if we don't need to keep it alive for other components
    if (!keepStreamAlive && sharedWebcamStream) {
      sharedWebcamStream.getTracks().forEach(track => track.stop());
      setSharedWebcamStream(null);
    }
  };

  // Connect to WebSocket server
  const connect = (userName: string, position: UserPosition) => {
    if (isConnected || isConnecting) return;
    
    setIsConnecting(true);
    console.log(`Connecting to WebSocket server at ${WS_URL}`);
    
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      setIsConnecting(false);
      setSocket(ws);
      
      const userId = userIdRef.current;
      
      // Join the room
      const user: User = {
        id: userId,
        name: userName,
        position,
        color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
        isActive: true,
        cursor: { x: 0, y: 0 },
        isHandTrackingEnabled: false
      };
      
      setCurrentUser(user);
      
      dispatch({ type: 'SET_CURRENT_USER', payload: user });
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: true });
      
      // Send join room message
      sendMessage({
        type: 'JOIN_ROOM',
        payload: {
          userId,
          username: userName,
          position
        }
      });
      
      // Request initial state sync
      sendMessage({
        type: 'REQUEST_SYNC',
        payload: {
          userId
        }
      });
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
      setIsConnecting(false);
      setSocket(null);
      wsRef.current = null;
      
      // Clean up peer connections
      stopWebcamSharing();
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnecting(false);
    };
    
    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
  };
  
  // Disconnect from WebSocket server
  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
      setSocket(null);
      
      // Clean up webcam sharing
      stopWebcamSharing();
    }
  };
  
  // Send message to WebSocket server
  const sendMessage = (message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket not connected, cannot send message:', message);
    }
  };
  
  // Handle cursor movement with simple direct sending for reliability
  const sendCursorMove = (position: Point) => {
    if (!isConnected || !currentUser || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    
    // Send cursor position directly without batching
    const message = {
      type: 'CURSOR_MOVE',
      payload: { 
        userId: userIdRef.current, 
        position 
      }
    };
    
    wsRef.current.send(JSON.stringify(message));
  };
  
  // Handle incoming WebSocket messages
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    console.log("Received WebSocket message:", message.type, message.payload);
    
    switch (message.type) {
      case 'USER_JOINED':
        console.log("Adding collaborator:", message.payload);
        dispatch({ type: 'ADD_COLLABORATOR', payload: message.payload });
        break;
        
      case 'USER_LEFT':
        console.log("Removing collaborator:", message.payload.userId);
        // Close and clean up peer connection if it exists
        const peerConnection = peerConnections[message.payload.userId];
        if (peerConnection) {
          peerConnection.close();
          dispatch({
            type: 'REMOVE_PEER_CONNECTION',
            payload: { userId: message.payload.userId }
          });
        }
        
        // Remove remote stream if it exists
        if (remoteStreams[message.payload.userId]) {
          dispatch({
            type: 'REMOVE_REMOTE_STREAM',
            payload: { userId: message.payload.userId }
          });
        }
        
        dispatch({ type: 'REMOVE_COLLABORATOR', payload: message.payload.userId });
        break;
        
      case 'CURSOR_MOVE':
        // Make sure we're not processing our own cursor position
        if (message.payload.userId !== userIdRef.current) {
          console.log("Received cursor position for", message.payload.userId, message.payload.position);
          
          dispatch({
            type: 'UPDATE_COLLABORATOR',
            payload: {
              userId: message.payload.userId,
              updates: { cursor: message.payload.position }
            }
          });
        }
        break;
        
      case 'SYNC_SHAPES':
        dispatch({ type: 'SYNC_ALL_SHAPES', payload: message.payload.shapes });
        break;
        
      case 'SHAPE_ADDED':
        if (message.payload.userId !== userIdRef.current) {
          dispatch({ type: 'ADD_SHAPE', payload: message.payload.shape });
        }
        break;
        
      case 'SHAPE_UPDATED':
        if (message.payload.userId !== userIdRef.current) {
          dispatch({
            type: 'UPDATE_SHAPE',
            payload: {
              id: message.payload.shapeId,
              updates: message.payload.updates
            }
          });
        }
        break;
        
      case 'SHAPES_DELETED':
        if (message.payload.userId !== userIdRef.current) {
          dispatch({ type: 'DELETE_SHAPES', payload: message.payload.shapeIds });
        }
        break;
        
      case 'HAND_TRACKING_STATUS':
        if (message.payload.userId !== userIdRef.current) {
          dispatch({
            type: 'UPDATE_HAND_TRACKING_STATUS',
            payload: {
              userId: message.payload.userId,
              isEnabled: message.payload.isEnabled
            }
          });
        }
        break;
        
      case 'USER_STATUS_UPDATE':
        if (message.payload.userId !== userIdRef.current) {
          // Update the collaborator with the new webcam status
          dispatch({
            type: 'UPDATE_COLLABORATOR',
            payload: {
              userId: message.payload.userId,
              updates: { webcamEnabled: message.payload.webcamEnabled }
            }
          });
        }
        break;
        
      case 'WEBCAM_OFFER':
        if (message.payload.targetUserId === userIdRef.current) {
          handleWebcamOffer(message.payload.userId, message.payload.offer);
        }
        break;
        
      case 'WEBCAM_ANSWER':
        if (message.payload.targetUserId === userIdRef.current) {
          handleWebcamAnswer(message.payload.userId, message.payload.answer);
        }
        break;
        
      case 'WEBCAM_ICE_CANDIDATE':
        if (message.payload.targetUserId === userIdRef.current) {
          handleIceCandidate(message.payload.userId, message.payload.candidate);
        }
        break;
        
      case 'ERROR':
        console.error('Error from server:', message.payload.message);
        break;
        
      default:
        console.warn('Unknown message type:', message);
    }
  };
  
  // Sync shapes when they change
  useEffect(() => {
    // Skip if not connected or no shapes
    if (!isConnected || state.shapes.length === 0) return;
    
    // Only broadcast when current shape is null (meaning we've finished drawing)
    if (state.currentShape === null) {
      // Find the most recently added shape (not synced yet)
      const lastShape = state.shapes[state.shapes.length - 1];
      
      // If the last shape doesn't have a createdBy, it's a new shape we need to sync
      if (lastShape && !lastShape.createdBy && state.currentUser) {
        // Set the creator for future reference
        const updatedShape = { ...lastShape, createdBy: state.currentUser.id };
        
        // Update the shape locally first
        dispatch({
          type: 'UPDATE_SHAPE',
          payload: { id: lastShape.id, updates: { createdBy: state.currentUser.id } }
        });
        
        // Then broadcast the new shape to other users
        sendMessage({
          type: 'SHAPE_ADDED',
          payload: {
            shape: updatedShape,
            userId: state.currentUser.id
          }
        });
      }
    }
  }, [state.shapes, state.currentShape, isConnected, state.currentUser]);
  
  // Monitor shape deletions and broadcast to collaborators
  useEffect(() => {
    if (!isConnected || !state.currentUser || !state.shapes) return;
    
    const handleDeletedShapes = () => {
      // Check for DELETE_SHAPES in history by comparing shapes length
      if (state.history.past.length > 0) {
        // Get the previous shapes state from history
        const prevShapes = state.history.past[state.history.past.length - 1];
        
        if (prevShapes.length > state.shapes.length) {
          // Find shape IDs that existed in previous state but not in current state
          const deletedShapeIds = prevShapes
            .filter(prevShape => !state.shapes.some(shape => shape.id === prevShape.id))
            .map(shape => shape.id);
          
          if (deletedShapeIds.length > 0) {
            console.log('Broadcasting shape deletion:', deletedShapeIds);
            sendMessage({
              type: 'SHAPES_DELETED',
              payload: {
                shapeIds: deletedShapeIds,
                userId: state.currentUser.id
              }
            });
          }
        }
      }
    };
    
    // Call the handler when shapes array changes
    handleDeletedShapes();
    
  }, [isConnected, state.currentUser, state.shapes, state.history.past, sendMessage]);
  
  // Clean up peer connections and streams on unmount
  useEffect(() => {
    return () => {
      // Stop sharing
      stopWebcamSharing();
      
      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);
  
  return (
    <WebSocketContext.Provider value={{ 
      socket,
      isConnected,
      isConnecting,
      users,
      currentUser,
      peerConnections,
      remoteStreams,
      connect,
      disconnect,
      sendMessage,
      sendCursorMove,
      toggleHandTracking,
      startWebcamSharing,
      stopWebcamSharing,
      sharedWebcamStream,
      setSharedWebcamStream
    }}>
      {children}
    </WebSocketContext.Provider>
  )
}

export const useWebSocket = () => {
  const context = useContext(WebSocketContext)
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider')
  }
  return context
} 
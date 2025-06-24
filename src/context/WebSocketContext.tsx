import React, { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback, useMemo } from 'react';
import { useDrawing } from './DrawingContext';
import { WebSocketMessage, Shape, User, UserPosition, Point } from '../types';
import { v4 as uuidv4 } from '../utils/uuid';

// URL of the WebSocket server
const WS_URL = 'ws://localhost:8081';

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

export type WebSocketContextType = {
  socket: WebSocket | null;
  isConnected: boolean;
  isConnecting: boolean;
  users: User[];
  currentUser: User | null;
  currentRoom: { id: string; name: string; code?: string; type: string; currentUsers?: any[]; maxUsers?: number } | null;
  peerConnections: Record<string, RTCPeerConnection>;
  remoteStreams: Record<string, MediaStream>;
  connect: (userName: string, position: UserPosition, roomId?: string, roomCode?: string) => void;
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
};

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { state, dispatch } = useDrawing();
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  // Instead of managing users with useState, use useRef to avoid the linter error
  const usersRef = useRef<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; code?: string; type: string } | null>(null);
  const [peerConnections, setPeerConnections] = useState<Record<string, RTCPeerConnection>>({});
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [sharedWebcamStream, setSharedWebcamStream] = useState<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const userIdRef = useRef<string>(uuidv4());
  
  // Calculate available positions
  const availablePositions = useMemo(() => DEFAULT_POSITIONS.filter(
    pos => !state.collaborators.some(user => user.screenPosition === pos) || 
           (state.currentUser && state.currentUser.screenPosition === pos)
  ), [state.collaborators, state.currentUser]);

  // Add cursor batch handling state
  const lastCursorPosition = useRef<{x: number, y: number} | null>(null);
  const cursorUpdateTimeoutRef = useRef<number | null>(null);
  
  // Function to create a peer connection for a specific user
  const createPeerConnection = async (targetUserId: string, isInitiator = false) => {
    try {
      console.log(`Creating peer connection with ${targetUserId}, initiator: ${isInitiator}`);
      const peerConnection = new RTCPeerConnection(ICE_SERVERS);
      
      // Add local stream tracks to the peer connection if available
      if (sharedWebcamStream && state.currentUser) {
        sharedWebcamStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, sharedWebcamStream);
        });
      }
      
      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          dispatch({
            type: 'ADD_PEER_CONNECTION',
            payload: {
              userId: targetUserId, 
              peerConnection
            }
          });
          
          // Send the ICE candidate via WebSocket
          sendMessage({
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
        
        // Update remote streams state
        setRemoteStreams(prev => ({
          ...prev,
          [targetUserId]: remoteStream
        }));
        
        // Add to drawing context
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
      if (isInitiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send the offer via WebSocket
        sendMessage({
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
  
  // Get the current list of users
  const getUsers = useCallback(() => usersRef.current, []);
  
  // Function to handle incoming WebRTC offers
  const handleWebcamOffer = async (userId: string, offer: RTCSessionDescriptionInit) => {
    try {
      console.log(`Received WebRTC offer from ${userId}`);
      
      // Create a peer connection if it doesn't exist
      let peerConnection = peerConnections[userId];
      if (!peerConnection) {
        const newConnection = await createPeerConnection(userId);
        if (!newConnection) return;
        peerConnection = newConnection;
      }
      
      // Set the remote description
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create and send an answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      // Send the answer via WebSocket
      sendMessage({
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
      // Notify other users
      sendMessage({
        type: 'HAND_TRACKING_STATUS',
        payload: { 
          userId: userIdRef.current, 
          isEnabled 
        }
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

      // Notify other users that webcam is enabled
      sendMessage({
        type: 'USER_STATUS_UPDATE',
        payload: {
          userId: userIdRef.current,
          webcamEnabled: true
        }
      });

      // Create RTCPeerConnection for each user
      if (state.collaborators.length > 0 && stream) {
        for (const user of state.collaborators) {
          // Skip self
          if (user.id === userIdRef.current) continue;

          const peerConnection = await createPeerConnection(user.id, true);
          
          if (peerConnection) {
            // Add all tracks from the stream to the peer connection
            stream.getTracks().forEach(track => {
              peerConnection.addTrack(track, stream!);
            });
          }
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

    // Notify other users that webcam is disabled
    sendMessage({
      type: 'USER_STATUS_UPDATE',
      payload: {
        userId: userIdRef.current,
        webcamEnabled: false
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
  const connect = (userName: string, position: UserPosition, roomId?: string, roomCode?: string) => {
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
        position: { x: 0, y: 0 }, // Initialize coordinates
        screenPosition: position, // Screen position (top-left, etc.)
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
          position,
          roomId,
          roomCode
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
      setIsConnected(false);
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
    if (isConnected && wsRef.current) {
      // Store the current position for batch updates
      lastCursorPosition.current = { x: position.x, y: position.y };
      
      // Merge properties correctly for the message
      const message: WebSocketMessage = {
        type: 'CURSOR_MOVE',
        payload: {
          userId: userIdRef.current,
          position: {
            x: position.x,
            y: position.y,
            isHandTracking: position.isHandTracking,
            handIndex: position.handIndex
          }
        }
      };
      
      sendMessage(message);
    }
  };
  
  // Handle incoming WebSocket messages
  const handleWebSocketMessage = (message: WebSocketMessage) => {
    console.log("Received WebSocket message:", message.type, message.payload);
    
    switch (message.type) {
      case 'ROOM_CREATED':
        console.log("Room created:", message.payload);
        // Room created successfully, now auto-join it
        if (message.payload.room && message.payload.room.code) {
          console.log("Auto-joining created room with code:", message.payload.room.code);
          // Auto-join the created room - we'll need the user details
          // For now, we'll just log that the room was created
          // The user will need to manually join using the code
        }
        break;
        
      case 'ROOM_JOINED':
        console.log("Room joined:", message.payload);
        if (message.payload.room) {
          const room = {
            id: message.payload.room.id,
            name: message.payload.room.name,
            code: message.payload.room.code,
            type: message.payload.room.type
          };
          console.log("Setting currentRoom to:", room);
          setCurrentRoom(room);
        }
        break;
        
      case 'ROOM_ERROR':
        console.error("Room error:", message.payload);
        // You could add error handling here, like showing a toast notification
        alert(`Room error: ${message.payload.message}${message.payload.code ? ` (${message.payload.code})` : ''}`);
        break;
        
      case 'ROOM_UPDATED':
        console.log("Room updated:", message.payload);
        if (message.payload.room) {
          const room = {
            id: message.payload.room.id,
            name: message.payload.room.name,
            code: message.payload.room.code,
            type: message.payload.room.type,
            currentUsers: message.payload.room.currentUsers,
            maxUsers: message.payload.room.maxUsers
          };
          console.log("Updating currentRoom to:", room);
          setCurrentRoom(room);
        }
        break;
        
      case 'USER_JOINED':
        console.log("=== USER_JOINED DEBUG ===");
        console.log("Raw message payload:", message.payload);
        console.log("Current collaborators before add:", state.collaborators);
        console.log("Current user ID:", userIdRef.current);
        console.log("Is this our own user?", message.payload.id === userIdRef.current);
        
        // Don't add ourselves to the collaborators list
        if (message.payload.id !== userIdRef.current) {
          console.log("Adding collaborator:", message.payload);
          dispatch({ type: 'ADD_COLLABORATOR', payload: message.payload });
        } else {
          console.log("Skipping self - not adding to collaborators");
        }
        console.log("========================");
        break;
        
      case 'USER_LEFT': {
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
      }
        
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
        
      case 'DRAWING_START':
        if (message.payload.userId !== userIdRef.current) {
          console.log('Received drawing start from collaborator:', message.payload);
          dispatch({
            type: 'START_DRAWING',
            payload: { 
              point: message.payload.point, 
              type: message.payload.tool as Shape['type'] 
            }
          });
        }
        break;
        
      case 'DRAWING_CONTINUE':
        if (message.payload.userId !== userIdRef.current) {
          console.log('Received drawing continue from collaborator:', message.payload);
          dispatch({
            type: 'CONTINUE_DRAWING',
            payload: message.payload.point
          });
        }
        break;
        
      case 'DRAWING_END':
        if (message.payload.userId !== userIdRef.current) {
          console.log('Received drawing end from collaborator:', message.payload);
          dispatch({ type: 'END_DRAWING' });
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
      // Check if we have history
      if (state.history.past.length > 0) {
        // Get the previous state from history
        const prevState = state.history.past[state.history.past.length - 1];
        
        // Make sure we have a valid array to work with
        if (Array.isArray(prevState)) {
          const prevShapes = prevState as Shape[];
          
          if (prevShapes.length > state.shapes.length) {
            // Find shape IDs that existed in previous state but not in current state
            const deletedShapeIds = prevShapes
              .filter(prevShape => !state.shapes.some(shape => shape.id === prevShape.id))
              .map(shape => shape.id);
            
            if (deletedShapeIds.length > 0 && state.currentUser) {
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
      }
    };
    
    // Call the handler when shapes array changes
    handleDeletedShapes();
    
  }, [isConnected, state.currentUser, state.shapes, state.history.past]);
  
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
  
  // Implement drawing synchronization methods
  const startDrawing = useCallback((point: Point, tool: string) => {
    if (!isConnected || !currentUser || !wsRef.current) return;
    
    // Start drawing locally first
    dispatch({
      type: 'START_DRAWING',
      payload: { point, type: tool as Shape['type'] }
    });
    
    // Broadcast to other users
    sendMessage({
      type: 'DRAWING_START',
      payload: {
        userId: currentUser.id,
        point,
        tool
      }
    });
    
    console.log('Broadcasting drawing start to collaborators', point, tool);
  }, [isConnected, currentUser, dispatch, sendMessage]);

  const continueDrawing = useCallback((point: Point) => {
    if (!isConnected || !currentUser || !wsRef.current) return;
    
    // Continue drawing locally
    dispatch({
      type: 'CONTINUE_DRAWING',
      payload: point
    });
    
    // Broadcast to other users
    sendMessage({
      type: 'DRAWING_CONTINUE',
      payload: {
        userId: currentUser.id,
        point
      }
    });
    
    console.log('Broadcasting drawing continuation to collaborators', point);
  }, [isConnected, currentUser, dispatch, sendMessage]);

  const endDrawing = useCallback(() => {
    if (!isConnected || !currentUser || !wsRef.current) return;
    
    // End drawing locally
    dispatch({ type: 'END_DRAWING' });
    
    // Broadcast to other users
    sendMessage({
      type: 'DRAWING_END',
      payload: {
        userId: currentUser.id
      }
    });
    
    console.log('Broadcasting drawing end to collaborators');
  }, [isConnected, currentUser, dispatch, sendMessage]);

  const addShape = useCallback((shape: Shape) => {
    if (!isConnected || !currentUser || !wsRef.current) return;
    
    // Add shape locally
    dispatch({ type: 'ADD_SHAPE', payload: shape });
    
    // Broadcast to other users
    sendMessage({
      type: 'SHAPE_ADDED',
      payload: {
        shape: { ...shape, createdBy: currentUser.id },
        userId: currentUser.id
      }
    });
    
    console.log('Broadcasting shape addition to collaborators', shape);
  }, [isConnected, currentUser, dispatch, sendMessage]);

  const deleteShape = useCallback((shapeId: string) => {
    if (!isConnected || !currentUser || !wsRef.current) return;
    
    // Delete shape locally
    dispatch({ type: 'DELETE_SHAPES', payload: [shapeId] });
    
    // Broadcast to other users
    sendMessage({
      type: 'SHAPES_DELETED',
      payload: {
        shapeIds: [shapeId],
        userId: currentUser.id
      }
    });
    
    console.log('Broadcasting shape deletion to collaborators', shapeId);
  }, [isConnected, currentUser, dispatch, sendMessage]);

  const updateViewTransform = useCallback((offsetX: number, offsetY: number, scale: number) => {
    if (!isConnected || !currentUser || !wsRef.current) return;
    
    // Update view transform locally
    dispatch({
      type: 'PAN',
      payload: { x: offsetX, y: offsetY }
    });
    
    dispatch({
      type: 'ZOOM',
      payload: scale
    });
    
    console.log('View transform updated', { offsetX, offsetY, scale });
  }, [isConnected, currentUser, dispatch]);
  
  // Update the context value to include the new function
  const contextValue = useMemo(() => ({
    socket,
    isConnected,
    isConnecting,
    users: getUsers(),
    currentUser,
    currentRoom,
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
    setSharedWebcamStream,
    startDrawing,
    continueDrawing,
    endDrawing,
    addShape,
    deleteShape,
    updateViewTransform
  }), [
    socket,
    isConnected,
    isConnecting,
    getUsers,
    currentUser,
    currentRoom,
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
    setSharedWebcamStream,
    startDrawing,
    continueDrawing,
    endDrawing,
    addShape,
    deleteShape,
    updateViewTransform
  ]);
  
  return (
    <WebSocketContext.Provider value={contextValue}>
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
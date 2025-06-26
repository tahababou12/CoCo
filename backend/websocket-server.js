const WebSocket = require('ws');
require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Import fetch for Node.js
const fetch = require('node-fetch');

// Initialize Express
const app = express();

// Middleware
app.use(cors({
  origin: '*', // For development - restrict in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files (for generated images)
app.use('/images', express.static(path.join(__dirname, 'images')));

// Basic test route
app.get('/api/ping', (req, res) => {
  res.json({ message: 'Server is running' });
});

// Gemini API endpoint for image generation
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["Text", "Image"]
      }
    };

    console.log('Sending request to Gemini API:', requestBody);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API error:', errorData);
      return res.status(response.status).json({ 
        error: errorData.error?.message || `API responded with status ${response.status}` 
      });
    }

    const data = await response.json();
    console.log('Gemini API response received');
    
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      
      // Check for blocked content
      if (candidate.finishReason === 'RECITATION' || candidate.finishReason === 'SAFETY') {
        return res.status(400).json({ 
          error: `Content was blocked due to ${candidate.finishReason.toLowerCase()} concerns. Please try a different prompt.` 
        });
      }
      
      if (candidate.content) {
        const parts = candidate.content.parts || [];
        let imageData = null;
        let textResponse = null;
        
        for (const part of parts) {
          if (part.text) {
            textResponse = part.text;
          } else if (part.inline_data) {
            imageData = `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`;
          }
        }
        
        res.json({
          success: true,
          imageData,
          textResponse
        });
      } else {
        console.error('No content in candidate:', candidate);
        res.status(500).json({ 
          error: `Generation failed with reason: ${candidate.finishReason || 'unknown'}` 
        });
      }
    } else {
      console.error('Unexpected API response format:', data);
      res.status(500).json({ error: 'Received an unexpected response format from the API' });
    }
  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ 
      error: `Server error: ${error.message}` 
    });
  }
});

// Create HTTP/HTTPS server with Express app
let server;
let wss;

// Try to create HTTPS server if SSL certificates exist, otherwise fall back to HTTP
try {
  // Check if SSL certificate files exist (these would be created by the Vite basicSsl plugin)
  const certPath = path.join(__dirname, '../node_modules/.vite/basic-ssl/_cert.pem');
  const certData = fs.readFileSync(certPath, 'utf8');
  
  // Split the combined certificate file into key and cert parts
  const keyMatch = certData.match(/-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----/);
  const certMatch = certData.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);
  
  if (keyMatch && certMatch) {
    const httpsOptions = {
      key: keyMatch[0],
      cert: certMatch[0]
    };
    
    server = https.createServer(httpsOptions, app);
    console.log('Using HTTPS server for WebSocket');
  } else {
    throw new Error('Could not parse certificate file');
  }
} catch (error) {
  // If SSL certificates don't exist, fall back to HTTP
  console.log('SSL certificates not found, using HTTP server for WebSocket:', error.message);
  server = http.createServer(app);
}

// Create WebSocket server
wss = new WebSocket.Server({ server });

// Store for active connections, shapes, and rooms
const connections = new Map();
const roomShapes = new Map(); // roomId -> shapes array
const rooms = new Map(); // roomId -> Room object
const publicRooms = new Set(); // Set of public room IDs

// Ultra-optimized broadcast function with special fast path for cursor updates
function broadcast(message, excludeClient = null) {
  // For cursor movements, use a fast path without stringifying for each client
  if (message.type === 'CURSOR_MOVE') {
    // Pre-stringify once for all clients
    const stringifiedMessage = JSON.stringify(message);
    
    // Fast broadcast loop
    wss.clients.forEach(client => {
      if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
        client.send(stringifiedMessage);
      }
    });
    return;
  }
  
  // Normal path for other message types
  wss.clients.forEach(client => {
    if (client !== excludeClient && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Handle WebSocket connections
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  console.log(`Client connected: ${clientId}`);
  
  // Initialize connection info
  connections.set(clientId, {
    ws,
    userId: null,
    username: null,
    position: null
  });
  
  // Log the number of active connections
  console.log(`Total active connections: ${connections.size}`);
  
  // Handle messages from clients
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      // Add message processing timestamp for metrics
      const receivedTime = Date.now();
      
      console.log(`Received message of type: ${message.type}`, message.payload);
      
      switch (message.type) {
        case 'CREATE_ROOM': {
          const { userId, roomName, roomType, maxUsers } = message.payload;
          
          const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const roomCode = roomType === 'private' ? generateRoomCode() : undefined;
          
          const newRoom = {
            id: roomId,
            name: roomName,
            type: roomType,
            code: roomCode,
            createdBy: userId,
            createdAt: new Date(),
            maxUsers: maxUsers || 4,
            currentUsers: [],
            isActive: true
          };
          
          rooms.set(roomId, newRoom);
          
          if (roomType === 'public') {
            publicRooms.add(roomId);
          }
          
          console.log(`Created ${roomType} room: ${roomName} (${roomId})`);
          if (roomCode) {
            console.log(`Room code: ${roomCode}`);
          }
          
          // Send room created confirmation
          ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            payload: { room: newRoom }
          }));

          // If it's a public room, broadcast the new room to all clients
          if (roomType === 'public') {
            broadcast({
              type: 'PUBLIC_ROOM_ADDED',
              payload: { room: newRoom }
            });
          }
          
          break;
        }
        
        case 'JOIN_ROOM': {
          const { userId, username, position, roomId, roomCode } = message.payload;
          const client = connections.get(clientId);
          
          console.log(`=== JOIN_ROOM DEBUG ===`);
          console.log(`Payload:`, message.payload);
          console.log(`Current rooms:`, Array.from(rooms.keys()));
          console.log(`Rooms Map size:`, rooms.size);
          
          // Determine which room to join
          let targetRoom = null;
          let targetRoomId = null;
          
          if (roomCode) {
            // Join by room code
            const roomData = findRoomByCode(roomCode);
            if (roomData) {
              targetRoom = roomData.room;
              targetRoomId = roomData.roomId;
            } else {
              ws.send(JSON.stringify({
                type: 'ROOM_ERROR',
                payload: { message: 'Invalid room code', code: roomCode }
              }));
              break;
            }
          } else if (roomId) {
            // Join by room ID
            targetRoomId = roomId;
            
            // Special handling for default-public room
            console.log(`Checking if ${roomId} === 'default-public':`, roomId === 'default-public');
            console.log(`Room exists:`, rooms.has(roomId));
            if (roomId === 'default-public' && !rooms.has(roomId)) {
              console.log(`Creating default public room...`);
              // Create default public room if it doesn't exist
              const defaultRoom = {
                id: roomId,
                name: 'Main Room',
                type: 'public',
                createdBy: 'system',
                createdAt: new Date(),
                maxUsers: 8,
                currentUsers: [],
                isActive: true
              };
              rooms.set(roomId, defaultRoom);
              publicRooms.add(roomId);
              console.log(`Created default public room: ${roomId}`);
              console.log(`Rooms after creation:`, Array.from(rooms.keys()));
            }
            
            targetRoom = rooms.get(roomId);
            console.log(`Target room after get:`, targetRoom ? 'found' : 'not found');
            if (!targetRoom) {
              console.log(`ROOM_ERROR: Room ${roomId} not found`);
              ws.send(JSON.stringify({
                type: 'ROOM_ERROR',
                payload: { message: 'Room not found', code: roomId }
              }));
              break;
            }
          } else {
            // Join default public room (when no roomId specified)
            targetRoomId = 'default-public';
            if (!rooms.has(targetRoomId)) {
              // Create default public room
              const defaultRoom = {
                id: targetRoomId,
                name: 'Main Room',
                type: 'public',
                createdBy: 'system',
                createdAt: new Date(),
                maxUsers: 8,
                currentUsers: [],
                isActive: true
              };
              rooms.set(targetRoomId, defaultRoom);
              publicRooms.add(targetRoomId);
              console.log(`Created default public room: ${targetRoomId}`);
            }
            targetRoom = rooms.get(targetRoomId);
          }
          
          // Check room capacity
          if (targetRoom.currentUsers.length >= targetRoom.maxUsers) {
            ws.send(JSON.stringify({
              type: 'ROOM_ERROR',
              payload: { message: 'Room is full' }
            }));
            break;
          }
          
          // Update connection info
          client.userId = userId;
          client.username = username;
          client.position = position;
          client.roomId = targetRoomId;
          
          // Check if position is already taken in this room
          let positionTaken = false;
          targetRoom.currentUsers.forEach((user) => {
            if (user.screenPosition === position) {
              positionTaken = true;
            }
          });
          
          if (positionTaken) {
            console.log(`Position ${position} already taken in room ${targetRoomId}, finding alternative...`);
            const takenPositions = new Set();
            targetRoom.currentUsers.forEach((user) => {
              if (user.screenPosition) takenPositions.add(user.screenPosition);
            });
            
            const allPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
            const availablePositions = allPositions.filter(p => !takenPositions.has(p));
            
            if (availablePositions.length > 0) {
              client.position = availablePositions[0];
              console.log(`Assigned alternative position: ${client.position}`);
            }
          }
          
          // Generate a random color for the user
          const color = getRandomColor();
          
          // Create user info
          const userInfo = {
            id: userId,
            name: username,
            position: { x: 0, y: 0 },
            screenPosition: client.position,
            isActive: true,
            color
          };
          
          // Add user to room
          targetRoom.currentUsers.push(userInfo);
          
          console.log(`User ${username} joined room ${targetRoom.name} (${targetRoomId})`);
          
          // Send room joined confirmation to the user
          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            payload: { room: targetRoom, user: userInfo }
          }));
          
          // Broadcast room update to all users in the room
          broadcastToRoom(targetRoomId, {
            type: 'ROOM_UPDATED',
            payload: { room: targetRoom }
          });
          
          // Notify other users in the room
          console.log(`=== BROADCASTING USER_JOINED ===`);
          console.log(`Broadcasting to room ${targetRoomId}`);
          console.log(`Room has ${targetRoom.currentUsers.length} users`);
          console.log(`User info being broadcast:`, userInfo);
          broadcastToRoom(targetRoomId, {
            type: 'USER_JOINED',
            payload: userInfo
          }, ws);
          
          // Send existing users in the room to the new user
          console.log(`=== SENDING EXISTING USERS ===`);
          console.log(`Sending ${targetRoom.currentUsers.length - 1} existing users to new user`);
          targetRoom.currentUsers.forEach((existingUser) => {
            if (existingUser.id !== userId) {
              console.log(`Sending existing user to new user:`, existingUser);
              ws.send(JSON.stringify({
                type: 'USER_JOINED',
                payload: existingUser
              }));
            }
          });
          console.log(`=== JOIN PROCESS COMPLETE ===`);
          
          break;
        }
        
        case 'REQUEST_SYNC': {
          // Send room-specific shapes to the requesting client
          const client = connections.get(clientId);
          if (client && client.roomId) {
            const shapes = roomShapes.get(client.roomId) || [];
            ws.send(JSON.stringify({
              type: 'SYNC_SHAPES',
              payload: { shapes }
            }));
          }
          break;
        }
        
        case 'CURSOR_MOVE': {
          // Simple validation to ensure we have a user ID
          if (!message.payload.userId) {
            const client = connections.get(clientId);
            if (client && client.userId) {
              message.payload.userId = client.userId;
            } else {
              break; // Skip if no user ID
            }
          }
          
          // Broadcast to room members only
          const client = connections.get(clientId);
          if (client && client.roomId) {
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'SHAPE_ADDED': {
          const { shape, userId } = message.payload;
          
          // Add shape to room-specific collection
          const client = connections.get(clientId);
          if (client && client.roomId) {
            if (!roomShapes.has(client.roomId)) {
              roomShapes.set(client.roomId, []);
            }
            roomShapes.get(client.roomId).push(shape);
            
            // Broadcast to room members only
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'SHAPE_UPDATED': {
          const { shapeId, updates, userId } = message.payload;
          
          // Update shape in room-specific collection
          const client = connections.get(clientId);
          if (client && client.roomId) {
            const shapes = roomShapes.get(client.roomId) || [];
            const shapeIndex = shapes.findIndex(s => s.id === shapeId);
            if (shapeIndex !== -1) {
              shapes[shapeIndex] = { ...shapes[shapeIndex], ...updates };
            }
            
            // Broadcast to room members only
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'SHAPES_DELETED': {
          const { shapeIds, userId } = message.payload;
          
          // Remove shapes from room-specific collection
          const client = connections.get(clientId);
          if (client && client.roomId) {
            const shapes = roomShapes.get(client.roomId) || [];
            for (const id of shapeIds) {
              const index = shapes.findIndex(s => s.id === id);
              if (index !== -1) {
                shapes.splice(index, 1);
              }
            }
            
            // Broadcast to room members only
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'HAND_TRACKING_STATUS': {
          // Forward hand tracking status to room members only
          const client = connections.get(clientId);
          if (client && client.roomId) {
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'USER_STATUS_UPDATE': {
          // Handle user status updates (like webcam enabled)
          const { userId, webcamEnabled } = message.payload;
          
          // Find the connection for this user
          let userConnection = null;
          connections.forEach((conn) => {
            if (conn.userId === userId) {
              userConnection = conn;
            }
          });
          
          if (userConnection) {
            // Update the connection info
            userConnection.webcamEnabled = webcamEnabled;
            
            // Forward the status update to room members only
            if (userConnection.roomId) {
              broadcastToRoom(userConnection.roomId, message, ws);
            }
            console.log(`Updated user status for ${userId}: webcamEnabled=${webcamEnabled}`);
          }
          break;
        }
        
        case 'WEBCAM_OFFER': {
          // Forward WebRTC offer to the target user
          const { targetUserId } = message.payload;
          
          // Find the target connection
          let targetConnection = null;
          connections.forEach((conn) => {
            if (conn.userId === targetUserId) {
              targetConnection = conn;
            }
          });
          
          if (targetConnection && targetConnection.ws.readyState === WebSocket.OPEN) {
            targetConnection.ws.send(JSON.stringify(message));
            console.log(`Forwarded WebRTC offer to user ${targetUserId}`);
          } else {
            console.warn(`Could not forward WebRTC offer: target user ${targetUserId} not found or not connected`);
          }
          break;
        }
        
        case 'WEBCAM_ANSWER': {
          // Forward WebRTC answer to the target user
          const { targetUserId } = message.payload;
          
          // Find the target connection
          let targetConnection = null;
          connections.forEach((conn) => {
            if (conn.userId === targetUserId) {
              targetConnection = conn;
            }
          });
          
          if (targetConnection && targetConnection.ws.readyState === WebSocket.OPEN) {
            targetConnection.ws.send(JSON.stringify(message));
            console.log(`Forwarded WebRTC answer to user ${targetUserId}`);
          } else {
            console.warn(`Could not forward WebRTC answer: target user ${targetUserId} not found or not connected`);
          }
          break;
        }
        
        case 'WEBCAM_ICE_CANDIDATE': {
          // Forward ICE candidate to the target user
          const { targetUserId } = message.payload;
          
          // Find the target connection
          let targetConnection = null;
          connections.forEach((conn) => {
            if (conn.userId === targetUserId) {
              targetConnection = conn;
            }
          });
          
          if (targetConnection && targetConnection.ws.readyState === WebSocket.OPEN) {
            targetConnection.ws.send(JSON.stringify(message));
            console.log(`Forwarded ICE candidate to user ${targetUserId}`);
          } else {
            console.warn(`Could not forward ICE candidate: target user ${targetUserId} not found or not connected`);
          }
          break;
        }
        
        case 'DRAWING_START': {
          // Forward drawing start to room members only
          const client = connections.get(clientId);
          if (client && client.roomId) {
            console.log(`Broadcasting drawing start from ${client.username} to room ${client.roomId}`);
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'DRAWING_CONTINUE': {
          // Forward drawing continue to room members only
          const client = connections.get(clientId);
          if (client && client.roomId) {
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'DRAWING_END': {
          // Forward drawing end to room members only
          const client = connections.get(clientId);
          if (client && client.roomId) {
            console.log(`Broadcasting drawing end from ${client.username} to room ${client.roomId}`);
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        case 'AI_IMAGE_GENERATED': {
          // Forward AI-generated image to room members only
          const client = connections.get(clientId);
          if (client && client.roomId) {
            console.log(`Broadcasting AI-generated image from ${client.username} to room ${client.roomId}`);
            broadcastToRoom(client.roomId, message, ws);
          }
          break;
        }
        
        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    const client = connections.get(clientId);
    
    if (client && client.userId) {
      console.log(`User disconnected: ${client.username} (${client.userId})`);
      
      // Remove user from their room
      if (client.roomId) {
        const room = rooms.get(client.roomId);
        if (room) {
          room.currentUsers = room.currentUsers.filter(user => user.id !== client.userId);
          
          // Notify other users in the room
          broadcastToRoom(client.roomId, {
            type: 'USER_LEFT',
            payload: { userId: client.userId }
          });
          
          // Broadcast room update to remaining users
          broadcastToRoom(client.roomId, {
            type: 'ROOM_UPDATED',
            payload: { room: room }
          });
          
          // Clean up empty private rooms
          if (room.type === 'private' && room.currentUsers.length === 0) {
            rooms.delete(client.roomId);
            console.log(`Deleted empty private room: ${client.roomId}`);
          }
        }
      }
    } else {
      console.log(`Client disconnected: ${clientId}`);
    }
    
    // Remove connection
    connections.delete(clientId);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
  });
});

// Helper function to generate a random color
function getRandomColor() {
  const colors = [
    '#FF5733', // Red-orange
    '#33FF57', // Green
    '#3357FF', // Blue
    '#FF33F5', // Pink
    '#33FFF5', // Cyan
    '#F5FF33', // Yellow
    '#FF9E33', // Orange
    '#9E33FF'  // Purple
  ];
  
  return colors[Math.floor(Math.random() * colors.length)];
}

// Helper function to generate room code
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper function to find room by code
function findRoomByCode(code) {
  for (const [roomId, room] of rooms) {
    if (room.code === code) {
      return { roomId, room };
    }
  }
  return null;
}

// Helper function to broadcast to room members only
function broadcastToRoom(roomId, message, excludeClient = null) {
  console.log(`=== BROADCAST TO ROOM DEBUG ===`);
  console.log(`Broadcasting to room: ${roomId}`);
  console.log(`Message type: ${message.type}`);
  
  const room = rooms.get(roomId);
  if (!room) {
    console.log(`Room ${roomId} not found!`);
    return;
  }
  
  console.log(`Room has ${room.currentUsers.length} users`);
  
  let messagesSent = 0;
  room.currentUsers.forEach(user => {
    connections.forEach((conn, clientId) => {
      if (conn.userId === user.id && conn.ws !== excludeClient && conn.ws.readyState === WebSocket.OPEN) {
        console.log(`Sending message to user ${user.name} (${user.id})`);
        conn.ws.send(JSON.stringify(message));
        messagesSent++;
      }
    });
  });
  
  console.log(`Messages sent: ${messagesSent}`);
  console.log(`===============================`);
}

// Start server
const PORT = process.env.PORT || 8081;
const HOST = process.env.HOST || '0.0.0.0'; // Explicitly bind to all interfaces
server.listen(PORT, HOST, () => {
  console.log(`WebSocket server and Express API are running on ${HOST}:${PORT}`);
}); 
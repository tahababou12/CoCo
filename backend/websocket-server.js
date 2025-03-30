const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

// Create HTTP server
const server = http.createServer();
const port = process.env.PORT || 8080;

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store for active connections and shapes
const connections = new Map();
const shapes = [];

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
        case 'JOIN_ROOM': {
          const { userId, username, position } = message.payload;
          const client = connections.get(clientId);
          
          // Update connection info
          client.userId = userId;
          client.username = username;
          client.position = position;
          
          console.log(`User joined: ${username} (${userId}) at position ${position}`);
          console.log(`Active users:`);
          
          // Print all active users
          connections.forEach((conn) => {
            if (conn.userId && conn.username) {
              console.log(`- ${conn.username} (${conn.userId}) at ${conn.position}`);
            }
          });
          
          // Check if position is already taken
          let positionTaken = false;
          connections.forEach((c) => {
            if (c.ws !== ws && c.position === position) {
              positionTaken = true;
            }
          });
          
          if (positionTaken) {
            console.log(`Position ${position} already taken, finding alternative...`);
            // Find an available position
            const takenPositions = new Set();
            connections.forEach((c) => {
              if (c.position) takenPositions.add(c.position);
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
          
          // Prepare user info to broadcast
          const userInfo = {
            id: userId,
            name: username,
            position: client.position,
            isActive: true,
            color
          };
          
          console.log(`Broadcasting new user to existing clients:`, userInfo);
          
          // Notify all clients that a new user has joined
          broadcast({
            type: 'USER_JOINED',
            payload: userInfo
          });
          
          // Notify new user about existing users
          connections.forEach((c) => {
            if (c.ws !== ws && c.userId && c.username) {
              const existingUserInfo = {
                id: c.userId,
                name: c.username,
                position: c.position,
                isActive: true,
                color: getRandomColor()
              };
              
              console.log(`Sending existing user to new client:`, existingUserInfo);
              
              ws.send(JSON.stringify({
                type: 'USER_JOINED',
                payload: existingUserInfo
              }));
            }
          });
          
          break;
        }
        
        case 'REQUEST_SYNC': {
          // Send all shapes to the requesting client
          ws.send(JSON.stringify({
            type: 'SYNC_SHAPES',
            payload: { shapes }
          }));
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
          
          // Simple broadcast to all other clients
          wss.clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(message));
            }
          });
          break;
        }
        
        case 'SHAPE_ADDED': {
          const { shape, userId } = message.payload;
          
          // Add shape to our collection
          shapes.push(shape);
          
          // Broadcast to all other clients
          broadcast(message, ws);
          break;
        }
        
        case 'SHAPE_UPDATED': {
          const { shapeId, updates, userId } = message.payload;
          
          // Update shape in our collection
          const shapeIndex = shapes.findIndex(s => s.id === shapeId);
          if (shapeIndex !== -1) {
            shapes[shapeIndex] = { ...shapes[shapeIndex], ...updates };
          }
          
          // Broadcast to all other clients
          broadcast(message, ws);
          break;
        }
        
        case 'SHAPES_DELETED': {
          const { shapeIds, userId } = message.payload;
          
          // Remove shapes from our collection
          for (const id of shapeIds) {
            const index = shapes.findIndex(s => s.id === id);
            if (index !== -1) {
              shapes.splice(index, 1);
            }
          }
          
          // Broadcast to all other clients
          broadcast(message, ws);
          break;
        }
        
        case 'HAND_TRACKING_STATUS': {
          // Forward hand tracking status to all clients
          broadcast(message, ws);
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
            
            // Forward the status update to all clients
            broadcast(message, ws);
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
      
      // Notify all clients that a user has left
      broadcast({
        type: 'USER_LEFT',
        payload: { userId: client.userId }
      });
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

// Start server
server.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
}); 
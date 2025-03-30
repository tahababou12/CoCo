from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import List, Dict, Any
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["general"])

# Store for active WebSocket connections
active_connections: List[WebSocket] = []

@router.get("/status")
async def get_status():
    """Get the API status"""
    return {
        "status": "ok",
        "active_connections": len(active_connections)
    }

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    await websocket.accept()
    active_connections.append(websocket)
    
    try:
        while True:
            # Wait for a message from this client
            data = await websocket.receive_text()
            
            try:
                # Parse the message as JSON
                message = json.loads(data)
                
                # Broadcast the message to all other connected clients
                for connection in active_connections:
                    if connection != websocket:
                        await connection.send_text(data)
                
            except json.JSONDecodeError:
                logger.error(f"Received invalid JSON: {data}")
                await websocket.send_json({"error": "Invalid JSON"})
                
    except WebSocketDisconnect:
        # Remove the connection when the client disconnects
        active_connections.remove(websocket) 
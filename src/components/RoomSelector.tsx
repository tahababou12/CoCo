import React, { useState, useEffect } from 'react';
import { Room, RoomType, UserPosition, WebSocketMessage } from '../types';
import { useWebSocket } from '../context/WebSocketContext';

interface RoomSelectorProps {
  onClose: () => void;
  onJoinRoom: (username: string, position: UserPosition, roomId?: string, roomCode?: string) => void;
}

const RoomSelector: React.FC<RoomSelectorProps> = ({ onClose, onJoinRoom }) => {
  const [activeTab, setActiveTab] = useState<'public' | 'private'>('public');
  const [username, setUsername] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<UserPosition>('top-left');
  const [roomCode, setRoomCode] = useState('');
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [createdRooms, setCreatedRooms] = useState<any[]>([]);
  const [pendingJoin, setPendingJoin] = useState<{ username: string; position: UserPosition } | null>(null);
  const [showRoomCodeModal, setShowRoomCodeModal] = useState(false);
  const [createdRoomData, setCreatedRoomData] = useState<{ name: string; code: string } | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  
  const webSocket = useWebSocket();

  const positionLabels: Record<UserPosition, string> = {
    'top-left': 'Top Left',
    'top-right': 'Top Right',
    'bottom-left': 'Bottom Left',
    'bottom-right': 'Bottom Right'
  };

  const availablePositions: UserPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

  // Initialize with the default public room that matches the server
  useEffect(() => {
    const defaultRooms: Room[] = [
      {
        id: 'default-public',
        name: 'Main Room',
        type: 'public',
        createdBy: 'System',
        createdAt: new Date(),
        maxUsers: 8,
        currentUsers: [],
        isActive: true
      }
    ];
    setAvailableRooms(defaultRooms);
    if (defaultRooms.length > 0) {
      setSelectedRoom(defaultRooms[0].id);
    }
  }, []);

  // Update room info when WebSocket context has current room data
  useEffect(() => {
    if (webSocket?.currentRoom) {
      setAvailableRooms(prevRooms => 
        prevRooms.map(room => 
          room.id === webSocket.currentRoom?.id 
            ? {
                ...room,
                currentUsers: webSocket.currentRoom.currentUsers || [],
                maxUsers: webSocket.currentRoom.maxUsers || room.maxUsers
              }
            : room
        )
      );
    }
  }, [webSocket?.currentRoom]);

  // Listen for room creation completion
  useEffect(() => {
    if (!webSocket?.socket) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        console.log('RoomSelector received message:', message.type, message.payload);
        
        if (message.type === 'ROOM_CREATED' && pendingJoin) {
          console.log('Room created, showing modal:', message.payload.room);
          console.log('Pending join data:', pendingJoin);
          
          const room = message.payload.room;
          if (room.code) {
            console.log('Showing room code modal with code:', room.code);
            // Show the room code modal instead of auto-joining
            setCreatedRoomData({
              name: room.name,
              code: room.code
            });
            setShowRoomCodeModal(true);
          } else {
            console.log('Room created but no code provided:', room);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    webSocket.socket.addEventListener('message', handleMessage);
    
    return () => {
      webSocket.socket?.removeEventListener('message', handleMessage);
    };
  }, [webSocket?.socket, pendingJoin, onJoinRoom, onClose]);

  // Generate 6-digit room code
  const generateRoomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleCreatePrivateRoom = () => {
    if (!username.trim() || !newRoomName.trim()) return;
    
    console.log('=== CREATING PRIVATE ROOM ===');
    console.log('Room name:', newRoomName.trim());
    console.log('Username:', username.trim());
    console.log('WebSocket state:', {
      isConnected: webSocket?.isConnected,
      isConnecting: webSocket?.isConnecting,
      socket: !!webSocket?.socket,
      socketReadyState: webSocket?.socket?.readyState,
      sendMessage: !!webSocket?.sendMessage
    });
    
    // Check if WebSocket is available and connected
    if (!webSocket) {
      console.error('WebSocket context not available');
      alert('Connection error. Please refresh the page and try again.');
      return;
    }
    
    if (!webSocket.isConnected) {
      console.log('WebSocket not connected, attempting to connect...');
      // Try to connect first
      webSocket.connect('temp-user', 'top-left');
      
      // Wait a moment for connection and try again
      setTimeout(() => {
        if (webSocket.isConnected) {
          console.log('WebSocket connected, retrying room creation...');
          handleCreatePrivateRoom();
        } else {
          alert('Unable to connect to server. Please try again.');
        }
      }, 1000);
      return;
    }
    
    // Store the join data for when the room is created
    setPendingJoin({
      username: username.trim(),
      position: selectedPosition
    });
    
    // Create the room on the server
    const roomData: WebSocketMessage = {
      type: 'CREATE_ROOM',
      payload: {
        userId: webSocket.currentUser?.id || `temp-${Date.now()}`,
        roomName: newRoomName.trim(),
        roomType: 'private',
        maxUsers: 4
      }
    };
    
    console.log('Sending room creation message:', roomData);
    
    try {
      webSocket.sendMessage(roomData);
      console.log('Room creation message sent successfully');
    } catch (error) {
      console.error('Error sending room creation message:', error);
      alert('Error creating room. Please try again.');
      return;
    }
    
    // Reset form
    setNewRoomName('');
    setIsCreatingRoom(false);
  };

  const handleJoinRoom = () => {
    if (!username.trim()) return;
    
    if (activeTab === 'public' && selectedRoom) {
      onJoinRoom(username, selectedPosition, selectedRoom);
    } else if (activeTab === 'private' && roomCode.trim()) {
      onJoinRoom(username, selectedPosition, undefined, roomCode.trim());
    }
  };

  const copyRoomCode = (code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
      console.log('Room code copied to clipboard');
    });
  };

  const handleConfirmRoom = () => {
    if (createdRoomData && pendingJoin) {
      // Join the created room
      onJoinRoom(pendingJoin.username, pendingJoin.position, undefined, createdRoomData.code);
      setPendingJoin(null);
      setShowRoomCodeModal(false);
      setCreatedRoomData(null);
      onClose(); // Close the room selector
    }
  };

  return (
    <>
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 mt-2 w-full max-w-sm">
      {/* Tab Selection */}
      <div className="flex mb-3 bg-gray-100 rounded-md p-0.5">
        <button
          onClick={() => setActiveTab('public')}
          className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
            activeTab === 'public'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Public
        </button>
        <button
          onClick={() => setActiveTab('private')}
          className={`flex-1 py-1.5 px-2 rounded text-xs font-medium transition-colors ${
            activeTab === 'private'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          Private
        </button>
      </div>

      <div className="space-y-2">
        {/* Common Fields */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Your Name</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
            placeholder="Enter your name"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Position</label>
          <select
            value={selectedPosition}
            onChange={(e) => setSelectedPosition(e.target.value as UserPosition)}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            {availablePositions.map((pos) => (
              <option key={pos} value={pos}>{positionLabels[pos]}</option>
            ))}
          </select>
        </div>

        {/* Public Rooms Tab Content */}
        {activeTab === 'public' && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Available Rooms</label>
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
            >
              <option value="">Select a room...</option>
              {availableRooms.filter(room => room.type === 'public').map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name} ({room.currentUsers.length}/{room.maxUsers || 4})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Private Rooms Tab Content */}
        {activeTab === 'private' && (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Private Room Code</label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs text-center focus:outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="6-digit code"
                maxLength={6}
              />
              <p className="text-xs text-gray-400 mt-0.5 text-center">
                Enter 6-digit code to join private room
              </p>
            </div>

            {/* Divider */}
            <div className="flex items-center">
              <div className="flex-grow border-t border-gray-200"></div>
              <span className="px-3 text-xs text-gray-500">OR</span>
              <div className="flex-grow border-t border-gray-200"></div>
            </div>

            {/* Create Private Room Section */}
            <div className="border border-gray-200 rounded p-2 bg-gray-50">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">Create New Room</span>
                <button
                  onClick={() => setIsCreatingRoom(!isCreatingRoom)}
                  className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                    isCreatingRoom
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                  }`}
                >
                  {isCreatingRoom ? 'Cancel' : 'Create'}
                </button>
              </div>
              
              {isCreatingRoom && (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                    placeholder="Enter room name"
                  />
                  <button
                    onClick={handleCreatePrivateRoom}
                    disabled={!username.trim() || !newRoomName.trim()}
                    className="w-full bg-purple-600 text-white py-1.5 px-2 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
                    title={
                      !username.trim() ? 'Please enter your name above' :
                      !newRoomName.trim() ? 'Please enter a room name' :
                      ''
                    }
                  >
                    Create & Join
                  </button>
                </div>
              )}
            </div>

            {/* Show Created Private Rooms */}
            {createdRooms.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Your Private Rooms</label>
                <div className="space-y-2">
                  {createdRooms.map((room) => (
                    <div key={room.id} className="border border-gray-200 rounded-md p-2 bg-white">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-sm text-gray-800">{room.name}</div>
                          <div className="text-xs text-gray-500 font-mono">Code: {room.code}</div>
                        </div>
                        <button
                          onClick={() => copyRoomCode(room.code!)}
                          className="bg-purple-100 text-purple-600 hover:bg-purple-200 px-2 py-1 rounded text-xs font-medium transition-colors"
                          title="Copy room code"
                        >
                          Copy Code
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex space-x-1 mt-3">
          <button
            onClick={handleJoinRoom}
            disabled={
              !username.trim() || 
              (activeTab === 'public' && !selectedRoom) ||
              (activeTab === 'private' && (!roomCode.trim() || roomCode.length !== 6))
            }
            className="flex-1 bg-purple-600 text-white py-1.5 px-2 rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium"
            title={
              !username.trim() ? 'Please enter your name' :
              activeTab === 'public' && !selectedRoom ? 'Please select a room' :
              activeTab === 'private' && !roomCode.trim() ? 'Please enter a room code' :
              activeTab === 'private' && roomCode.length !== 6 ? 'Room code must be 6 digits' :
              ''
            }
          >
            {activeTab === 'public' ? 'Join Public' : 'Join Private'}
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>

    {/* Room Code Modal */}
    {showRoomCodeModal && createdRoomData && (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl">
          <div className="text-center">
            <div className="mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Room Created!</h2>
              <p className="text-gray-600">Your private room "{createdRoomData.name}" has been created.</p>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">Room Code</label>
              <div className="flex items-center justify-center space-x-2">
                <div className="bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg px-6 py-4">
                  <span className="text-3xl font-mono font-bold text-purple-600 tracking-wider">
                    {createdRoomData.code}
                  </span>
                </div>
                <button
                  onClick={() => copyRoomCode(createdRoomData.code)}
                  className="p-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  title="Copy room code"
                >
                  {copySuccess ? (
                    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
              {copySuccess && (
                <p className="text-sm text-green-600 mt-2">Code copied to clipboard!</p>
              )}
            </div>
            
            <div className="text-sm text-gray-500 mb-6">
              Share this code with others to invite them to your private room.
            </div>
            
            <button
              onClick={handleConfirmRoom}
              className="w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors font-medium"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default RoomSelector; 
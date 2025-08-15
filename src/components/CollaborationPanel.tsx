import React, { useState, useRef, useEffect } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { useDrawing } from '../context/DrawingContext';
import { UserPosition } from '../types';

const CollaborationPanel: React.FC = () => {
  const { state } = useDrawing();
  const webSocketContext = useWebSocket();
  
  // Safely access properties with fallbacks
  const connect = webSocketContext?.connect || (() => {});
  const disconnect = webSocketContext?.disconnect || (() => {});
  const isConnected = webSocketContext?.isConnected || false;
  const connectionError = '';
  const availablePositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].filter(
    pos => !state.collaborators.some(user => user.position === pos) || 
           (webSocketContext?.currentUser && webSocketContext.currentUser.position === pos)
  ) as UserPosition[];
  const currentUsername = webSocketContext?.currentUser?.name || '';
  const userPosition = webSocketContext?.currentUser?.position || null;
  
  // Debug logging
  useEffect(() => {
    console.log("=== Collaboration Panel Status ===");
    console.log("Connection status:", isConnected);
    console.log("Current user:", webSocketContext?.currentUser);
    console.log("Collaborators:", state.collaborators);
    console.log("================================");
  }, [isConnected, webSocketContext?.currentUser, state.collaborators]);
  
  const [username, setUsername] = useState('');
  const [selectedPosition, setSelectedPosition] = useState<UserPosition>('top-left');
  const [showJoinForm, setShowJoinForm] = useState(false);
  
  // Reset localStorage settings to make the panel visible
  useEffect(() => {
    localStorage.removeItem('collaborationPanelPosition');
    localStorage.removeItem('collaborationPanelMinimized');
  }, []);
  
  // Always expanded
  const [minimized, setMinimized] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPositionRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  
  // Use a ref to store the panel position for smoother updates
  const panelPositionRef = useRef({ x: window.innerWidth - 300, y: 500 });
  
  // For React state updates (less frequent)
  const [panelPosition, setPanelPosition] = useState({ x: window.innerWidth - 300, y: 500 });
  
  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim()) {
      console.log(`Attempting to connect as ${username.trim()} at position ${selectedPosition}`);
      connect(username.trim(), selectedPosition);
      setShowJoinForm(false);
    }
  };
  
  const handleDisconnect = () => {
    console.log("Disconnecting from collaboration session");
    disconnect();
  };
  
  // Toggle minimize state and save to localStorage
  const toggleMinimize = () => {
    const newState = !minimized;
    setMinimized(newState);
    localStorage.setItem('collaborationPanelMinimized', JSON.stringify(newState));
  };
  
  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!panelRef.current || !headerRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Get current panel position
    const rect = panelRef.current.getBoundingClientRect();
    
    // Record where in the header the user clicked
    dragStartPositionRef.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
    
    // Set dragging state
    setIsDragging(true);
  };
  
  // Handle touch events for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!panelRef.current || !headerRef.current) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = panelRef.current.getBoundingClientRect();
    
    // Record where in the header the user touched
    dragStartPositionRef.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
    
    setIsDragging(true);
  };
  
  // Handle mouse movement during drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !panelRef.current) return;
      
      // Calculate new position
      const newX = e.clientX - dragStartPositionRef.current.x;
      const newY = e.clientY - dragStartPositionRef.current.y;
      
      // Apply bounds checking
      const maxX = window.innerWidth - panelRef.current.offsetWidth;
      const maxY = window.innerHeight - panelRef.current.offsetHeight;
      const boundedX = Math.max(0, Math.min(maxX, newX));
      const boundedY = Math.max(0, Math.min(maxY, newY));
      
      // Update position directly in the DOM for smoother movement
      if (panelRef.current) {
        panelRef.current.style.left = `${boundedX}px`;
        panelRef.current.style.top = `${boundedY}px`;
      }
      
      // Update the ref so we have the current position
      panelPositionRef.current = { x: boundedX, y: boundedY };
    };
    
    const handleMouseUp = () => {
      if (isDragging) {
        // Update React state to match the final position from the ref
        setPanelPosition(panelPositionRef.current);
        
        // Save to localStorage
        localStorage.setItem('collaborationPanelPosition', JSON.stringify({
          x: `${panelPositionRef.current.x}px`,
          y: `${panelPositionRef.current.y}px`
        }));
        
        setIsDragging(false);
      }
    };
    
    // Add listeners
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove, { passive: false });
      window.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  // Handle touch movement
  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || !panelRef.current) return;
      
      e.preventDefault();
      const touch = e.touches[0];
      
      // Calculate new position
      const newX = touch.clientX - dragStartPositionRef.current.x;
      const newY = touch.clientY - dragStartPositionRef.current.y;
      
      // Apply bounds checking
      const maxX = window.innerWidth - panelRef.current.offsetWidth;
      const maxY = window.innerHeight - panelRef.current.offsetHeight;
      const boundedX = Math.max(0, Math.min(maxX, newX));
      const boundedY = Math.max(0, Math.min(maxY, newY));
      
      // Update position directly in the DOM for smoother movement
      panelRef.current.style.left = `${boundedX}px`;
      panelRef.current.style.top = `${boundedY}px`;
      
      // Update the ref
      panelPositionRef.current = { x: boundedX, y: boundedY };
    };
    
    const handleTouchEnd = () => {
      if (isDragging) {
        // Update React state
        setPanelPosition(panelPositionRef.current);
        
        // Save to localStorage
        localStorage.setItem('collaborationPanelPosition', JSON.stringify({
          x: `${panelPositionRef.current.x}px`,
          y: `${panelPositionRef.current.y}px`
        }));
        
        setIsDragging(false);
      }
    };
    
    if (isDragging) {
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }
    
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging]);
  
  // Set initial position on mount
  useEffect(() => {
    if (panelRef.current) {
      panelRef.current.style.left = `${panelPosition.x}px`;
      panelRef.current.style.top = `${panelPosition.y}px`;
    }
  }, []);
  
  // Reset panel to default position
  const resetPosition = () => {
    const defaultPosition = { x: window.innerWidth - 300, y: 200 };
    
    // Update DOM directly
    if (panelRef.current) {
      panelRef.current.style.left = `${defaultPosition.x}px`;
      panelRef.current.style.top = `${defaultPosition.y}px`;
    }
    
    // Update ref and state
    panelPositionRef.current = defaultPosition;
    setPanelPosition(defaultPosition);
    
    // Save to localStorage
    localStorage.setItem('collaborationPanelPosition', JSON.stringify({
      x: `${defaultPosition.x}px`,
      y: `${defaultPosition.y}px`
    }));
  };
  
  const positionLabels: Record<UserPosition, string> = {
    'top-left': 'Top Left',
    'top-right': 'Top Right',
    'bottom-left': 'Bottom Left',
    'bottom-right': 'Bottom Right'
  };
  
  const renderUserIndicator = (user: typeof state.collaborators[0]) => {
    return (
      <div 
        key={user.id}
        className="flex items-center bg-white/80 rounded-md p-2 mb-2 shadow-sm"
      >
        <div 
          className="w-3 h-3 rounded-full mr-2"
          style={{ backgroundColor: user.color }}
        />
        <span className="text-xs font-medium">{user.name}</span>
        <span className="text-xs text-gray-500 ml-auto">{positionLabels[user.position as UserPosition]}</span>
      </div>
    );
  };
  
  return (
    <div 
      ref={panelRef}
      className="fixed bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-purple-200 p-4 z-50 transition-all duration-300"
      style={{ 
        cursor: isDragging ? 'grabbing' : 'default',
        willChange: 'transform, left, top',
        transform: 'translate3d(0,0,0)', // Hardware acceleration hint
        touchAction: 'none', // Disable browser handling of touch events
        left: `${panelPosition.x}px`,
        top: `${panelPosition.y}px`,
        pointerEvents: 'auto',
        width: minimized ? 'auto' : '280px',
        height: 'auto',
        maxHeight: '80vh',
        overflow: 'auto',
        boxSizing: 'border-box'
      }}
    >
      <div 
        ref={headerRef}
        className="text-sm font-bold mb-3 flex justify-between items-center cursor-grab active:cursor-grabbing bg-gradient-to-r from-purple-50 to-indigo-50 p-3 rounded-lg border border-purple-200 select-none shadow-sm"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="flex items-center">
          <div className="w-5 h-5 mr-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full flex items-center justify-center">
          <svg 
              className="w-3 h-3 text-white" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <circle cx="8" cy="6" r="1" />
            <circle cx="8" cy="12" r="1" />
            <circle cx="8" cy="18" r="1" />
            <circle cx="16" cy="6" r="1" />
            <circle cx="16" cy="12" r="1" />
            <circle cx="16" cy="18" r="1" />
          </svg>
          </div>
          {!minimized && <span className="text-purple-800 font-semibold">Collaboration</span>}
        </div>
        
        <div className="flex items-center space-x-2">
          {!minimized && (
            <button
              onClick={() => setMinimized(true)}
              className="w-6 h-6 rounded-md bg-purple-100 hover:bg-purple-200 text-purple-600 flex items-center justify-center transition-colors"
              title="Minimize"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
          )}
          
          {minimized && (
            <button
              onClick={() => setMinimized(false)}
              className="w-6 h-6 rounded-md bg-purple-100 hover:bg-purple-200 text-purple-600 flex items-center justify-center transition-colors"
              title="Expand"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
          
          <button 
            onClick={isConnected ? disconnect : connect}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
              isConnected 
                ? 'bg-red-100 hover:bg-red-200 text-red-600' 
                : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-600'
            }`}
            title={isConnected ? "Disconnect" : "Connect"}
          >
            {isConnected ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>
      </div>
      
      {!minimized && (
        <>
          {/* Connection Status */}
          <div className="mb-4 p-3 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-purple-700">Status</span>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
            </div>
            <div className="text-xs text-purple-600">
              {isConnected ? 'Connected to collaboration server' : 'Disconnected from collaboration server'}
            </div>
          </div>

          {/* Current User Info */}
          {currentUsername && (
            <div className="mb-4 p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg border border-purple-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700">You</span>
                <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                  {positionLabels[userPosition as UserPosition] || 'Unknown'}
                </span>
              </div>
              <div className="text-sm font-semibold text-purple-800">{currentUsername}</div>
            </div>
          )}
          
          {/* Other Collaborators */}
          {state.collaborators.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-purple-700 mb-2">Collaborators</h3>
              <div className="space-y-2">
                {state.collaborators.map((user, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-white rounded-lg border border-purple-100">
                    <span className="text-sm text-purple-800">{user.name}</span>
                    <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                      {positionLabels[user.position as UserPosition]}
                    </span>
                  </div>
                ))}
              </div>
                </div>
          )}

          {/* Join Form */}
          {!currentUsername && (
            showJoinForm ? (
              <form onSubmit={handleConnect} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    placeholder="Enter your name"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-purple-700 mb-1">Position</label>
                  <select
                    value={selectedPosition}
                    onChange={(e) => setSelectedPosition(e.target.value as UserPosition)}
                    className="w-full px-3 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  >
                    {availablePositions.map(pos => (
                      <option key={pos} value={pos}>{positionLabels[pos]}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold py-2 px-4 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg"
                  >
                    Join Session
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJoinForm(false)}
                    className="px-4 py-2 text-sm font-medium text-purple-600 bg-purple-100 rounded-lg hover:bg-purple-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowJoinForm(true)}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-semibold py-3 px-4 rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-md hover:shadow-lg"
              >
                Start Collaborating
              </button>
            )
          )}
        </>
      )}
    </div>
  );
};

export default CollaborationPanel; 
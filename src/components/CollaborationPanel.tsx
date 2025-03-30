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
  const panelPositionRef = useRef({ x: 20, y: 80 });
  
  // For React state updates (less frequent)
  const [panelPosition, setPanelPosition] = useState({ x: 20, y: 80 });
  
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
    const defaultPosition = { x: 20, y: 80 };
    
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
      className="fixed bg-white/95 rounded-lg shadow-lg p-3 z-50 transition-none"
      style={{ 
        cursor: isDragging ? 'grabbing' : 'default',
        willChange: 'transform, left, top',
        transform: 'translate3d(0,0,0)', // Hardware acceleration hint
        touchAction: 'none', // Disable browser handling of touch events
        left: `${panelPosition.x}px`,
        top: `${panelPosition.y}px`,
        pointerEvents: 'auto',
        width: minimized ? 'auto' : '260px',
        height: 'auto',
        maxHeight: '80vh',
        overflow: 'auto',
        border: '2px solid #8b5cf6',
        boxSizing: 'border-box'
      }}
    >
      <div 
        ref={headerRef}
        className="text-sm font-bold mb-2 flex justify-between items-center cursor-grab active:cursor-grabbing bg-purple-100 p-2 rounded-md select-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        <div className="flex items-center">
          <svg 
            className="w-4 h-4 mr-1.5 text-purple-500" 
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
          {!minimized && <span className="text-purple-800">Collaboration</span>}
        </div>
        
        <div className="flex items-center">
          {!minimized && (
            <>
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} mr-1`} />
              <span className="text-xs text-gray-500 mr-2">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </>
          )}
          
          {/* Minimize/Maximize toggle button */}
          <button 
            onClick={toggleMinimize} 
            className="text-gray-500 hover:text-gray-700 focus:outline-none ml-1"
            title={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8h16M4 16h16"></path>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            )}
          </button>
          
          {/* Reset position button */}
          {!minimized && (
            <button
              onClick={resetPosition}
              className="text-gray-500 hover:text-gray-700 focus:outline-none ml-1"
              title="Reset Position"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {!minimized && (
        <>
          {connectionError && (
            <div className="bg-red-100 text-red-700 p-2 rounded text-xs mb-2">
              {connectionError}
            </div>
          )}
          
          {isConnected ? (
            <>
              <div className="mb-3 text-xs text-gray-700">
                You are connected as <span className="font-semibold">{currentUsername}</span> in position <span className="font-semibold">{userPosition && positionLabels[userPosition as UserPosition]}</span>
              </div>
              
              {state.collaborators.length > 0 ? (
                <div className="mb-3">
                  <div className="text-xs font-medium mb-1 text-gray-700">Other Users:</div>
                  {state.collaborators.map(renderUserIndicator)}
                </div>
              ) : (
                <div className="text-xs text-gray-500 mb-3">No other users connected.</div>
              )}
              
              <button
                onClick={handleDisconnect}
                className="w-full bg-red-500 text-white text-xs py-1.5 px-2 rounded hover:bg-red-600 transition-colors"
              >
                Disconnect
              </button>
            </>
          ) : (
            showJoinForm ? (
              <form onSubmit={handleConnect} className="space-y-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Your Name:</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full text-xs p-1.5 border border-gray-300 rounded"
                    placeholder="Enter your name"
                    required
                  />
                </div>
                
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Position:</label>
                  <select
                    value={selectedPosition}
                    onChange={(e) => setSelectedPosition(e.target.value as UserPosition)}
                    className="w-full text-xs p-1.5 border border-gray-300 rounded"
                  >
                    {availablePositions.map((pos: UserPosition) => (
                      <option key={pos} value={pos}>{positionLabels[pos]}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex space-x-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 bg-green-500 text-white text-xs py-1.5 px-2 rounded hover:bg-green-600 transition-colors"
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJoinForm(false)}
                    className="flex-1 bg-gray-300 text-gray-700 text-xs py-1.5 px-2 rounded hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowJoinForm(true)}
                className="w-full bg-purple-600 text-white text-sm font-bold py-2 px-3 rounded hover:bg-purple-700 transition-colors"
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
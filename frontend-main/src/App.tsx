import React, { useState, useCallback, useEffect, useMemo } from 'react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import Header from './components/Header'
import CollaborationPanel from './components/CollaborationPanel'
import AIAssistant from './components/AIAssistant'
import UserWebcam from './components/UserWebcam'
import SimpleWebcam from './components/SimpleWebcam'
import UserCursor from './components/UserCursor'
import { DrawingProvider } from './context/DrawingContext'
import { WebSocketProvider } from './context/WebSocketContext'
import { useDrawing } from './context/DrawingContext'
import { useWebSocket } from './context/WebSocketContext'
import { ShapesProvider } from './ShapesContext'

// Wrapper component for webcam displays
const WebcamDisplays: React.FC = () => {
  const { state } = useDrawing();
  const webSocket = useWebSocket();
  
  return (
    <>
      {/* Display webcams of remote users */}
      {Object.entries(state.remoteStreams).map(([userId, stream]) => {
        const user = state.collaborators.find(c => c.id === userId);
        if (!user || !stream) return null;
        
        return (
          <UserWebcam
            key={userId}
            stream={stream}
            username={user.name}
            position={user.position}
          />
        );
      })}
      
      {/* Display local webcam if sharing */}
      {webSocket?.sharedWebcamStream && state.currentUser && (
        <UserWebcam
          stream={webSocket.sharedWebcamStream}
          username={`${state.currentUser.name} (You)`}
          position={state.currentUser.position}
          mirrored={true}
        />
      )}
    </>
  );
};

const App: React.FC = () => {
  const [showCocoify, setShowCocoify] = useState(false);

  const toggleCocoify = () => {
    setShowCocoify(!showCocoify);
  };

  return (
    <DrawingProvider>
      <WebSocketProvider>
        <ShapesProvider>
          <AppContent 
            showCocoify={showCocoify} 
            toggleCocoify={toggleCocoify}
          />
        </ShapesProvider>
      </WebSocketProvider>
    </DrawingProvider>
  )
}

// Inner component with access to contexts
const AppContent: React.FC<{
  showCocoify: boolean;
  toggleCocoify: () => void;
}> = ({ showCocoify, toggleCocoify }) => {
  const webSocket = useWebSocket();
  
  // Simple direct cursor movement handler for reliable tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (webSocket?.isConnected && webSocket?.sendCursorMove) {
      webSocket.sendCursorMove({ x: e.clientX, y: e.clientY });
    }
  }, [webSocket]);

  return (
    <div 
      id="app-container"
      className="flex flex-col h-screen bg-neutral-50 text-neutral-800 overflow-hidden" 
      style={{ touchAction: 'none' }}
      onMouseMove={handleMouseMove}
    >
      <Header 
        onToggleAI={toggleCocoify}
        showAIAssistant={showCocoify}
      />
      <div className="flex-1 overflow-hidden relative">
        <Canvas />
        <Toolbar />
        <SimpleWebcam />
        <CollaborationPanel />
        <WebcamDisplays />
        <CollaboratorCursors />
        {showCocoify && <AIAssistant isOpen={showCocoify} onClose={toggleCocoify} />}
      </div>
    </div>
  );
};

// Component to display all collaborator cursors
const CollaboratorCursors: React.FC = () => {
  const { state } = useDrawing();
  
  // Don't use memoization for now to ensure cursors always update
  return (
    <>
      {state.collaborators.map(user => (
        <UserCursor key={user.id} user={user} />
      ))}
    </>
  );
};

export default App

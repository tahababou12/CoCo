import React, { useState, useCallback } from 'react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import Header from './components/Header'
import HandDrawing from './components/HandDrawing'
import ToastContainer from './components/ToastContainer'
import Storyboard from './components/Storyboard'
import { DrawingProvider } from './context/DrawingContext'
import { HandGestureProvider } from './context/HandGestureContext'

import CollaborationPanel from './components/CollaborationPanel'
import UserWebcam from './components/UserWebcam'
import SimpleWebcam from './components/SimpleWebcam'
import UserCursor from './components/UserCursor'
import { WebSocketProvider } from './context/WebSocketContext'
import { useDrawing } from './context/DrawingContext'
import { useWebSocket } from './context/WebSocketContext'

import { useAuth0 } from '@auth0/auth0-react';
import { withAuthenticationRequired } from '@auth0/auth0-react';
import LoginButton from './components/LoginButton';
import PostLoginAuth from './components/PostLoginAuth';

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

// Component to display all collaborator cursors
const CollaboratorCursors: React.FC = () => {
  const { state } = useDrawing();
  
  return (
    <>
      {state.collaborators.map(user => (
        <UserCursor key={user.id} user={user} />
      ))}
    </>
  );
};

function ProtectedApp() {
  const [showCocoify, setShowCocoify] = useState(false);
  const [showStoryboard, setShowStoryboard] = useState(false);
  const webSocket = useWebSocket();

  const toggleCocoify = () => {
    setShowCocoify(!showCocoify);
  };

  const toggleStoryboard = () => {
    setShowStoryboard(!showStoryboard);
  };

  // Simple direct cursor movement handler for reliable tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (webSocket?.isConnected && webSocket?.sendCursorMove) {
      webSocket.sendCursorMove({ x: e.clientX, y: e.clientY });
    }
  }, [webSocket]);

  return (
    <DrawingProvider>
      <WebSocketProvider>
        <HandGestureProvider>
          <div 
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
              <HandDrawing />
              <SimpleWebcam />
              <CollaborationPanel />
              <WebcamDisplays />
              <CollaboratorCursors />
              
              {/* Video generation button - positioned in the middle-right */}
              <button
                className="fixed right-4 top-1/2 transform -translate-y-1/2 z-50 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded-lg shadow-lg flex items-center transition-transform hover:scale-105"
                onClick={toggleStoryboard}
                style={{ boxShadow: '0 4px 12px rgba(147, 51, 234, 0.3)' }}
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Storyboard
              </button>
              
              {showCocoify && (
                <div className="absolute inset-0 z-50 bg-white bg-opacity-90">
                  <div className="container mx-auto p-4 h-full">
                    <h2 className="text-xl font-bold mb-4">AI Assistant</h2>
                    <button 
                      className="absolute top-4 right-4 p-2"
                      onClick={toggleCocoify}
                    >
                      Close
                    </button>
                    <div className="bg-gray-100 rounded-lg p-4 h-5/6 overflow-auto">
                      {/* AI Assistant content would go here */}
                      <p>AI Assistant coming soon...</p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Storyboard modal */}
              <Storyboard isOpen={showStoryboard} onClose={() => setShowStoryboard(false)} />
            </div>
            <ToastContainer position="bottom-right" />
          </div>
        </HandGestureProvider>
      </WebSocketProvider>
    </DrawingProvider>
  );
};

// Wrap the protected component with authentication
const ProtectedAppWithAuth = withAuthenticationRequired(ProtectedApp);

function App() {
  const { isAuthenticated } = useAuth0();

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center space-y-8">
          {/* Logo and Title */}
          <div className="space-y-4">
            <div className="w-20 h-20 rounded-full bg-purple-600 flex items-center justify-center mx-auto">
              <span className="text-3xl font-bold text-white">C</span>
            </div>
            <h1 className="text-4xl font-bold text-neutral-800">CoCo</h1>
            <p className="text-lg text-neutral-500">Create, collaborate, and share your drawings</p>
          </div>

          {/* Login Button */}
          <div className="pt-4">
            <LoginButton />
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-2xl mx-auto pt-8">
            <div className="p-4">
              <div className="text-purple-600 mb-2">🎨</div>
              <h3 className="font-medium text-neutral-800">Draw Freely</h3>
              <p className="text-sm text-neutral-500">Express your creativity with our intuitive drawing tools</p>
            </div>
            <div className="p-4">
              <div className="text-purple-600 mb-2">🤝</div>
              <h3 className="font-medium text-neutral-800">Collaborate</h3>
              <p className="text-sm text-neutral-500">Work together in real-time with others</p>
            </div>
            <div className="p-4">
              <div className="text-purple-600 mb-2">✨</div>
              <h3 className="font-medium text-neutral-800">Hand Gestures</h3>
              <p className="text-sm text-neutral-500">Draw naturally with hand tracking support</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PostLoginAuth />
      <ProtectedAppWithAuth />
    </>
  );
}

export default App;

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
import { ShapesProvider } from './ShapesContext'
import { addPointToPath, getSmoothedCursorPosition } from './utils/cursorUtils'
import { UserPosition } from './types'

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
        
        // Default to a position based on user ID (to handle Point vs UserPosition type issues)
        const defaultPosition: UserPosition = 
          userId.startsWith('1') ? 'top-left' : 
          userId.startsWith('2') ? 'top-right' : 
          userId.startsWith('3') ? 'bottom-left' : 'bottom-right';

        return (
          <UserWebcam
            key={userId}
            stream={stream}
            username={user.name}
            position={defaultPosition}
          />
        );
      })}

      {/* Display local webcam if sharing */}
      {webSocket?.sharedWebcamStream && state.currentUser && (
        <UserWebcam
          stream={webSocket.sharedWebcamStream}
          username={`${state.currentUser.name} (You)`}
          position={'top-right'}
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
  const [showStoryboard, setShowStoryboard] = useState(false);
  const webSocket = useWebSocket();

  const toggleStoryboard = () => {
    setShowStoryboard(!showStoryboard);
  };

  // Enhanced cursor movement handler with bezier curve interpolation
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (webSocket?.isConnected && webSocket?.sendCursorMove) {
      // Add the current point to our path history
      const currentPoint = { x: e.clientX, y: e.clientY };
      addPointToPath(currentPoint);
      
      // Get the smoothed position based on current and previous points
      const smoothedPoint = getSmoothedCursorPosition(currentPoint);
      
      // Send the smoothed position to other users
      webSocket.sendCursorMove(smoothedPoint);
    }
  }, [webSocket]);

  return (
    <div 
      className="flex flex-col h-screen bg-neutral-50 text-neutral-800 overflow-hidden"
      style={{ touchAction: 'none' }}
      onMouseMove={handleMouseMove}
    >
      <Header />
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
        
        {/* Storyboard modal */}
        <Storyboard isOpen={showStoryboard} onClose={() => setShowStoryboard(false)} />
      </div>
      <ToastContainer position="bottom-right" />
    </div>
  );
};

// Wrap the protected component with authentication
const ProtectedAppWithAuth = withAuthenticationRequired(ProtectedApp);

// No-auth version of the app for development/testing purposes
function NoAuthApp() {
  return (
    <DrawingProvider>
      <WebSocketProvider>
        <ShapesProvider>
          <HandGestureProvider>
            <ProtectedApp />
          </HandGestureProvider>
        </ShapesProvider>
      </WebSocketProvider>
    </DrawingProvider>
  );
}

function App() {
  // For disabling auth during development, set this to true
  const DISABLE_AUTH = false; // Set to false to enable authentication
  
  // Always call hooks at the top level, regardless of whether we use the results
  const { isAuthenticated, isLoading } = useAuth0();
  
  if (DISABLE_AUTH) {
    return <NoAuthApp />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-purple-50 via-white to-purple-50 overflow-hidden">
        {/* Enhanced decorative elements */}
        <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-br from-purple-600/10 to-purple-800/10 rounded-b-[100px] transform -skew-y-6"></div>
        <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-purple-600/5 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-purple-800/5 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-400/5 rounded-full blur-3xl animate-pulse delay-500"></div>

        <div className="flex-1 flex items-center justify-center px-4 relative">
          <div className="text-center space-y-12 max-w-5xl w-full">
            {/* Logo and Title */}
            <div className="space-y-6">
              <div className="relative">
                <div className="w-32 h-32 rounded-[2rem] bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center mx-auto shadow-2xl transform hover:scale-105 transition-all duration-300">
                  <span className="text-6xl font-bold text-white">C</span>
                </div>
                {/* Enhanced decorative elements around logo */}
                <div className="absolute -top-4 -right-4 w-10 h-10 bg-yellow-400 rounded-full animate-pulse shadow-lg"></div>
                <div className="absolute -bottom-4 -left-4 w-8 h-8 bg-blue-400 rounded-full animate-pulse delay-100 shadow-lg"></div>
                <div className="absolute top-1/2 -right-10 w-6 h-6 bg-green-400 rounded-full animate-pulse delay-300 shadow-lg"></div>
                <div className="absolute top-1/2 -left-10 w-6 h-6 bg-pink-400 rounded-full animate-pulse delay-500 shadow-lg"></div>
              </div>
              <div>
                <h1 className="text-6xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-purple-800 animate-gradient-x">CoCo</h1>
                <p className="text-xl text-neutral-600 max-w-2xl mx-auto leading-relaxed">
                  Create, collaborate, and share your drawings with AI-powered enhancements. 
                  <span className="block mt-2 text-purple-600 font-medium">Where creativity meets technology.</span>
                </p>
              </div>
            </div>

            {/* Login Button */}
            <div>
              <LoginButton />
            </div>

            {/* Feature Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-white/90 backdrop-blur-md p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 border border-purple-100 group hover:-translate-y-1">
                <div className="text-5xl mb-4 transform group-hover:scale-110 transition-transform duration-300">🎨</div>
                <h3 className="text-xl font-semibold text-neutral-800 mb-2">Draw Freely</h3>
                <p className="text-neutral-600 leading-relaxed">Express your creativity with our intuitive drawing tools and hand gesture support</p>
              </div>
              <div className="bg-white/90 backdrop-blur-md p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 border border-purple-100 group hover:-translate-y-1">
                <div className="text-5xl mb-4 transform group-hover:scale-110 transition-transform duration-300">🤝</div>
                <h3 className="text-xl font-semibold text-neutral-800 mb-2">Real-time Collaboration</h3>
                <p className="text-neutral-600 leading-relaxed">Work together seamlessly with live cursor tracking and instant updates</p>
              </div>
              <div className="bg-white/90 backdrop-blur-md p-6 rounded-2xl shadow-xl hover:shadow-2xl transition-all duration-300 border border-purple-100 group hover:-translate-y-1">
                <div className="text-5xl mb-4 transform group-hover:scale-110 transition-transform duration-300">✨</div>
                <h3 className="text-xl font-semibold text-neutral-800 mb-2">AI Enhancement</h3>
                <p className="text-neutral-600 leading-relaxed">Transform your sketches into detailed artwork with our AI-powered tools</p>
              </div>
            </div>

            {/* Footer */}
            <div className="text-sm text-neutral-500">
              <p className="flex items-center justify-center gap-2">
                <span>Built with</span>
                <svg className="w-4 h-4 text-red-500 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
                <span>for creative collaboration</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <DrawingProvider>
        <WebSocketProvider>
          <ShapesProvider>
            <HandGestureProvider>
              {isAuthenticated && (
                <>
                  <ProtectedAppWithAuth />
                  <PostLoginAuth />
                </>
              )}
            </HandGestureProvider>
          </ShapesProvider>
        </WebSocketProvider>
      </DrawingProvider>
    </div>
  );
}

export default App;

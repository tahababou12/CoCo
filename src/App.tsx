import React from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { withAuthenticationRequired } from '@auth0/auth0-react';
import Canvas from './components/Canvas';
import Toolbar from './components/Toolbar';
import Header from './components/Header';
import HandDrawing from './components/HandDrawing';
import LoginButton from './components/LoginButton';
import { DrawingProvider } from './context/DrawingContext';
import { HandGestureProvider } from './context/HandGestureContext';

// Protected component that requires authentication
const ProtectedApp = () => {
  return (
    <DrawingProvider>
      <HandGestureProvider>
        <div className="flex flex-col h-screen bg-neutral-50 text-neutral-800 overflow-hidden" 
             style={{ touchAction: 'none' }}>
          <Header />
          <div className="flex-1 overflow-hidden relative">
            <Canvas />
            <Toolbar />
            <HandDrawing />
          </div>
        </div>
      </HandGestureProvider>
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

  return <ProtectedAppWithAuth />;
}

export default App;
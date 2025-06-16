import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import GestureAuth from './GestureAuth';
import LogoutButton from './LogoutButton';

const PostLoginAuth: React.FC = () => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [showGestureAuth, setShowGestureAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isGestureVerified, setIsGestureVerified] = useState(false);

  const resetGestureAuth = () => {
    console.log('Resetting gesture authentication...');
    setIsGestureVerified(false);
    setShowGestureAuth(true);
  };

  useEffect(() => {
    const checkGestureVerification = async () => {
      if (isAuthenticated) {
        try {
          const token = await getAccessTokenSilently();
          const decodedToken = JSON.parse(atob(token.split('.')[1]));
          console.log('Token claims:', decodedToken); // Debug log
          if (!isGestureVerified) {
            setShowGestureAuth(true);
          }
        } catch (error) {
          console.error('Error checking gesture verification status:', error);
          if (!isGestureVerified) {
            setShowGestureAuth(true);
          }
        }
        setIsLoading(false);
      }
    };

    checkGestureVerification();
  }, [isAuthenticated, getAccessTokenSilently, isGestureVerified]);

  const handleGestureSuccess = () => {
    console.log('Gesture verification successful');
    setIsGestureVerified(true);
    setTimeout(() => {
      setShowGestureAuth(false);
    }, 100);
  };

  const handleGestureFailure = () => {
    console.log('Gesture verification failed');
    setTimeout(() => {
      setShowGestureAuth(false);
    }, 100);
  };

  if (isAuthenticated && !isLoading && isGestureVerified) {
    return null;
  }

  if (isAuthenticated && !isLoading && !isGestureVerified) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 backdrop-blur-sm">
        <div className="bg-white rounded-xl p-8 w-full max-w-2xl relative shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Gesture Authentication</h2>
              <p className="text-gray-600">Complete the gesture sequence to verify your identity</p>
            </div>
            <button
              onClick={resetGestureAuth}
              className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Restart
            </button>
          </div>
          
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Instructions</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Position yourself in front of the camera</li>
              <li>Follow the gesture sequence shown below</li>
              <li>Complete all gestures to verify your identity</li>
            </ul>
          </div>

          {showGestureAuth && (
            <div className="relative">
              <GestureAuth
                onSuccess={handleGestureSuccess}
                onFailure={handleGestureFailure}
              />
            </div>
          )}

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Make sure you're in a well-lit environment</p>
            <p>Keep your hands visible to the camera</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default PostLoginAuth; 
import React, { useState, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import GestureAuth from './GestureAuth';
import LogoutButton from './LogoutButton';

const PostLoginAuth: React.FC = () => {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();
  const [showGestureAuth, setShowGestureAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkGestureVerification = async () => {
      if (isAuthenticated) {
        try {
          const token = await getAccessTokenSilently();
          const decodedToken = JSON.parse(atob(token.split('.')[1]));
          // Show gesture auth when requires_gesture_verification is true
          setShowGestureAuth(decodedToken.requires_gesture_verification);
        } catch (error) {
          console.error('Error checking gesture verification status:', error);
          // Fallback to showing gesture auth if we can't determine the status
          setShowGestureAuth(true);
        }
        setIsLoading(false);
      }
    };

    checkGestureVerification();
  }, [isAuthenticated, getAccessTokenSilently]);

  const handleGestureSuccess = async () => {
    try {
      const token = await getAccessTokenSilently();
      
      // Call your backend API to update the Auth0 user metadata
      await fetch('/api/complete-gesture-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      setShowGestureAuth(false);
    } catch (error) {
      console.error('Error updating verification status:', error);
    }
  };

  const handleGestureFailure = () => {
    setShowGestureAuth(false);
  };

  if (!isAuthenticated || isLoading) {
    return null;
  }

  if (showGestureAuth) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full relative">
          <div className="absolute top-4 right-4">
            <LogoutButton />
          </div>
          <h2 className="text-2xl font-bold mb-4 text-center">Gesture Authentication</h2>
          <GestureAuth
            onSuccess={handleGestureSuccess}
            onFailure={handleGestureFailure}
          />
        </div>
      </div>
    );
  }

  return null;
};

export default PostLoginAuth; 
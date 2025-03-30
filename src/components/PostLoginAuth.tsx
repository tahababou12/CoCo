import React, { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import GestureAuth from './GestureAuth';
import LogoutButton from './LogoutButton';

const PostLoginAuth: React.FC = () => {
  const { isAuthenticated } = useAuth0();
  const [showGestureAuth, setShowGestureAuth] = useState(true);

  const handleGestureSuccess = () => {
    setShowGestureAuth(false);
  };

  const handleGestureFailure = () => {
    setShowGestureAuth(false);
  };

  if (!isAuthenticated) {
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
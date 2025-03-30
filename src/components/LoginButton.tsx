import React, { useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import GestureAuth from "./GestureAuth";

const LoginButton = () => {
  const { loginWithRedirect } = useAuth0();
  const [showGestureAuth, setShowGestureAuth] = useState(false);

  const handleGestureSuccess = () => {
    setShowGestureAuth(false);
    loginWithRedirect();
  };

  const handleGestureFailure = () => {
    setShowGestureAuth(false);
  };

  if (showGestureAuth) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4 text-center">Gesture Authentication</h2>
          <GestureAuth
            onSuccess={handleGestureSuccess}
            onFailure={handleGestureFailure}
          />
          <button
            onClick={() => setShowGestureAuth(false)}
            className="mt-4 w-full px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button 
      onClick={() => setShowGestureAuth(true)}
      className="px-8 py-3 bg-purple-600 text-white rounded-full font-medium hover:bg-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
    >
      Get Started
    </button>
  );
};

export default LoginButton;
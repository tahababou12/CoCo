import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

const LoginButton = () => {
  const { loginWithRedirect } = useAuth0();

  return (
    <button 
      onClick={() => loginWithRedirect()}
      className="px-8 py-3 bg-purple-600 text-white rounded-full font-medium hover:bg-purple-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
    >
      Get Started
    </button>
  );
};

export default LoginButton;
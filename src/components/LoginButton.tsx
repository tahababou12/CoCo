import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

const LoginButton = () => {
  const { loginWithRedirect } = useAuth0();

  return (
    <button 
      onClick={() => loginWithRedirect()}
      className="group relative px-12 py-5 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-3xl font-semibold hover:from-purple-700 hover:to-purple-900 transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-105 text-xl flex items-center gap-3 mx-auto overflow-hidden"
    >
      {/* Multiple animated background effects */}
      <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-purple-600/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-purple-300/10 to-purple-500/10 translate-x-[100%] group-hover:translate-x-[-100%] transition-transform duration-1000 delay-300"></div>
      
      {/* Glow effect */}
      <div className="absolute inset-0 bg-purple-400/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
      
      <span className="relative">Get Started</span>
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-6 w-6 relative transform group-hover:translate-x-2 transition-transform duration-300" 
        viewBox="0 0 20 20" 
        fill="currentColor"
      >
        <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    </button>
  );
};

export default LoginButton;
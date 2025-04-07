import React from 'react';
import { User } from '../types';

interface UserCursorProps {
  user: User;
}

const UserCursor: React.FC<UserCursorProps> = ({ user }) => {
  // Handle various versions of user position data
  // Backward compatibility with cursor property
  const cursorPosition = user.cursor || user.position;
  
  // If user has no position data or is not active, don't render
  if ((!cursorPosition && !user.handPosition) || !user.isActive) {
    return null;
  }

  // Determine if this is a hand cursor or regular cursor
  const isHandCursor = user.handPosition && user.isHandTracking;
  const position = isHandCursor ? user.handPosition : cursorPosition;

  // Different styles for hand cursor vs regular cursor
  const cursorStyle: React.CSSProperties = {
    position: 'fixed',
    left: `${position?.x || 0}px`,
    top: `${position?.y || 0}px`,
    pointerEvents: 'none',
    zIndex: 9999,
    transform: 'translate(-50%, -50%)',
    transition: 'transform 0.1s ease, left 0.1s ease, top 0.1s ease',
  };

  return (
    <div style={cursorStyle}>
      {isHandCursor ? (
        // Hand cursor display
        <div className="flex flex-col items-center">
          <div 
            className="w-6 h-6 rounded-full border-2 border-dashed animate-pulse"
            style={{ 
              backgroundColor: `${user.color}20`, 
              borderColor: user.color 
            }}
          />
          <div 
            className="text-xs font-semibold px-1 rounded mt-1 whitespace-nowrap"
            style={{ 
              backgroundColor: `${user.color}40`, 
              color: user.color 
            }}
          >
            {user.name} ✋
          </div>
        </div>
      ) : (
        // Regular cursor display
        <div className="flex flex-col items-center">
          <div 
            className="w-4 h-4 transform rotate-45" 
            style={{ 
              backgroundColor: `${user.color}80`, 
              borderRadius: '0 50% 50% 50%' 
            }}
          />
          <div 
            className="text-xs font-semibold px-1 rounded mt-1 whitespace-nowrap"
            style={{ 
              backgroundColor: `${user.color}40`, 
              color: user.color 
            }}
          >
            {user.name}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserCursor; 
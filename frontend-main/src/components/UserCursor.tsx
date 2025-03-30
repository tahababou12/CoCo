import React from 'react';
import { User, Point } from '../types';

interface UserCursorProps {
  user: User;
}

const UserCursor: React.FC<UserCursorProps> = React.memo(({ user }) => {
  // Don't render if no cursor position
  if (!user.cursor) return null;

  return (
    <div 
      className="absolute pointer-events-none z-50"
      style={{ 
        left: `${user.cursor.x}px`, 
        top: `${user.cursor.y}px`,
        transform: 'translate(-50%, -50%)',
        position: 'fixed',
        willChange: 'transform, left, top',
      }}
    >
      <div className="flex flex-col items-center">
        <svg 
          width="20" 
          height="20" 
          viewBox="0 0 20 20" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
          style={{ filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.3))' }}
        >
          <path 
            d="M0 0L20 8L12 12L8 20L0 0Z" 
            fill={user.color} 
          />
        </svg>
        <div 
          className="mt-1 px-2 py-1 rounded text-xs text-white"
          style={{ 
            backgroundColor: user.color,
            transform: 'translateY(-5px)',
            whiteSpace: 'nowrap'
          }}
        >
          {user.name}
        </div>
      </div>
    </div>
  );
});

export default UserCursor; 
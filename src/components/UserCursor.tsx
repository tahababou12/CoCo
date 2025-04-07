import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';

interface UserCursorProps {
  user: User;
}

const UserCursor: React.FC<UserCursorProps> = ({ user }) => {
  // Create a ref to store previous positions for smooth animation
  const prevPositionsRef = useRef<{x: number, y: number}[]>([]);
  const [smoothPosition, setSmoothPosition] = useState({ x: 0, y: 0 });
  
  // Handle various versions of user position data
  // Backward compatibility with cursor property
  const cursorPosition = user.cursor || user.position;
  
  // Determine if this is a hand cursor or regular cursor
  const isHandCursor = user.handPosition && user.isHandTracking;
  const position = isHandCursor ? user.handPosition : cursorPosition;
  const isActive = (position && user.isActive) || false;

  // Use useEffect to apply smooth animation whenever the position changes
  useEffect(() => {
    if (!position) return;
    
    // Add current position to history
    const newPositions = [...prevPositionsRef.current, { x: position.x, y: position.y }];
    
    // Keep only last 5 positions for curve calculation
    if (newPositions.length > 5) {
      newPositions.shift();
    }
    
    prevPositionsRef.current = newPositions;
    
    // Calculate smooth position with bezier curve if we have enough points
    if (newPositions.length >= 3) {
      const p0 = newPositions[newPositions.length - 3];
      const p1 = newPositions[newPositions.length - 2];
      const p2 = newPositions[newPositions.length - 1];
      
      // Quadratic bezier calculation for smooth curve
      const t = 0.5; // Interpolation factor
      const oneMinusT = 1 - t;
      
      const smoothX = oneMinusT * oneMinusT * p0.x + 
                      2 * oneMinusT * t * p1.x + 
                      t * t * p2.x;
                      
      const smoothY = oneMinusT * oneMinusT * p0.y + 
                      2 * oneMinusT * t * p1.y + 
                      t * t * p2.y;
      
      setSmoothPosition({ x: smoothX, y: smoothY });
    } else {
      // Not enough points for curve, use last position
      setSmoothPosition({ x: position.x, y: position.y });
    }
  }, [position?.x, position?.y]);

  // If user has no position data or is not active, don't render
  if (!isActive) {
    return null;
  }

  // Apply offset corrections to fix cursor positioning
  // Adjust X position to the left by 8px to correct for right offset
  const correctedX = smoothPosition.x;

  return (
    <>
      {/* Fixed cursor point element */}
      <div 
        style={{
          position: 'fixed',
          left: `${correctedX}px`,
          top: `${smoothPosition.y}px`,
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      >
        {isHandCursor ? (
          // Hand cursor point with precise centering
          <div 
            style={{ 
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: `2px dashed ${user.color}`,
              backgroundColor: `${user.color}20`,
              animation: 'pulse 1.5s infinite',
              transform: 'translate(-50%, -50%)',
            }}
          />
        ) : (
          // Regular cursor arrow with precise positioning at the point tip
          <div 
            style={{ 
              width: '16px',
              height: '16px',
              backgroundColor: `${user.color}80`,
              borderRadius: '0 50% 50% 50%',
              transform: 'rotate(0deg) translateX(-2px)',
              position: 'relative',
              left: '-8px',
            }}
          />
        )}
      </div>

      {/* Username label below cursor */}
      <div 
        style={{
          position: 'fixed',
          left: `${correctedX}px`,
          top: `${smoothPosition.y + (isHandCursor ? 20 : 16)}px`,
          transform: 'translateX(-50%)',
          backgroundColor: `${user.color}40`,
          color: user.color,
          fontSize: '12px',
          fontWeight: 600,
          padding: '2px 4px',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      >
        {user.name}{isHandCursor ? ' ✋' : ''}
      </div>
    </>
  );
};

export default UserCursor; 
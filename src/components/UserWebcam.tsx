import React, { useEffect, useRef } from 'react';
import { UserPosition } from '../types';

interface UserWebcamProps {
  stream: MediaStream;
  username: string;
  position: UserPosition;
  mirrored?: boolean;
}

// Improved positioning for webcam feeds based on user positions
const positionStyles = {
  'top-left': {
    position: 'absolute',
    top: '80px',
    left: '20px',
  },
  'top-right': {
    position: 'absolute',
    top: '80px',
    right: '20px',
  },
  'bottom-left': {
    position: 'absolute',
    bottom: '100px',
    left: '20px',
  },
  'bottom-right': {
    position: 'absolute',
    bottom: '100px',
    right: '20px',
  }
};

const UserWebcam: React.FC<UserWebcamProps> = ({
  stream,
  username,
  position,
  mirrored = false
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      
      // Attempt to play immediately
      const playPromise = videoRef.current.play();
      
      // Handle play promise (browsers may reject autoplay)
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.error('Error playing video:', error);
        });
      }
    }
    
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);
  
  const positionStyle = positionStyles[position] as React.CSSProperties;
  
  // Determine position-specific styling with purple theme
  const borderColor = position === 'top-left' ? 'rgba(147, 51, 234, 0.8)' :      // Purple
                    position === 'top-right' ? 'rgba(236, 72, 153, 0.8)' :       // Pink
                    position === 'bottom-left' ? 'rgba(59, 130, 246, 0.8)' :      // Blue
                    'rgba(168, 85, 247, 0.8)';                                    // Purple variant
  
  return (
    <div 
      className="user-webcam"
      style={{
        ...positionStyle,
        zIndex: 1000,
        width: '160px',
        height: '120px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: `3px solid ${borderColor}`,
        boxShadow: `0 4px 12px ${borderColor}40`,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: mirrored ? 'scaleX(-1)' : 'none',
          borderRadius: '9px',
        }}
      />
      
      {/* Username overlay */}
      <div 
        style={{
          position: 'absolute',
          bottom: '0',
          left: '0',
          right: '0',
          background: `linear-gradient(transparent, ${borderColor})`,
          color: 'white',
          padding: '8px 12px',
          fontSize: '12px',
          fontWeight: '600',
          textAlign: 'center',
          borderRadius: '0 0 9px 9px',
        }}
      >
        {username}
      </div>
    </div>
  );
};

export default UserWebcam; 
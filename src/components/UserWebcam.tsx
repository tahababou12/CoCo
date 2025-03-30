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
  
  // Determine position-specific styling
  const borderColor = position === 'top-left' ? 'rgba(255, 87, 51, 0.8)' :
                    position === 'top-right' ? 'rgba(51, 255, 87, 0.8)' :
                    position === 'bottom-left' ? 'rgba(51, 87, 255, 0.8)' : 
                    'rgba(255, 51, 245, 0.8)';
  
  return (
    <div 
      className="user-webcam"
      style={{
        ...positionStyle,
        zIndex: 99,
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
        border: `2px solid ${borderColor}`,
      }}
    >
      <div 
        className="webcam-header"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '4px 8px',
          fontSize: '14px',
          textAlign: 'center',
          fontWeight: 'bold',
        }}
      >
        {username}
      </div>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        width={240}
        height={180}
        style={{
          transform: mirrored ? 'scaleX(-1)' : 'none',
          objectFit: 'cover',
          backgroundColor: '#000',
        }}
      />
    </div>
  );
};

export default UserWebcam; 
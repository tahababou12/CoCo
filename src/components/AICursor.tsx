import React from 'react';

interface AICursorProps {
  x: number;
  y: number;
  isDrawing: boolean;
  currentAction?: string;
}

const AICursor: React.FC<AICursorProps> = ({ x, y, isDrawing, currentAction }) => {
  return (
    <div
      className="ai-cursor"
      style={{
        position: 'absolute',
        left: x - 10, // Center the cursor
        top: y - 10,
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        backgroundColor: isDrawing ? '#FF6B6B' : '#3B82F6',
        border: '2px solid white',
        boxShadow: isDrawing 
          ? '0 0 15px rgba(255, 107, 107, 0.8)' 
          : '0 0 10px rgba(59, 130, 246, 0.8)',
        pointerEvents: 'none',
        zIndex: 1000,
        transition: 'all 0.1s ease-out',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        color: 'white',
        fontWeight: 'bold'
      }}
    >
      {isDrawing ? '🎨' : '🤖'}
      
      {/* Drawing status indicator */}
      {currentAction && (
        <div
          style={{
            position: 'absolute',
            top: '25px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '10px',
            whiteSpace: 'nowrap',
            zIndex: 1001
          }}
        >
          {currentAction}
        </div>
      )}
      
      {/* Drawing animation indicator */}
      {isDrawing && (
        <div
          style={{
            position: 'absolute',
            top: '-5px',
            right: '-5px',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#FFD700',
            animation: 'pulse 1s infinite'
          }}
        />
      )}
      
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default AICursor;

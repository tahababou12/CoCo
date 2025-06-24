import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

interface PrivateRoomDisplayProps {
  roomCode: string;
  roomName: string;
}

const PrivateRoomDisplay: React.FC<PrivateRoomDisplayProps> = ({ roomCode, roomName }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const toggleVisibility = () => {
    setIsVisible(!isVisible);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy room code:', err);
    }
  };

  const displayCode = isVisible ? roomCode : '••••••';

  return (
    <div className="absolute top-4 left-4 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[200px] z-50">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Private Room</span>
        <div className="flex items-center space-x-1">
          <button
            onClick={toggleVisibility}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title={isVisible ? 'Hide code' : 'Show code'}
          >
            {isVisible ? (
              <EyeOff className="w-3 h-3 text-gray-500" />
            ) : (
              <Eye className="w-3 h-3 text-gray-500" />
            )}
          </button>
          <button
            onClick={copyToClipboard}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Copy room code"
          >
            {copied ? (
              <Check className="w-3 h-3 text-green-500" />
            ) : (
              <Copy className="w-3 h-3 text-gray-500" />
            )}
          </button>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="text-sm font-medium text-gray-800 truncate" title={roomName}>
          {roomName}
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-500">Code:</span>
          <span className="font-mono text-sm font-bold text-purple-600 tracking-wider">
            {displayCode}
          </span>
        </div>
      </div>
      
      {copied && (
        <div className="mt-2 text-xs text-green-600 font-medium">
          Code copied to clipboard!
        </div>
      )}
    </div>
  );
};

export default PrivateRoomDisplay; 
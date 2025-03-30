import React, { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number; // in milliseconds
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose, duration = 3000 }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [onClose, duration]);

  const getBgColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      case 'info':
        return 'bg-blue-500';
      default:
        return 'bg-gray-700';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'info':
        return 'ℹ';
      default:
        return '';
    }
  };

  return (
    <div 
      className={`fixed bottom-4 right-4 z-50 flex items-center p-3 rounded-lg shadow-lg text-white ${getBgColor()} transform transition-all duration-300 ease-in-out`}
      style={{ minWidth: '250px', maxWidth: '350px' }}
    >
      <div className="mr-2 flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-white bg-opacity-25">
        {getIcon()}
      </div>
      <div className="flex-1">{message}</div>
      <button 
        onClick={onClose}
        className="ml-2 text-white hover:text-gray-200 focus:outline-none"
      >
        ✕
      </button>
    </div>
  );
};

export default Toast; 
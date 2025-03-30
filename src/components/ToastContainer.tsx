import React, { useState, useEffect, useCallback } from 'react';
import Toast, { ToastType } from './Toast';

// Define a toast notification structure
export interface ToastNotification {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

// Define props for the toast container
interface ToastContainerProps {
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
}

// Create a toast container component to manage multiple toasts
const ToastContainer: React.FC<ToastContainerProps> = ({ 
  position = 'bottom-right'
}) => {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  // Add a new toast notification
  const addToast = useCallback((toast: Omit<ToastNotification, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prevToasts => [...prevToasts, { ...toast, id }]);
    return id;
  }, []);

  // Remove a toast notification by ID
  const removeToast = useCallback((id: string) => {
    setToasts(prevToasts => prevToasts.filter(toast => toast.id !== id));
  }, []);

  // Expose methods globally
  useEffect(() => {
    // Create global showToast function
    window.showToast = (message: string, type: ToastType = 'info', duration?: number) => {
      return addToast({ message, type, duration });
    };

    // Cleanup
    return () => {
      // Use type assertion to handle the optional property error
      (window as Partial<Window>).showToast = undefined;
    };
  }, [addToast]);

  // Get position classes
  const getPositionClasses = () => {
    switch (position) {
      case 'top-right':
        return 'top-4 right-4';
      case 'top-left':
        return 'top-4 left-4';
      case 'bottom-left':
        return 'bottom-4 left-4';
      case 'bottom-right':
      default:
        return 'bottom-4 right-4';
    }
  };

  // No toasts, no render
  if (toasts.length === 0) return null;

  return (
    <div className={`fixed ${getPositionClasses()} z-50 flex flex-col gap-2`}>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
};

// Extend Window interface to include showToast method
declare global {
  interface Window {
    showToast: (message: string, type?: ToastType, duration?: number) => string;
  }
}

export default ToastContainer; 
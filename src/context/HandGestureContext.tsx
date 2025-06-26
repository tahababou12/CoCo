import React, { createContext, useContext, useState, ReactNode } from 'react';
import { HandGestureContextType, HandMode } from '../types/handTracking';

// Extended context type that includes state setters
interface HandGestureContextValue extends HandGestureContextType {
  setCurrentGestures: React.Dispatch<React.SetStateAction<{ [key: number]: HandMode }>>;
  setIsHandTrackingActive: React.Dispatch<React.SetStateAction<boolean>>;
  showDebugPanels: boolean;
  setShowDebugPanels: (show: boolean) => void;
}

// Create a context for hand gesture information
const HandGestureContext = createContext<HandGestureContextValue | undefined>(undefined);

// Custom hook to use the hand gesture context
export const useHandGesture = () => {
  const context = useContext(HandGestureContext);
  if (context === undefined) {
    throw new Error('useHandGesture must be used within a HandGestureProvider');
  }
  return context;
};

interface HandGestureProviderProps {
  children: ReactNode;
}

export const HandGestureProvider: React.FC<HandGestureProviderProps> = ({ children }) => {
  const [currentGestures, setCurrentGestures] = useState<{ [key: number]: HandMode }>({
    0: 'None'
  });
  const [isHandTrackingActive, setIsHandTrackingActive] = useState(false);
  const [showDebugPanels, setShowDebugPanels] = useState(true); // Default to true for development

  return (
    <HandGestureContext.Provider value={{ 
      currentGestures, 
      isHandTrackingActive,
      setCurrentGestures,
      setIsHandTrackingActive,
      showDebugPanels,
      setShowDebugPanels,
    }}>
      {children}
    </HandGestureContext.Provider>
  );
};

export default HandGestureContext; 
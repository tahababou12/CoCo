import React, { createContext, useContext, useState } from 'react';
import { HandGestureContextType, HandMode } from '../types/handTracking';

// Extended context type that includes state setters
interface HandGestureContextValue extends HandGestureContextType {
  setCurrentGestures: React.Dispatch<React.SetStateAction<{ [key: number]: HandMode }>>;
  setIsHandTrackingActive: React.Dispatch<React.SetStateAction<boolean>>;
}

// Create a context for hand gesture information
const HandGestureContext = createContext<HandGestureContextValue>({
  currentGestures: {},
  isHandTrackingActive: false,
  setCurrentGestures: () => {},
  setIsHandTrackingActive: () => {}
});

// Custom hook to use the hand gesture context
export const useHandGesture = () => useContext(HandGestureContext);

interface HandGestureProviderProps {
  children: React.ReactNode;
}

export const HandGestureProvider: React.FC<HandGestureProviderProps> = ({ children }) => {
  const [currentGestures, setCurrentGestures] = useState<{ [key: number]: HandMode }>({
    0: 'None'
  });
  const [isHandTrackingActive, setIsHandTrackingActive] = useState(false);

  return (
    <HandGestureContext.Provider value={{ 
      currentGestures, 
      isHandTrackingActive,
      setCurrentGestures,
      setIsHandTrackingActive
    }}>
      {children}
    </HandGestureContext.Provider>
  );
};

export default HandGestureContext; 
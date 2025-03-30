import React, { createContext, useContext, useRef, useState, useEffect } from 'react';

interface ShapesContextType {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  setCanvas: (canvas: HTMLCanvasElement | null) => void;
  shapes: any[]; // Replace with your actual shape type
  selectedShapes: any[]; // Replace with your actual shape type
  addShape: (shape: any) => void;
  updateShape: (id: string, updates: any) => void;
  deleteShape: (id: string) => void;
  selectShape: (id: string) => void;
  deselectShape: (id: string) => void;
  clearSelection: () => void;
}

const defaultContext: ShapesContextType = {
  canvasRef: { current: null },
  setCanvas: () => {},
  shapes: [],
  selectedShapes: [],
  addShape: () => {},
  updateShape: () => {},
  deleteShape: () => {},
  selectShape: () => {},
  deselectShape: () => {},
  clearSelection: () => {},
};

const ShapesContext = createContext<ShapesContextType>(defaultContext);

export const useShapes = () => useContext(ShapesContext);

export const ShapesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shapes, setShapes] = useState<any[]>([]);
  const [selectedShapes, setSelectedShapes] = useState<any[]>([]);

  // Add a setter function for the canvas
  const setCanvas = (canvas: HTMLCanvasElement | null) => {
    if (canvas && canvasRef) {
      // Use Object.defineProperty as a workaround for the read-only nature of .current
      Object.defineProperty(canvasRef, 'current', {
        value: canvas,
        writable: true
      });
    }
  };

  const addShape = (shape: any) => {
    setShapes((prevShapes) => [...prevShapes, shape]);
  };

  const updateShape = (id: string, updates: any) => {
    setShapes((prevShapes) =>
      prevShapes.map((shape) => (shape.id === id ? { ...shape, ...updates } : shape))
    );
  };

  const deleteShape = (id: string) => {
    setShapes((prevShapes) => prevShapes.filter((shape) => shape.id !== id));
    setSelectedShapes((prevSelected) => prevSelected.filter((shape) => shape.id !== id));
  };

  const selectShape = (id: string) => {
    const shape = shapes.find((s) => s.id === id);
    if (shape) {
      setSelectedShapes((prev) => {
        if (!prev.some((s) => s.id === id)) {
          return [...prev, shape];
        }
        return prev;
      });
    }
  };

  const deselectShape = (id: string) => {
    setSelectedShapes((prev) => prev.filter((shape) => shape.id !== id));
  };

  const clearSelection = () => {
    setSelectedShapes([]);
  };

  // Connect to your existing DrawingContext if needed
  useEffect(() => {
    // Any initialization or connection to the canvas
    if (canvasRef.current) {
      // Setup canvas event listeners or other initialization
    }
  }, [canvasRef.current]);

  const value = {
    canvasRef,
    setCanvas,
    shapes,
    selectedShapes,
    addShape,
    updateShape,
    deleteShape,
    selectShape,
    deselectShape,
    clearSelection,
  };

  return <ShapesContext.Provider value={value}>{children}</ShapesContext.Provider>;
};

export default ShapesContext; 
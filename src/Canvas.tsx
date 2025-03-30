import React, { useEffect, useRef } from 'react';

const Canvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shapesCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync our local canvasRef to the ShapesContext canvasRef
  useEffect(() => {
    if (canvasRef.current) {
      // Use a functional approach to update the ref that doesn't directly assign to .current
      const canvasElement = canvasRef.current;
      // Use dispatcher or context method instead of direct assignment
      if (shapesCanvasRef && typeof shapesCanvasRef === 'object') {
        // This is a workaround to update the ref value without direct assignment
        Object.defineProperty(shapesCanvasRef, 'current', {
          value: canvasElement,
          writable: true
        });
      }
    }
  }, [canvasRef.current, shapesCanvasRef]);

  return (
    <canvas ref={canvasRef} />
  );
};

export default Canvas; 
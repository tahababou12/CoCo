import React, { useRef, useEffect, useState, useLayoutEffect, useCallback } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { useWebSocket } from '../context/WebSocketContext'
import { useShapes } from '../ShapesContext'
import { Point, Shape } from '../types'
import { renderShape } from '../utils/renderShape'
import { hitTest } from '../utils/hitTest'
import UserCursor from './UserCursor'

// Add StoryboardIcon component
const StoryboardIcon: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  return (
    <div 
      className="storyboard-icon" 
      onClick={onClick}
      style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: '40px',
        height: '40px',
        background: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'pointer',
        zIndex: 1000,
        transition: 'transform 0.2s ease',
      }}
      onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
      onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
    >
      <div style={{
        position: 'relative',
        width: '24px',
        height: '24px',
      }}>
        {/* First frame - back */}
        <div style={{
          position: 'absolute',
          left: '-2px',
          top: '-2px',
          width: '18px',
          height: '18px',
          border: '2px solid #6b7280',
          borderRadius: '2px',
          background: '#f3f4f6',
          transform: 'rotate(-5deg)',
        }} />
        
        {/* Second frame - middle */}
        <div style={{
          position: 'absolute',
          left: '0',
          top: '0',
          width: '18px',
          height: '18px',
          border: '2px solid #4b5563',
          borderRadius: '2px',
          background: '#e5e7eb',
        }} />
        
        {/* Third frame - front */}
        <div style={{
          position: 'absolute',
          left: '4px',
          top: '4px',
          width: '18px',
          height: '18px',
          border: '2px solid #374151',
          borderRadius: '2px',
          background: '#d1d5db',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          {/* Play icon */}
          <div style={{
            width: '0',
            height: '0',
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderLeft: '6px solid #111827',
            marginLeft: '2px',
          }} />
        </div>
      </div>
    </div>
  );
};

const Canvas: React.FC = () => {
  const { state, dispatch } = useDrawing()
  const webSocketContext = useWebSocket()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { setCanvas } = useShapes()
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [lastPanPoint, setLastPanPoint] = useState<Point | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [showStoryboard, setShowStoryboard] = useState(false)
  const [textInput, setTextInput] = useState<{
    visible: boolean;
    position: Point;
    value: string;
  }>({
    visible: false,
    position: { x: 0, y: 0 },
    value: '',
  })
  
  // Cursor tracking - how often to send updates (ms)
  const cursorThrottleRef = useRef<number>(0)
  const CURSOR_THROTTLE_MS = 50

  // Add this with the other useRef declarations at the top of the component
  const isErasing = useRef(false)
  const isSelecting = useRef(false)

  // Update the ShapesContext with our canvas element
  useEffect(() => {
    if (canvasRef.current) {
      setCanvas(canvasRef.current);
    }
  }, [canvasRef.current, setCanvas]);

  // Define renderCanvas function before it's used in effects
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const gridSize = 20 * state.viewTransform.scale
    const offsetX = state.viewTransform.offsetX % gridSize
    const offsetY = state.viewTransform.offsetY % gridSize
    
    // Draw dots at intersections
    ctx.fillStyle = '#e5e5e5'
    for (let x = offsetX; x < width; x += gridSize) {
      for (let y = offsetY; y < height; y += gridSize) {
        ctx.beginPath()
        ctx.arc(x, y, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size to match container
    const container = containerRef.current
    if (container) {
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Apply view transform
    ctx.save()
    ctx.translate(state.viewTransform.offsetX, state.viewTransform.offsetY)
    ctx.scale(state.viewTransform.scale, state.viewTransform.scale)

    // Draw all shapes
    state.shapes.forEach(shape => {
      renderShape(ctx, shape)
      
      // Draw selection indicator for selected shapes
      if (state.selectedShapeIds.includes(shape.id)) {
        drawSelectionIndicator(ctx, shape);
      }
    })

    // Draw current shape if drawing
    if (state.currentShape) {
      renderShape(ctx, state.currentShape)
    }

    // Draw selection box if active
    if (state.selectionBox && state.selectionBox.start && state.selectionBox.end) {
      drawSelectionBox(ctx, state.selectionBox.start, state.selectionBox.end);
    }

    ctx.restore()
  }, [state.shapes, state.currentShape, state.viewTransform, state.selectedShapeIds, state.selectionBox])

  // Add helper functions for drawing selection box and indicators
  const drawSelectionBox = (ctx: CanvasRenderingContext2D, start: Point, end: Point) => {
    const width = end.x - start.x;
    const height = end.y - start.y;
    
    ctx.save();
    ctx.strokeStyle = '#1e90ff'; // Dodger blue
    ctx.lineWidth = 1 / state.viewTransform.scale;
    ctx.setLineDash([5 / state.viewTransform.scale, 5 / state.viewTransform.scale]);
    ctx.strokeRect(start.x, start.y, width, height);
    ctx.restore();
  };
  
  const drawSelectionIndicator = (ctx: CanvasRenderingContext2D, shape: Shape) => {
    ctx.save();
    
    let bounds: { minX: number; minY: number; maxX: number; maxY: number };
    
    switch (shape.type) {
      case 'rectangle':
      case 'ellipse':
      case 'image':
        // These shapes have two points defining opposite corners
        const [start, end] = shape.points;
        bounds = {
          minX: Math.min(start.x, end.x),
          minY: Math.min(start.y, end.y),
          maxX: Math.max(start.x, end.x),
          maxY: Math.max(start.y, end.y)
        };
        break;
        
      case 'line':
      case 'pencil':
        // Find bounding box of all points
        bounds = shape.points.reduce(
          (acc, point) => ({
            minX: Math.min(acc.minX, point.x),
            minY: Math.min(acc.minY, point.y),
            maxX: Math.max(acc.maxX, point.x),
            maxY: Math.max(acc.maxY, point.y)
          }),
          { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
        );
        break;
        
      case 'text':
        // For text, create a bounding box based on the position and estimated size
        const fontSize = shape.style.fontSize || 16;
        const textWidth = (shape.text?.length || 0) * (fontSize * 0.6);
        bounds = {
          minX: shape.points[0].x,
          minY: shape.points[0].y,
          maxX: shape.points[0].x + textWidth,
          maxY: shape.points[0].y + fontSize * 1.2
        };
        break;
        
      default:
        ctx.restore();
        return;
    }
    
    // Draw selection rectangle
    ctx.strokeStyle = '#4285f4'; // Google blue
    ctx.lineWidth = 2 / state.viewTransform.scale;
    ctx.strokeRect(
      bounds.minX - 5 / state.viewTransform.scale,
      bounds.minY - 5 / state.viewTransform.scale,
      (bounds.maxX - bounds.minX) + 10 / state.viewTransform.scale,
      (bounds.maxY - bounds.minY) + 10 / state.viewTransform.scale
    );
    
    // Draw control handles at corners
    const handleSize = 8 / state.viewTransform.scale;
    const handlePoints = [
      { x: bounds.minX, y: bounds.minY }, // Top-left
      { x: bounds.maxX, y: bounds.minY }, // Top-right
      { x: bounds.maxX, y: bounds.maxY }, // Bottom-right
      { x: bounds.minX, y: bounds.maxY }  // Bottom-left
    ];
    
    ctx.fillStyle = 'white';
    handlePoints.forEach(point => {
      ctx.fillRect(
        point.x - handleSize / 2,
        point.y - handleSize / 2,
        handleSize,
        handleSize
      );
      ctx.strokeRect(
        point.x - handleSize / 2,
        point.y - handleSize / 2,
        handleSize,
        handleSize
      );
    });
    
    ctx.restore();
  };

  // Initialize canvas and context
  useEffect(() => {
    console.log('Canvas initialization effect running');
    
    // Ensure we have references to both canvas and container
    if (!canvasRef.current) {
      console.error('Canvas element not available during initialization');
      return;
    }
    
    const canvas = canvasRef.current;
    
    // Set explicit dimensions - both via attributes and style
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth || 800;
      const containerHeight = containerRef.current.clientHeight || 600;
      
      // Ensure non-zero dimensions
      const width = Math.max(containerWidth, 800);
      const height = Math.max(containerHeight, 600);
      
      // Set both the canvas attribute dimensions and CSS dimensions
      canvas.width = width;
      canvas.height = height;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    } else {
      canvas.width = 800;
      canvas.height = 600;
      canvas.style.width = '800px';
      canvas.style.height = '600px';
    }
    
    console.log(`Canvas dimensions set: ${canvas.width}x${canvas.height}`);
    
    // Use willReadFrequently for better performance with frequent reads
    const context = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!context) {
      console.error('Failed to get canvas 2d context');
      return;
    }
    
    // Set up context properties
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = state.defaultStyle.strokeColor || '#000';
    context.lineWidth = state.defaultStyle.strokeWidth || 2;
    
    ctxRef.current = context;
    console.log('Canvas context initialized');
    
    // Force an initial render after a short delay to ensure everything is set up
    setTimeout(() => {
      console.log('Triggering delayed initial render');
      renderCanvas();
    }, 200);
    
    // Add extra debugging on the canvas element
    canvas.addEventListener('pointerdown', () => {
      console.log('Native pointerdown event fired');
    });
    
  }, []);

  // Handle canvas resize
  useEffect(() => {
    const resizeCanvas = () => {
      if (canvasRef.current && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth || 800;
        const containerHeight = containerRef.current.clientHeight || 600;
        
        // Ensure we never set zero dimensions
        const width = Math.max(containerWidth, 1);
        const height = Math.max(containerHeight, 1);
        
        console.log(`Resizing canvas to: ${width}x${height}`);
        
        canvasRef.current.width = width;
        canvasRef.current.height = height;
        
        // Explicitly set the style as well to ensure visibility
        canvasRef.current.style.width = `${width}px`;
        canvasRef.current.style.height = `${height}px`;
        
        renderCanvas();
      }
    };

    // Add a small delay to ensure container is properly sized
    setTimeout(resizeCanvas, 100);
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Render canvas whenever state changes
  useLayoutEffect(() => {
    renderCanvas();
  }, [state.shapes, state.currentShape, state.viewTransform]);

  // Update cursor when tool changes
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.style.cursor = getCursorForTool(state.tool)
    }
  }, [state.tool])

  const getCanvasPoint = (clientX: number, clientY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 }

    const rect = canvasRef.current.getBoundingClientRect()
    const x = (clientX - rect.left - state.viewTransform.offsetX) / state.viewTransform.scale
    const y = (clientY - rect.top - state.viewTransform.offsetY) / state.viewTransform.scale
    return { x, y }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    
    if (!canvasRef.current) {
      console.error('Canvas reference not available on pointer down');
      return;
    }
    
    // Capture pointer for drag operations outside the canvas
    try {
      canvasRef.current.setPointerCapture(e.pointerId);
    } catch (err) {
      console.error('Failed to capture pointer', err);
    }
    
    const point = getCanvasPoint(e.clientX, e.clientY);
    
    // Handle different tools
    switch (state.tool) {
      case 'select':
        console.log('Starting select operation');
        const shapeUnderCursor = findShapeAtPoint(point);
        
        if (shapeUnderCursor) {
          console.log('Selected shape:', shapeUnderCursor.id);
          // Check if holding shift to add to selection
          if (e.shiftKey) {
            const updatedSelection = state.selectedShapeIds.includes(shapeUnderCursor.id)
              ? state.selectedShapeIds.filter(id => id !== shapeUnderCursor.id)
              : [...state.selectedShapeIds, shapeUnderCursor.id];
            
            dispatch({ type: 'SELECT_SHAPES', payload: updatedSelection });
          } else if (!state.selectedShapeIds.includes(shapeUnderCursor.id)) {
            dispatch({ type: 'SELECT_SHAPES', payload: [shapeUnderCursor.id] });
          }
        } else {
          // No shape under cursor, start selection box
          console.log('Starting selection box at', point);
          isSelecting.current = true;
          dispatch({ type: 'START_SELECTION_BOX', payload: point });
        }
        setIsDrawing(true);
        break;
        
      case 'pan':
        console.log('Starting pan');
        setIsPanning(true);
        setLastPanPoint({ x: e.clientX, y: e.clientY });
        break;

      case 'text':
        console.log('Starting text input');
        setTextInput({
          visible: true,
          position: point,
          value: '',
        });
        break;
        
      case 'eraser':
        console.log('Starting eraser operation');
        setIsDrawing(true);
        // Store that we're erasing
        isErasing.current = true;
        
        // Check for shape at initial click point and erase it
        const shapeToErase = findShapeAtPoint(point);
        if (shapeToErase) {
          console.log('Erasing shape:', shapeToErase.id);
          // Delete the shape
          dispatch({ type: 'DELETE_SHAPES', payload: [shapeToErase.id] });
          
          // Manually broadcast the deletion to collaborators
          if (webSocketContext?.isConnected && 
              typeof webSocketContext.sendMessage === 'function' && 
              state.currentUser) {
            webSocketContext.sendMessage({
              type: 'SHAPES_DELETED',
              payload: {
                shapeIds: [shapeToErase.id],
                userId: state.currentUser.id
              }
            });
          }
        }
        break;
        
      case 'rectangle':
      case 'ellipse':
      case 'line':
      case 'pencil':
        console.log('Starting to draw with', state.tool);
        setIsDrawing(true);
        dispatch({
          type: 'START_DRAWING',
          payload: { point, type: state.tool },
        });
        break;

      default:
        console.warn('Unknown tool:', state.tool);
        break;
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    e.preventDefault()
    if (!canvasRef.current) return
    
    const point = getCanvasPoint(e.clientX, e.clientY)
    
    // Send cursor position to other users - throttle updates
    if (webSocketContext?.isConnected && typeof webSocketContext.sendCursorMove === 'function') {
      const now = Date.now()
      if (now - cursorThrottleRef.current > CURSOR_THROTTLE_MS) {
        cursorThrottleRef.current = now
        // Send raw screen coordinates, not canvas-transformed coordinates
        webSocketContext.sendCursorMove({ x: e.clientX, y: e.clientY })
      }
    }

    // Handle tool-specific behavior
    if (isPanning && lastPanPoint) {
      // Only pan when isPanning is true AND we have a valid lastPanPoint
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      dispatch({ type: 'PAN', payload: { x: dx, y: dy } });
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    } else if (state.tool === 'select' && isDrawing) {
      if (isSelecting.current) {
        // Update selection box
        dispatch({ type: 'UPDATE_SELECTION_BOX', payload: point });
      } else {
        // Handle moving selected shapes (future implementation)
      }
    } else if (state.tool === 'eraser' && isDrawing && isErasing.current) {
      // Object eraser - erase shapes only when actively drawing (mouse down)
      const shapeToErase = findShapeAtPoint(point);
      if (shapeToErase) {
        console.log('Erasing shape during drag:', shapeToErase.id);
        // Delete the shape
        dispatch({ type: 'DELETE_SHAPES', payload: [shapeToErase.id] });
        
        // Manually broadcast the deletion to collaborators
        if (webSocketContext?.isConnected && 
            typeof webSocketContext.sendMessage === 'function' && 
            state.currentUser) {
          webSocketContext.sendMessage({
            type: 'SHAPES_DELETED',
            payload: {
              shapeIds: [shapeToErase.id],
              userId: state.currentUser.id
            }
          });
        }
      }
    } else if (isDrawing && state.currentShape) {
      // Update the current shape as we draw
      dispatch({ type: 'CONTINUE_DRAWING', payload: point })
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!canvasRef.current) return;
    
    // Prevent default behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Release pointer capture
    try {
      canvasRef.current.releasePointerCapture(e.pointerId);
    } catch (err) {
      console.error('Failed to release pointer capture', err);
    }
    
    if (isPanning) {
      console.log('Ending pan operation');
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    if (isDrawing) {
      console.log('Ending drawing operation');
      
      // End selection box if we were selecting
      if (isSelecting.current && state.selectionBox) {
        isSelecting.current = false;
        
        // Find shapes that are within the selection box and select them
        const shapesInSelection = findShapesInSelectionBox(state.selectionBox.start, state.selectionBox.end);
        const selectedIds = shapesInSelection.map(shape => shape.id);
        
        console.log('Selected shapes:', selectedIds);
        
        // If holding shift, add to existing selection
        if (e.shiftKey) {
          const updatedSelection = [...new Set([...state.selectedShapeIds, ...selectedIds])];
          dispatch({ type: 'SELECT_SHAPES', payload: updatedSelection });
        } else {
          dispatch({ type: 'SELECT_SHAPES', payload: selectedIds });
        }
        
        dispatch({ type: 'END_SELECTION_BOX' });
      }
      
      setIsDrawing(false);
      
      // Reset erasing state
      isErasing.current = false;
      
      if (state.currentShape) {
        dispatch({ type: 'END_DRAWING' });
      }
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    // Don't end drawing on leave since we've captured the pointer
    e.preventDefault();
    
    // We don't need to end panning here since we're using pointer capture
    // Panning will end when the pointer is released (handlePointerUp)
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY > 0 ? -0.1 : 0.1
    
    // Zoom centered on mouse position
    const point = getCanvasPoint(e.clientX, e.clientY)
    dispatch({ 
      type: 'ZOOM_AT_POINT', 
      payload: { 
        factor: zoomFactor,
        point: point
      } 
    })
  }

  const findShapeAtPoint = (point: Point): Shape | undefined => {
    // Check shapes in reverse order (top to bottom)
    return [...state.shapes].reverse().find(shape => hitTest(shape, point))
  }

  const handleTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextInput({
      ...textInput,
      value: e.target.value,
    })
  }

  const handleTextInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitTextInput()
    } else if (e.key === 'Escape') {
      cancelTextInput()
    }
  }

  const submitTextInput = () => {
    if (textInput.value.trim()) {
      const newTextShape: Shape = {
        id: Math.random().toString(36).substring(2, 9),
        type: 'text',
        points: [textInput.position],
        text: textInput.value,
        style: { ...state.defaultStyle },
        isSelected: false,
      }
      dispatch({ type: 'ADD_SHAPE', payload: newTextShape })
    }
    cancelTextInput()
  }

  const cancelTextInput = () => {
    setTextInput({
      visible: false,
      position: { x: 0, y: 0 },
      value: '',
    })
  }

  const getCursorForTool = (tool: string): string => {
    switch (tool) {
      case 'select':
        return 'default'
      case 'pan':
        return 'grab'
      case 'eraser':
        // Object eraser - use eraser icon
        return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21\'%3E%3C/path%3E%3Cpath d=\'M22 21H7\'%3E%3C/path%3E%3Cpath d=\'m5 11 9 9\'%3E%3C/path%3E%3C/svg%3E") 0 24, auto'
      case 'pixel_eraser':
        // Pixel eraser - use traditional eraser icon with X
        return 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23000\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\'%3E%3C/path%3E%3Cpath d=\'M15 3h6v6\'%3E%3C/path%3E%3Cpath d=\'M10 14L21 3\'%3E%3C/path%3E%3C/svg%3E") 0 24, auto'
      default:
        return 'crosshair'
    }
  }

  // Add handler function for storyboard icon click
  const handleStoryboardClick = () => {
    setShowStoryboard(!showStoryboard);
    console.log('Storyboard icon clicked, toggling storyboard view:', !showStoryboard);
    // You would implement the actual storyboard functionality here
  };

  // Find all shapes within the selection box
  const findShapesInSelectionBox = (start: Point, end: Point): Shape[] => {
    // Normalize the selection box coordinates
    const selectionBounds = {
      minX: Math.min(start.x, end.x),
      minY: Math.min(start.y, end.y),
      maxX: Math.max(start.x, end.x),
      maxY: Math.max(start.y, end.y)
    };
    
    // Group shapes by their createdBy ID to identify whole drawings
    // This will let us select entire drawings rather than individual lines
    const shapeGroups: Record<string, Shape[]> = {};
    
    // First, find all shapes that intersect with the selection box
    const intersectingShapes = state.shapes.filter(shape => {
      // Calculate shape bounds based on shape type
      let shapeBounds: { minX: number; minY: number; maxX: number; maxY: number };
      
      switch (shape.type) {
        case 'rectangle':
        case 'ellipse':
        case 'image':
          // These shapes have two points defining opposite corners
          const [p1, p2] = shape.points;
          shapeBounds = {
            minX: Math.min(p1.x, p2.x),
            minY: Math.min(p1.y, p2.y),
            maxX: Math.max(p1.x, p2.x),
            maxY: Math.max(p1.y, p2.y)
          };
          break;
          
        case 'line':
        case 'pencil':
          // Find bounding box of all points
          shapeBounds = shape.points.reduce(
            (acc, point) => ({
              minX: Math.min(acc.minX, point.x),
              minY: Math.min(acc.minY, point.y),
              maxX: Math.max(acc.maxX, point.x),
              maxY: Math.max(acc.maxY, point.y)
            }),
            { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
          );
          break;
          
        case 'text':
          // For text, create a bounding box based on the position and estimated size
          const point = shape.points[0];
          const fontSize = shape.style.fontSize || 16;
          const textWidth = (shape.text?.length || 0) * (fontSize * 0.6);
          shapeBounds = {
            minX: point.x,
            minY: point.y,
            maxX: point.x + textWidth,
            maxY: point.y + fontSize * 1.2
          };
          break;
          
        default:
          return false;
      }
      
      // Check if shape overlaps with selection box (consider it selected if any part is inside)
      const isOverlapping = !(
        shapeBounds.maxX < selectionBounds.minX || 
        shapeBounds.minX > selectionBounds.maxX ||
        shapeBounds.maxY < selectionBounds.minY ||
        shapeBounds.minY > selectionBounds.maxY
      );
      
      return isOverlapping;
    });
    
    // Group shapes by createdBy ID or creation timestamp
    intersectingShapes.forEach(shape => {
      const groupKey = shape.createdBy || 
                      (shape.id.split('-')[0] || 'ungrouped'); // Use first part of ID as fallback
      
      if (!shapeGroups[groupKey]) {
        shapeGroups[groupKey] = [];
      }
      shapeGroups[groupKey].push(shape);
    });
    
    // For any group that has at least one shape intersecting, include all shapes in that group
    const result: Shape[] = [];
    
    // First add all directly intersecting shapes
    result.push(...intersectingShapes);
    
    // Then for groups with multiple shapes, find all related shapes that might be outside the selection
    Object.keys(shapeGroups).forEach(groupKey => {
      if (shapeGroups[groupKey].length > 0) {
        // Find all shapes with the same group key that weren't already intersecting
        const relatedShapes = state.shapes.filter(shape => {
          const shapeGroupKey = shape.createdBy || 
                               (shape.id.split('-')[0] || 'ungrouped');
          return shapeGroupKey === groupKey && 
                 !intersectingShapes.some(s => s.id === shape.id);
        });
        
        // Add these related shapes to the result
        result.push(...relatedShapes);
      }
    });
    
    // Remove duplicates
    return [...new Map(result.map(shape => [shape.id, shape])).values()];
  };

  return (
    <div 
      ref={containerRef}
      className="canvas-container" 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#fafafa',
        userSelect: 'none',
      }}
      onWheel={handleWheel}
    >
      <canvas
        ref={canvasRef}
        className="canvas-main"
        style={{ 
          display: 'block',
          touchAction: 'none',
          cursor: getCursorForTool(state.tool),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
      />
      
      {/* Add the StoryboardIcon component */}
      <StoryboardIcon onClick={handleStoryboardClick} />
      
      {/* Text input dialog */}
      {textInput.visible && (
        <div 
          style={{
            position: 'absolute',
            left: `${textInput.position.x + state.viewTransform.offsetX}px`, 
            top: `${textInput.position.y + state.viewTransform.offsetY}px`,
            padding: '4px',
            transform: `scale(${state.viewTransform.scale})`,
            transformOrigin: 'top left',
          }}
        >
          <input
            type="text"
            autoFocus
            value={textInput.value}
            onChange={handleTextInputChange}
            onKeyDown={handleTextInputKeyDown}
            onBlur={submitTextInput}
            style={{
              background: 'transparent',
              border: '1px dashed #666',
              fontSize: '16px',
              minWidth: '100px',
              fontFamily: 'sans-serif',
              padding: '2px',
            }}
          />
        </div>
      )}
      
      {/* Render other users' cursors */}
      {webSocketContext?.isConnected && state.collaborators.map(user => (
        user.cursor && user.id !== state.currentUser?.id && (
          <UserCursor 
            key={user.id}
            user={user}
          />
        )
      ))}
      
      {/* Optional Storyboard UI that appears when storyboard icon is clicked */}
      {showStoryboard && (
        <div
          style={{
            position: 'absolute',
            right: '20px',
            top: '70px',
            width: '240px',
            height: '400px',
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 1000,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
            Storyboard
          </div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {/* Here you could map through storyboard frames */}
            <div style={{ 
              height: '120px', 
              background: '#f3f4f6', 
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#9ca3af'
            }}>
              Frame 1
            </div>
            <div style={{ 
              height: '120px', 
              background: '#f3f4f6', 
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#9ca3af'
            }}>
              Frame 2
            </div>
            <div style={{ 
              height: '120px', 
              background: '#f3f4f6', 
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              color: '#9ca3af'
            }}>
              Frame 3
            </div>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #eee',
            paddingTop: '8px'
          }}>
            <button style={{
              background: '#f3f4f6',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              Add Frame
            </button>
            <button style={{
              background: '#4b5563',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              Play
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Canvas

import React, { useRef, useEffect, useState, useLayoutEffect } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { useWebSocket } from '../context/WebSocketContext'
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

  const renderCanvas = () => {
    console.log('renderCanvas called');
    const canvas = canvasRef.current;
    let ctx = ctxRef.current;
    
    if (!canvas) {
      console.error('Cannot render: canvas not available');
      return;
    }
    
    if (!ctx) {
      console.error('Cannot render: context not available');
      
      // Try to reinitialize the context
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context) {
        console.log('Successfully reinitialized context');
        ctxRef.current = context;
        ctx = context;
      } else {
        console.error('Failed to reinitialize context');
        return;
      }
    }

    // At this point, we know ctx is not null
    const context = ctx;

    // Make sure canvas has dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('Canvas has zero dimensions, setting defaults');
      canvas.width = 800;
      canvas.height = 600;
    }

    console.log(`Rendering canvas ${canvas.width}x${canvas.height} with ${state.shapes.length} shapes`);
    
    // Clear canvas with background color
    // context.fillStyle = '#fafaf9'; // Dim white
    context.fillStyle = '#fffbeb'; // Light yellow for night shift mode
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    drawGrid(context, canvas.width, canvas.height);

    // Apply view transform
    context.save();
    context.translate(state.viewTransform.offsetX, state.viewTransform.offsetY);
    context.scale(state.viewTransform.scale, state.viewTransform.scale);

    // Draw all shapes
    state.shapes.forEach((shape, index) => {
      console.log(`Rendering shape ${index}: ${shape.type}`);
      renderShape(context, shape);
    });

    // Draw current shape being created
    if (state.currentShape) {
      console.log('Drawing current shape:', state.currentShape.type);
      renderShape(context, state.currentShape);
    }

    context.restore();
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
          dispatch({ type: 'SELECT_SHAPES', payload: [shapeUnderCursor.id] });
        } else {
          console.log('No shape found, clearing selection');
          dispatch({ type: 'CLEAR_SELECTION' });
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
    if (state.tool === 'pan' || isPanning) {
      const dx = e.clientX - (lastPanPoint?.x || 0);
      const dy = e.clientY - (lastPanPoint?.y || 0);
      dispatch({ type: 'PAN', payload: { x: dx, y: dy } });
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    } else if (state.tool === 'select' && isDrawing) {
      // Find shape under cursor
      const shapeUnderCursor = findShapeAtPoint(point);
      
      if (shapeUnderCursor) {
        dispatch({ type: 'SELECT_SHAPES', payload: [shapeUnderCursor.id] });
      } else {
        dispatch({ type: 'CLEAR_SELECTION' });
      }
    } else if (state.tool === 'eraser' && isDrawing) {
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
      setIsPanning(false);
      setLastPanPoint(null);
      return;
    }

    if (isDrawing && state.currentShape) {
      console.log('Ending drawing', state.currentShape.type);
      setIsDrawing(false);
      dispatch({ type: 'END_DRAWING' });
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    // Don't end drawing on leave since we've captured the pointer
    e.preventDefault();
    
    // Only handle panning case
    if (isPanning) {
      setIsPanning(false);
      setLastPanPoint(null);
    }
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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        style={{ 
          display: 'block',
          touchAction: 'none',
          cursor: getCursorForTool(state.tool),
        }}
      />
      
      {/* Add the StoryboardIcon component */}
      <StoryboardIcon onClick={handleStoryboardClick} />
      
      {/* Text input dialog */}
      {textInput.visible && (
        <div 
          style={{
            position: 'absolute',
            left: `${textInput.position.x}px`,
            top: `${textInput.position.y}px`,
            zIndex: 100,
          }}
        >
          <input
            type="text"
            value={textInput.value}
            onChange={handleTextInputChange}
            onKeyDown={handleTextInputKeyDown}
            autoFocus
            style={{
              background: 'transparent',
              border: '1px dashed #000',
              padding: '4px',
              fontSize: `${state.defaultStyle.fontSize || 16}px`,
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

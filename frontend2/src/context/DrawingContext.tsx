import React, { createContext, useContext, useReducer } from 'react'
import { DrawingState, Shape, Tool, Point, ShapeStyle } from '../types'
import { v4 as uuidv4 } from '../utils/uuid'

type DrawingAction =
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'START_DRAWING'; payload: { point: Point; type: Shape['type'] } }
  | { type: 'CONTINUE_DRAWING'; payload: Point }
  | { type: 'END_DRAWING' }
  | { type: 'ADD_SHAPE'; payload: Shape }
  | { type: 'UPDATE_SHAPE'; payload: { id: string; updates: Partial<Shape> } }
  | { type: 'DELETE_SHAPES'; payload: string[] }
  | { type: 'SELECT_SHAPES'; payload: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_STYLE'; payload: Partial<ShapeStyle> }
  | { type: 'ZOOM'; payload: number }
  | { type: 'ZOOM_AT_POINT'; payload: { factor: number; point: Point } }
  | { type: 'PAN'; payload: { x: number; y: number } }
  | { type: 'RESET_VIEW' }
  | { type: 'SET_FILL_COLOR'; payload: string }

const initialState: DrawingState = {
  shapes: [],
  currentShape: null,
  selectedShapeIds: [],
  tool: 'select',
  history: {
    past: [],
    future: [],
  },
  viewTransform: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  },
  defaultStyle: {
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeWidth: 2,
    opacity: 1,
    fontSize: 16,
  },
}

function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
  console.log(`Action received: ${action.type}`);
  
  switch (action.type) {
    case 'SET_TOOL':
      console.log(`Tool changed to: ${action.payload}`);
      return {
        ...state,
        tool: action.payload,
        selectedShapeIds: [],
        currentShape: null
      }

    case 'START_DRAWING': {
      if (state.tool === 'select' || state.tool === 'pan' || state.tool === 'eraser') {
        console.log('Cannot start drawing with current tool:', state.tool);
        return state
      }

      const newShape: Shape = {
        id: uuidv4(),
        type: action.payload.type,
        points: [action.payload.point],
        style: { ...state.defaultStyle },
        isSelected: false,
      }

      console.log(`Starting to draw ${action.payload.type} at`, action.payload.point);
      return {
        ...state,
        currentShape: newShape,
      }
    }

    case 'CONTINUE_DRAWING': {
      if (!state.currentShape) {
        console.log('No current shape to continue drawing');
        return state
      }

      console.log(`Continuing to draw ${state.currentShape.type} at`, action.payload);

      // For rectangle, ellipse, and line, we only need two points
      if (['rectangle', 'ellipse', 'line'].includes(state.currentShape.type)) {
        const updatedShape = {
          ...state.currentShape,
          points: [state.currentShape.points[0], action.payload],
        }
        return {
          ...state,
          currentShape: updatedShape,
        }
      }

      // For pencil, we add points continuously
      const updatedShape = {
        ...state.currentShape,
        points: [...state.currentShape.points, action.payload],
      }

      return {
        ...state,
        currentShape: updatedShape,
      }
    }

    case 'END_DRAWING': {
      if (!state.currentShape) {
        console.log('No current shape to end drawing');
        return state
      }

      console.log(`Ending drawing with points:`, state.currentShape.points);

      // Only add shapes with at least 2 points (or 1 for text)
      if (
        state.currentShape.points.length < 2 &&
        state.currentShape.type !== 'text'
      ) {
        console.log('Not enough points to create shape');
        return {
          ...state,
          currentShape: null,
        }
      }

      const newShapes = [...state.shapes, state.currentShape]
      console.log(`Finished drawing ${state.currentShape.type}, total shapes:`, newShapes.length);

      return {
        ...state,
        shapes: newShapes,
        currentShape: null,
        history: {
          past: [...state.history.past, state.shapes],
          future: [],
        },
      }
    }

    case 'ADD_SHAPE':
      return {
        ...state,
        shapes: [...state.shapes, action.payload],
        history: {
          past: [...state.history.past, state.shapes],
          future: [],
        },
      }

    case 'UPDATE_SHAPE': {
      const updatedShapes = state.shapes.map((shape) =>
        shape.id === action.payload.id
          ? { ...shape, ...action.payload.updates }
          : shape
      )

      return {
        ...state,
        shapes: updatedShapes,
        history: {
          past: [...state.history.past, state.shapes],
          future: [],
        },
      }
    }

    case 'DELETE_SHAPES': {
      // Don't do anything if no shapes to delete
      if (action.payload.length === 0) return state;
      
      const updatedShapes = state.shapes.filter(
        (shape) => !action.payload.includes(shape.id)
      )

      return {
        ...state,
        shapes: updatedShapes,
        selectedShapeIds: [],
        history: {
          past: [...state.history.past, state.shapes],
          future: [],
        },
      }
    }

    case 'SELECT_SHAPES': {
      const updatedShapes = state.shapes.map((shape) => ({
        ...shape,
        isSelected: action.payload.includes(shape.id),
      }))

      return {
        ...state,
        shapes: updatedShapes,
        selectedShapeIds: action.payload,
      }
    }

    case 'CLEAR_SELECTION': {
      const updatedShapes = state.shapes.map((shape) => ({
        ...shape,
        isSelected: false,
      }))

      return {
        ...state,
        shapes: updatedShapes,
        selectedShapeIds: [],
      }
    }

    case 'UNDO': {
      if (state.history.past.length === 0) return state

      const previous = state.history.past[state.history.past.length - 1]
      const newPast = state.history.past.slice(0, state.history.past.length - 1)

      return {
        ...state,
        shapes: previous,
        history: {
          past: newPast,
          future: [state.shapes, ...state.history.future],
        },
        selectedShapeIds: [],
      }
    }

    case 'REDO': {
      if (state.history.future.length === 0) return state

      const next = state.history.future[0]
      const newFuture = state.history.future.slice(1)

      return {
        ...state,
        shapes: next,
        history: {
          past: [...state.history.past, state.shapes],
          future: newFuture,
        },
        selectedShapeIds: [],
      }
    }

    case 'SET_STYLE':
      return {
        ...state,
        defaultStyle: {
          ...state.defaultStyle,
          ...action.payload,
        },
      }

    case 'SET_FILL_COLOR':
      return {
        ...state,
        defaultStyle: {
          ...state.defaultStyle,
          fillColor: action.payload,
        },
      }

    case 'ZOOM':
      return {
        ...state,
        viewTransform: {
          ...state.viewTransform,
          scale: Math.max(0.1, Math.min(5, state.viewTransform.scale + action.payload)),
        },
      }

    case 'ZOOM_AT_POINT': {
      const { factor, point } = action.payload;
      const newScale = Math.max(0.1, Math.min(5, state.viewTransform.scale + factor));
      
      // Calculate new offsets to zoom centered on mouse position
      const scaleChange = newScale / state.viewTransform.scale;
      const newOffsetX = point.x - (point.x - state.viewTransform.offsetX) * scaleChange;
      const newOffsetY = point.y - (point.y - state.viewTransform.offsetY) * scaleChange;
      
      return {
        ...state,
        viewTransform: {
          scale: newScale,
          offsetX: newOffsetX,
          offsetY: newOffsetY,
        },
      };
    }

    case 'PAN':
      return {
        ...state,
        viewTransform: {
          ...state.viewTransform,
          offsetX: state.viewTransform.offsetX + action.payload.x,
          offsetY: state.viewTransform.offsetY + action.payload.y,
        },
      }

    case 'RESET_VIEW':
      return {
        ...state,
        viewTransform: {
          scale: 1,
          offsetX: 0,
          offsetY: 0,
        },
      }

    default:
      return state
  }
}

type DrawingContextType = {
  state: DrawingState
  dispatch: React.Dispatch<DrawingAction>
}

const DrawingContext = createContext<DrawingContextType | undefined>(undefined)

export const DrawingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(drawingReducer, initialState)

  return (
    <DrawingContext.Provider value={{ state, dispatch }}>
      {children}
    </DrawingContext.Provider>
  )
}

export const useDrawing = () => {
  const context = useContext(DrawingContext)
  if (context === undefined) {
    throw new Error('useDrawing must be used within a DrawingProvider')
  }
  return context
}

import React, { createContext, useContext, useReducer } from 'react'
import { Shape, Tool, Point, ShapeStyle, User, Layer, GridSettings } from '../types'
import { v4 as uuidv4 } from '../utils/uuid'

// Define DrawingState interface locally
interface DrawingState {
  tool: string
  currentShape: Shape | null
  shapes: Shape[]
  selectedShapeIds: string[]
  defaultStyle: ShapeStyle
  collaborators: User[]
  isConnected: boolean
  peerConnections: Record<string, RTCPeerConnection>
  remoteStreams: Record<string, MediaStream>
  selectionBox: { start: Point; end: Point } | null
  currentUser: User | null
  viewTransform: {
    scale: number
    offsetX: number
    offsetY: number
  }
  history: {
    past: Shape[][]
    future: Shape[][]
  }
  // Professional features
  layers: Layer[]
  activeLayerId: string
  gridSettings: GridSettings
  showLayersPanel: boolean
  showGridSettings: boolean
}

type DrawingAction =
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'START_DRAWING'; payload: { point: Point; type: Shape['type'] } }
  | { type: 'CONTINUE_DRAWING'; payload: Point }
  | { type: 'END_DRAWING' }
  | { type: 'DISCARD_CURRENT_SHAPE' }
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
  | { type: 'SET_CURRENT_USER'; payload: User }
  | { type: 'ADD_COLLABORATOR'; payload: User }
  | { type: 'REMOVE_COLLABORATOR'; payload: string }
  | { type: 'UPDATE_COLLABORATOR'; payload: { userId: string; updates: Partial<User> } }
  | { type: 'SET_CONNECTION_STATUS'; payload: boolean }
  | { type: 'SYNC_ALL_SHAPES'; payload: Shape[] }
  | { type: 'ADD_PEER_CONNECTION'; payload: { userId: string; peerConnection: RTCPeerConnection } }
  | { type: 'REMOVE_PEER_CONNECTION'; payload: { userId: string } }
  | { type: 'ADD_REMOTE_STREAM'; payload: { userId: string; stream: MediaStream } }
  | { type: 'REMOVE_REMOTE_STREAM'; payload: { userId: string } }
  | { type: 'UPDATE_HAND_TRACKING_STATUS'; payload: { userId: string; isEnabled: boolean } }
  | { type: 'SET_SELECTED_SHAPE'; payload: string[] }
  | { type: 'START_SELECTION_BOX'; payload: Point }
  | { type: 'UPDATE_SELECTION_BOX'; payload: Point }
  | { type: 'END_SELECTION_BOX' }
  | { type: 'CLEAR_ALL' }
  | { type: 'SAVE_DRAWING_REQUEST' }
  | { type: 'CLEAR_CANVAS' }
  // Professional features
  | { type: 'ADD_LAYER'; payload: Layer }
  | { type: 'UPDATE_LAYER'; payload: { layerId: string; updates: Partial<Layer> } }
  | { type: 'DELETE_LAYER'; payload: string }
  | { type: 'SET_ACTIVE_LAYER'; payload: string }
  | { type: 'MOVE_LAYER'; payload: { layerId: string; direction: 'up' | 'down' } }
  | { type: 'UPDATE_GRID_SETTINGS'; payload: Partial<GridSettings> }
  | { type: 'TOGGLE_LAYERS_PANEL' }
  | { type: 'TOGGLE_GRID_SETTINGS' }

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
  // Collaboration properties
  collaborators: [],
  isConnected: false,
  peerConnections: {},
  remoteStreams: {},
  selectionBox: null,
  currentUser: null,
  // Professional features
  layers: [{
    id: 'default-layer',
    name: 'Background',
    visible: true,
    locked: false,
    opacity: 1,
    shapes: [],
    order: 0
  }],
  activeLayerId: 'default-layer',
  gridSettings: {
    enabled: true,
    size: 20,
    color: '#999999',
    opacity: 0.4,
    snapToGrid: false,
    showRulers: false
  },
  showLayersPanel: false,
  showGridSettings: false
}

function drawingReducer(state: DrawingState, action: DrawingAction): DrawingState {
      // console.log(`Action received: ${action.type}`);
  
  switch (action.type) {
    case 'SET_TOOL':
      return {
        ...state,
        tool: action.payload,
        selectedShapeIds: [],
        currentShape: null
      }

    case 'START_DRAWING': {
      if (state.tool === 'select' || state.tool === 'pan' || state.tool === 'eraser') {
        return state
      }

      const newShape: Shape = {
        id: uuidv4(),
        type: action.payload.type,
        points: [action.payload.point],
        style: { ...state.defaultStyle },
        isSelected: false,
      }

      console.log('🔍 START_DRAWING DEBUG - Creating new shape:', newShape);
      console.log('🔍 START_DRAWING DEBUG - Timestamp:', new Date().toISOString());

      return {
        ...state,
        currentShape: newShape,
      }
    }

    case 'CONTINUE_DRAWING': {
      if (!state.currentShape) {
        return state
      }

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

      // For pencil drawings, update the current shape in both places:
      // 1. As the current shape for continued editing
      // 2. In the shapes array for persistence
      if (state.currentShape.type === 'pencil') {
        // Find if we have this shape already in our shapes array
        const shapeIndex = state.shapes.findIndex(shape => shape.id === state.currentShape!.id);
        
        let newShapes;
        if (shapeIndex >= 0) {
          // Update the existing shape in the array
          newShapes = state.shapes.map((shape, index) => 
            index === shapeIndex ? { ...updatedShape } : shape
          );
        } else {
          // Add the shape to the array for the first time
          newShapes = [...state.shapes, { ...updatedShape }];
        }
        
        return {
          ...state,
          currentShape: updatedShape,
          shapes: newShapes
        }
      }

      // For other shapes, just update the current shape without persisting yet
      return {
        ...state,
        currentShape: updatedShape,
      }
    }

    case 'END_DRAWING': {
      if (!state.currentShape) {
        return state
      }

      // Create a deep copy of the shape to avoid reference issues
      const shapeToSave = {
        ...state.currentShape,
        points: [...state.currentShape.points]
      };
      
      // Check if this shape already exists in the shapes array
      // (which would be the case for pencil drawings that are continuously persisted)
      const shapeIndex = state.shapes.findIndex(shape => shape.id === state.currentShape!.id);
      
      // Only add to shapes array if not already there
      let newShapes;
      if (shapeIndex >= 0) {
        // Update the existing shape with the final version
        newShapes = state.shapes.map((shape, index) => 
          index === shapeIndex ? shapeToSave : shape
        );
      } else {
        // Add as a new shape
        newShapes = [...state.shapes, shapeToSave];
      }

      console.log('🔍 END_DRAWING DEBUG - Adding shape to array. New count:', newShapes.length);
      console.log('🔍 END_DRAWING DEBUG - Shape being added:', shapeToSave);
      console.log('🔍 END_DRAWING DEBUG - Previous shapes count:', state.shapes.length);
      console.log('🔍 END_DRAWING DEBUG - Previous shapes:', state.shapes);
      console.log('🔍 END_DRAWING DEBUG - Current shape before clearing:', state.currentShape);
      console.log('🔍 END_DRAWING DEBUG - Timestamp:', new Date().toISOString());
      
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

    case 'DISCARD_CURRENT_SHAPE':
      return {
        ...state,
        currentShape: null,
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
      // Track the deleted shape IDs to broadcast to collaborators
      const deletedShapeIds = action.payload;
      
      // Update the state by filtering out the deleted shapes
      const newShapes = state.shapes.filter(shape => !deletedShapeIds.includes(shape.id));
      
      return {
        ...state,
        shapes: newShapes,
        selectedShapeIds: state.selectedShapeIds.filter(id => !deletedShapeIds.includes(id)),
        history: {
          past: [...state.history.past, state.shapes],
          future: [],
        },
      };
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

    case 'SET_STYLE': {
      const newDefaultStyle = {
        ...state.defaultStyle,
        ...action.payload,
      };
      
      // Also update the current shape's style if there's an active drawing
      const updatedCurrentShape = state.currentShape ? {
        ...state.currentShape,
        style: {
          ...state.currentShape.style,
          ...action.payload,
        }
      } : null;
      
      return {
        ...state,
        defaultStyle: newDefaultStyle,
        currentShape: updatedCurrentShape,
      };
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

    case 'SET_CURRENT_USER':
      return {
        ...state,
        currentUser: action.payload,
      }

    case 'ADD_COLLABORATOR': {
      // Don't add if user already exists
      if (state.collaborators.some(user => user.id === action.payload.id)) {
        return state;
      }
      return {
        ...state,
        collaborators: [...state.collaborators, action.payload],
      }
    }

    case 'REMOVE_COLLABORATOR':
      return {
        ...state,
        collaborators: state.collaborators.filter(user => user.id !== action.payload),
      }

    case 'UPDATE_COLLABORATOR': {
      return {
        ...state,
        collaborators: state.collaborators.map(user => 
          user.id === action.payload.userId
            ? { ...user, ...action.payload.updates }
            : user
        ),
      }
    }

    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        isConnected: action.payload,
      }

    case 'SYNC_ALL_SHAPES':
      return {
        ...state,
        shapes: action.payload,
        // Don't record this in history since it's just syncing
      }

    case 'ADD_PEER_CONNECTION': {
      const { userId, peerConnection } = action.payload;
      return {
        ...state,
        peerConnections: {
          ...state.peerConnections,
          [userId]: peerConnection
        }
      };
    }

    case 'REMOVE_PEER_CONNECTION': {
      const { userId } = action.payload;
      const newPeerConnections = { ...state.peerConnections };
      delete newPeerConnections[userId];
      return {
        ...state,
        peerConnections: newPeerConnections
      };
    }

    case 'ADD_REMOTE_STREAM': {
      const { userId, stream } = action.payload;
      return {
        ...state,
        remoteStreams: {
          ...state.remoteStreams,
          [userId]: stream
        }
      };
    }

    case 'REMOVE_REMOTE_STREAM': {
      const { userId } = action.payload;
      const newRemoteStreams = { ...state.remoteStreams };
      delete newRemoteStreams[userId];
      return {
        ...state,
        remoteStreams: newRemoteStreams
      };
    }

    case 'UPDATE_HAND_TRACKING_STATUS': {
      const { userId, isEnabled } = action.payload;
      
      if (state.currentUser && userId === state.currentUser.id) {
        // Update current user
        return {
          ...state,
          currentUser: {
            ...state.currentUser,
            isHandTrackingEnabled: isEnabled
          }
        };
      }
      
      // Update collaborator
      return {
        ...state,
        collaborators: state.collaborators.map(user => 
          user.id === userId
            ? { ...user, isHandTrackingEnabled: isEnabled }
            : user
        )
      };
    }

    case 'SET_SELECTED_SHAPE':
      return {
        ...state,
        selectedShapeIds: action.payload
      }

    case 'START_SELECTION_BOX':
      return {
        ...state,
        selectionBox: {
          start: action.payload,
          end: action.payload
        },
        selectedShapeIds: []
      }
      
    case 'UPDATE_SELECTION_BOX':
      if (!state.selectionBox) return state
      
      return {
        ...state,
        selectionBox: {
          ...state.selectionBox,
          end: action.payload
        }
      }
      
    case 'END_SELECTION_BOX': {
      if (!state.selectionBox || !state.selectionBox.start || !state.selectionBox.end) {
        return {
          ...state,
          selectionBox: null
        }
      }
      
      // Calculate selection box bounds
      const startX = Math.min(state.selectionBox.start.x, state.selectionBox.end.x)
      const startY = Math.min(state.selectionBox.start.y, state.selectionBox.end.y)
      const endX = Math.max(state.selectionBox.start.x, state.selectionBox.end.x)
      const endY = Math.max(state.selectionBox.start.y, state.selectionBox.end.y)
      
      // Find shapes inside the selection box
      const selectedShapeIds = state.shapes
        .filter(shape => {
          // Check if shape is inside the selection box
          switch (shape.type) {
            case 'rectangle':
            case 'ellipse':
            case 'image': {
              // Check if any corner of the shape is inside the selection box
              const [start, end] = shape.points
              const shapeMinX = Math.min(start.x, end.x)
              const shapeMinY = Math.min(start.y, end.y)
              const shapeMaxX = Math.max(start.x, end.x)
              const shapeMaxY = Math.max(start.y, end.y)
              
              // Check if the shape overlaps with selection box
              return !(
                shapeMaxX < startX ||
                shapeMinX > endX ||
                shapeMaxY < startY ||
                shapeMinY > endY
              )
            }
              
            case 'line':
            case 'pencil':
              // Check if any point of the shape is inside the selection box
              return shape.points.some(point => 
                point.x >= startX && point.x <= endX &&
                point.y >= startY && point.y <= endY
              )
              
            case 'text':
              // Check if the text position is inside the selection box
              return (
                shape.points[0].x >= startX && shape.points[0].x <= endX &&
                shape.points[0].y >= startY && shape.points[0].y <= endY
              )
              
            default:
              return false
          }
        })
        .map(shape => shape.id)
      
      return {
        ...state,
        selectionBox: null,
        selectedShapeIds
      }
    }

    case 'CLEAR_ALL': {
      console.log('🚨 CLEAR_ALL action dispatched!');
      console.log('🚨 Stack trace:', new Error().stack);
      console.log('🚨 CLEAR_ALL - Current shapes count before clearing:', state.shapes.length);
      console.log('🚨 CLEAR_ALL - Timestamp:', new Date().toISOString());
      // End any current drawing first
      if (state.currentShape) {
        // We don't save the current drawing, just discard it.
      }
      return {
        ...state,
        shapes: [],
        currentShape: null,
        selectedShapeIds: [],
        history: {
          past: [...state.history.past, state.shapes],
          future: [],
        },
      }
    }

    case 'SAVE_DRAWING_REQUEST':
      // Implementation of save drawing request
      return state;

    case 'CLEAR_CANVAS':
      // Implementation of clear canvas
      return initialState;

    // Professional features
    case 'ADD_LAYER': {
      return {
        ...state,
        layers: [...state.layers, action.payload]
      }
    }

    case 'UPDATE_LAYER': {
      const updatedLayers = state.layers.map(layer =>
        layer.id === action.payload.layerId
          ? { ...layer, ...action.payload.updates }
          : layer
      );
      return {
        ...state,
        layers: updatedLayers
      }
    }

    case 'DELETE_LAYER': {
      const newLayers = state.layers.filter(layer => layer.id !== action.payload);
      // If we deleted the active layer, switch to the first available layer
      const newActiveLayerId = state.activeLayerId === action.payload 
        ? (newLayers[0]?.id || 'default-layer')
        : state.activeLayerId;
      return {
        ...state,
        layers: newLayers,
        activeLayerId: newActiveLayerId
      }
    }

    case 'SET_ACTIVE_LAYER': {
      return {
        ...state,
        activeLayerId: action.payload
      }
    }

    case 'MOVE_LAYER': {
      const { layerId, direction } = action.payload;
      const layerIndex = state.layers.findIndex(layer => layer.id === layerId);
      if (layerIndex === -1) return state;

      const newLayers = [...state.layers];
      if (direction === 'up' && layerIndex > 0) {
        [newLayers[layerIndex], newLayers[layerIndex - 1]] = [newLayers[layerIndex - 1], newLayers[layerIndex]];
      } else if (direction === 'down' && layerIndex < newLayers.length - 1) {
        [newLayers[layerIndex], newLayers[layerIndex + 1]] = [newLayers[layerIndex + 1], newLayers[layerIndex]];
      }

      return {
        ...state,
        layers: newLayers
      }
    }

    case 'UPDATE_GRID_SETTINGS': {
      return {
        ...state,
        gridSettings: { ...state.gridSettings, ...action.payload }
      }
    }

    case 'TOGGLE_LAYERS_PANEL': {
      return {
        ...state,
        showLayersPanel: !state.showLayersPanel
      }
    }

    case 'TOGGLE_GRID_SETTINGS': {
      return {
        ...state,
        showGridSettings: !state.showGridSettings
      }
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

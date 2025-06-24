export type Point = {
  x: number
  y: number
  isHandTracking?: boolean
  handIndex?: number
}

export type ShapeStyle = {
  strokeColor: string
  fillColor: string
  strokeWidth: number
  opacity: number
  fontSize?: number
}

export type Shape = {
  id: string
  type: 'rectangle' | 'ellipse' | 'line' | 'pencil' | 'text' | 'image'
  points: Point[]
  text?: string
  image?: string
  width?: number
  height?: number
  style: ShapeStyle
  isSelected: boolean
  createdBy?: string // User ID who created the shape
}

export type Tool = 'select' | 'rectangle' | 'ellipse' | 'line' | 'pencil' | 'text' | 'pan' | 'eraser' | 'pixel_eraser' | 'brush' | 'stamp'

export type ViewTransform = {
  scale: number
  offsetX: number
  offsetY: number
}

// User position on screen: top-left, top-right, bottom-left, bottom-right 
export type UserPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface User {
  id: string
  name: string
  color: string
  position: Point
  screenPosition?: UserPosition // Position on screen (top-left, etc.)
  handPosition?: Point
  isHandTracking?: boolean
  isActive: boolean
  cursor?: Point
  isHandTrackingEnabled?: boolean
  webcamEnabled?: boolean
  webcamStreamId?: string
}

// Room types for collaboration
export type RoomType = 'public' | 'private';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  code?: string; // 6-digit code for private rooms
  createdBy: string;
  createdAt: Date;
  maxUsers?: number;
  currentUsers: User[];
  isActive: boolean;
}

// WebSocket message types
export type WebSocketMessage = 
  | { type: 'JOIN_ROOM'; payload: { userId: string; username: string; position: UserPosition; roomId?: string; roomCode?: string } }
  | { type: 'CREATE_ROOM'; payload: { userId: string; roomName: string; roomType: RoomType; maxUsers?: number } }
  | { type: 'ROOM_CREATED'; payload: { room: Room } }
  | { type: 'ROOM_LIST'; payload: { rooms: Room[] } }
  | { type: 'ROOM_JOINED'; payload: { room: Room; user: User } }
  | { type: 'ROOM_ERROR'; payload: { message: string; code?: string } }
  | { type: 'USER_JOINED'; payload: User }
  | { type: 'USER_LEFT'; payload: { userId: string } }
  | { type: 'CURSOR_MOVE'; payload: { userId: string; position: Point } }
  | { type: 'SYNC_SHAPES'; payload: { shapes: Shape[] } }
  | { type: 'SHAPE_ADDED'; payload: { shape: Shape; userId: string } }
  | { type: 'SHAPE_UPDATED'; payload: { shapeId: string; updates: Partial<Shape>; userId: string } }
  | { type: 'SHAPES_DELETED'; payload: { shapeIds: string[]; userId: string } }
  | { type: 'DRAWING_START'; payload: { userId: string; point: Point; tool: string } }
  | { type: 'DRAWING_CONTINUE'; payload: { userId: string; point: Point } }
  | { type: 'DRAWING_END'; payload: { userId: string } }
  | { type: 'ROOM_UPDATED'; payload: { room: Room } }
  | { type: 'REQUEST_SYNC'; payload: { userId: string } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'HAND_TRACKING_STATUS'; payload: { userId: string; isEnabled: boolean } }
  | { type: 'USER_STATUS_UPDATE'; payload: { userId: string; webcamEnabled: boolean } }
  | { type: 'WEBCAM_OFFER'; payload: { userId: string; targetUserId: string; offer: RTCSessionDescriptionInit } }
  | { type: 'WEBCAM_ANSWER'; payload: { userId: string; targetUserId: string; answer: RTCSessionDescriptionInit } }
  | { type: 'WEBCAM_ICE_CANDIDATE'; payload: { userId: string; targetUserId: string; candidate: RTCIceCandidateInit } }

export type WebSocketMessageType = 
  | 'JOIN_ROOM'
  | 'CREATE_ROOM'
  | 'ROOM_CREATED'
  | 'ROOM_LIST'
  | 'ROOM_JOINED'
  | 'ROOM_ERROR'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'CURSOR_MOVE'
  | 'SYNC_SHAPES'
  | 'SHAPE_ADDED'
  | 'SHAPE_UPDATED'
  | 'SHAPES_DELETED'
  | 'DRAWING_START'
  | 'DRAWING_CONTINUE'
  | 'DRAWING_END'
  | 'REQUEST_SYNC'
  | 'ERROR'
  | 'HAND_TRACKING_STATUS'
  | 'USER_STATUS_UPDATE'
  | 'WEBCAM_OFFER'
  | 'WEBCAM_ANSWER'
  | 'WEBCAM_ICE_CANDIDATE';

export interface BrushSettings {
  size: number
  opacity: number
  pressure: number
  texture: 'smooth' | 'rough' | 'watercolor' | 'marker'
}

export interface VoiceChatState {
  isEnabled: boolean
  isMuted: boolean
  isDeafened: boolean
  participants: string[]
  localStream?: MediaStream
}

export interface AdvancedGestureSettings {
  twoHandMode: boolean
  pressureSensitivity: boolean
  gestureToolSelection: boolean
  airWriting: boolean
}

export interface SelectionBox {
  startPoint: Point
  endPoint: Point
  isVisible: boolean
}

export type DrawingState = {
  shapes: Shape[]
  currentShape: Shape | null
  selectedShapeIds: string[]
  tool: Tool
  history: {
    past: Shape[][]
    future: Shape[][]
  }
  viewTransform: ViewTransform
  defaultStyle: ShapeStyle
  // Enhanced drawing features
  brushSettings: BrushSettings
  voiceChat: VoiceChatState
  advancedGestures: AdvancedGestureSettings
  // Collaboration properties
  currentUser?: User
  collaborators: User[]
  currentRoom?: Room
  availableRooms: Room[]
  isConnected: boolean
  peerConnections: Record<string, RTCPeerConnection>
  remoteStreams: Record<string, MediaStream>
  selectionBox?: SelectionBox
}

export type DrawingAction =
  | { type: 'SET_TOOL'; payload: Tool }
  | { type: 'START_DRAWING'; payload: { point: Point; type: Tool } }
  | { type: 'CONTINUE_DRAWING'; payload: Point }
  | { type: 'END_DRAWING' }
  | { type: 'ADD_SHAPE'; payload: Shape }
  | { type: 'UPDATE_SHAPE'; payload: { id: string; updates: Partial<Shape> } }
  | { type: 'DELETE_SHAPES'; payload: string[] }
  | { type: 'SELECT_SHAPES'; payload: string[] }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_STYLE'; payload: Partial<ShapeStyle> }
  | { type: 'SET_FILL_COLOR'; payload: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'CLEAR_ALL' }
  | { type: 'ZOOM'; payload: number }
  | { type: 'PAN'; payload: { x: number; y: number } }
  | { type: 'RESET_VIEW' }
  | { type: 'SYNC_ALL_SHAPES'; payload: Shape[] }
  // Enhanced features actions
  | { type: 'SET_BRUSH_SETTINGS'; payload: Partial<BrushSettings> }
  | { type: 'TOGGLE_VOICE_CHAT'; payload?: boolean }
  | { type: 'SET_VOICE_MUTE'; payload: boolean }
  | { type: 'SET_ADVANCED_GESTURES'; payload: Partial<AdvancedGestureSettings> }
  // Collaboration actions
  | { type: 'SET_CURRENT_USER'; payload: User }
  | { type: 'ADD_COLLABORATOR'; payload: User }
  | { type: 'REMOVE_COLLABORATOR'; payload: string }
  | { type: 'UPDATE_COLLABORATOR'; payload: { userId: string; updates: Partial<User> } }
  | { type: 'SET_CONNECTION_STATUS'; payload: boolean }
  | { type: 'ADD_PEER_CONNECTION'; payload: { userId: string; peerConnection: RTCPeerConnection } }
  | { type: 'REMOVE_PEER_CONNECTION'; payload: { userId: string } }
  | { type: 'ADD_REMOTE_STREAM'; payload: { userId: string; stream: MediaStream } }
  | { type: 'REMOVE_REMOTE_STREAM'; payload: { userId: string } }
  | { type: 'UPDATE_HAND_TRACKING_STATUS'; payload: { userId: string; isEnabled: boolean } }
  | { type: 'SET_SELECTION_BOX'; payload: SelectionBox | null }

// Export all types from handTracking file
export * from './handTracking';

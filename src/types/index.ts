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

export type Tool = 'select' | 'rectangle' | 'ellipse' | 'line' | 'pencil' | 'text' | 'pan' | 'eraser' | 'pixel_eraser'

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
  handPosition?: Point
  isHandTracking?: boolean
  isActive: boolean
  cursor?: Point
  isHandTrackingEnabled?: boolean
  webcamEnabled?: boolean
  webcamStreamId?: string
}

// WebSocket message types
export type WebSocketMessage = 
  | { type: 'JOIN_ROOM'; payload: { userId: string; username: string; position: UserPosition } }
  | { type: 'USER_JOINED'; payload: User }
  | { type: 'USER_LEFT'; payload: { userId: string } }
  | { type: 'CURSOR_MOVE'; payload: { userId: string; position: Point } }
  | { type: 'SYNC_SHAPES'; payload: { shapes: Shape[] } }
  | { type: 'SHAPE_ADDED'; payload: { shape: Shape; userId: string } }
  | { type: 'SHAPE_UPDATED'; payload: { shapeId: string; updates: Partial<Shape>; userId: string } }
  | { type: 'SHAPES_DELETED'; payload: { shapeIds: string[]; userId: string } }
  | { type: 'REQUEST_SYNC'; payload: { userId: string } }
  | { type: 'ERROR'; payload: { message: string } }
  | { type: 'HAND_TRACKING_STATUS'; payload: { userId: string; isEnabled: boolean } }
  | { type: 'USER_STATUS_UPDATE'; payload: { userId: string; webcamEnabled: boolean } }
  | { type: 'WEBCAM_OFFER'; payload: { userId: string; targetUserId: string; offer: RTCSessionDescriptionInit } }
  | { type: 'WEBCAM_ANSWER'; payload: { userId: string; targetUserId: string; answer: RTCSessionDescriptionInit } }
  | { type: 'WEBCAM_ICE_CANDIDATE'; payload: { userId: string; targetUserId: string; candidate: RTCIceCandidateInit } }

export type WebSocketMessageType = 
  | 'JOIN_ROOM'
  | 'USER_JOINED'
  | 'USER_LEFT'
  | 'CURSOR_MOVE'
  | 'SYNC_SHAPES'
  | 'SHAPE_ADDED'
  | 'SHAPE_UPDATED'
  | 'SHAPES_DELETED'
  | 'REQUEST_SYNC'
  | 'ERROR'
  | 'HAND_TRACKING_STATUS'
  | 'USER_STATUS_UPDATE'
  | 'WEBCAM_OFFER'
  | 'WEBCAM_ANSWER'
  | 'WEBCAM_ICE_CANDIDATE';

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
  // Collaboration properties
  currentUser?: User
  collaborators: User[]
  isConnected: boolean
  peerConnections: Record<string, RTCPeerConnection>
  remoteStreams: Record<string, MediaStream>
}

// Export all types from handTracking file
export * from './handTracking';

// Web Speech API declarations
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition;
  new(): SpeechRecognition;
};

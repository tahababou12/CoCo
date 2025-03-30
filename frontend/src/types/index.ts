export type Point = {
  x: number
  y: number
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
  type: 'rectangle' | 'ellipse' | 'line' | 'pencil' | 'text'
  points: Point[]
  text?: string
  style: ShapeStyle
  isSelected: boolean
}

export type Tool = 'select' | 'rectangle' | 'ellipse' | 'line' | 'pencil' | 'text' | 'pan' | 'eraser' | 'pixel_eraser'

export type ViewTransform = {
  scale: number
  offsetX: number
  offsetY: number
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
}

// Export all types from handTracking file
export * from './handTracking';

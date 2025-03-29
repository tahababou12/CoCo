import { Shape } from '../types'

export const renderShape = (ctx: CanvasRenderingContext2D, shape: Shape) => {
  const { points, style, type, isSelected } = shape

  // Set common styles
  ctx.strokeStyle = style.strokeColor
  ctx.fillStyle = style.fillColor
  ctx.lineWidth = style.strokeWidth
  ctx.globalAlpha = style.opacity

  // Draw based on shape type
  switch (type) {
    case 'rectangle':
      drawRectangle(ctx, points, style.fillColor, isSelected)
      break
    case 'ellipse':
      drawEllipse(ctx, points, style.fillColor, isSelected)
      break
    case 'line':
      drawLine(ctx, points, isSelected)
      break
    case 'pencil':
      drawPencil(ctx, points, isSelected)
      break
    case 'text':
      drawText(ctx, points[0], shape.text || '', style.fontSize || 16, isSelected)
      break
    default:
      break
  }

  // Reset opacity
  ctx.globalAlpha = 1
}

const drawRectangle = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  fillColor: string,
  isSelected: boolean
) => {
  if (points.length < 2) return

  const [start, end] = points
  const width = end.x - start.x
  const height = end.y - start.y

  // Draw rectangle
  if (fillColor !== 'transparent') {
    ctx.fillRect(start.x, start.y, width, height)
  }
  ctx.strokeRect(start.x, start.y, width, height)

  // Draw selection handles if selected
  if (isSelected) {
    drawSelectionHandles(ctx, start.x, start.y, width, height)
  }
}

const drawEllipse = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  fillColor: string,
  isSelected: boolean
) => {
  if (points.length < 2) return

  const [start, end] = points
  const centerX = (start.x + end.x) / 2
  const centerY = (start.y + end.y) / 2
  const radiusX = Math.abs(end.x - start.x) / 2
  const radiusY = Math.abs(end.y - start.y) / 2

  // Draw ellipse
  ctx.beginPath()
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
  if (fillColor !== 'transparent') {
    ctx.fill()
  }
  ctx.stroke()

  // Draw selection handles if selected
  if (isSelected) {
    drawSelectionHandles(ctx, start.x, start.y, end.x - start.x, end.y - start.y)
  }
}

const drawLine = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  isSelected: boolean
) => {
  if (points.length < 2) return

  const [start, end] = points

  // Draw line
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()

  // Draw selection handles if selected
  if (isSelected) {
    drawEndpointHandles(ctx, start, end)
  }
}

const drawPencil = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  isSelected: boolean
) => {
  if (points.length < 2) return

  // Draw pencil path
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  
  ctx.stroke()

  // Draw selection outline if selected
  if (isSelected) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    
    points.forEach(point => {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    })
    
    const width = maxX - minX
    const height = maxY - minY
    
    drawSelectionHandles(ctx, minX, minY, width, height)
  }
}

const drawText = (
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  text: string,
  fontSize: number,
  isSelected: boolean
) => {
  // Set text styles
  ctx.font = `${fontSize}px sans-serif`
  ctx.textBaseline = 'top'
  
  // Draw text
  ctx.fillText(text, position.x, position.y)
  
  // Draw selection outline if selected
  if (isSelected) {
    const metrics = ctx.measureText(text)
    const width = metrics.width
    const height = fontSize * 1.2
    
    ctx.strokeStyle = '#4299e1'
    ctx.lineWidth = 1
    ctx.strokeRect(position.x - 2, position.y - 2, width + 4, height + 4)
    
    // Draw selection handles
    drawSelectionHandles(ctx, position.x, position.y, width, height)
  }
}

const drawSelectionHandles = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) => {
  // Draw selection outline
  const originalStroke = ctx.strokeStyle
  const originalLineWidth = ctx.lineWidth
  
  ctx.strokeStyle = '#4299e1'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 5])
  ctx.strokeRect(x, y, width, height)
  ctx.setLineDash([])
  
  // Draw handles at corners
  const handleSize = 6
  const handles = [
    { x, y }, // top-left
    { x: x + width, y }, // top-right
    { x: x + width, y: y + height }, // bottom-right
    { x, y: y + height }, // bottom-left
    { x: x + width / 2, y }, // top-middle
    { x: x + width, y: y + height / 2 }, // right-middle
    { x: x + width / 2, y: y + height }, // bottom-middle
    { x, y: y + height / 2 }, // left-middle
  ]
  
  ctx.fillStyle = 'white'
  ctx.strokeStyle = '#4299e1'
  ctx.lineWidth = 1
  
  handles.forEach(handle => {
    ctx.beginPath()
    ctx.rect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
    ctx.fill()
    ctx.stroke()
  })
  
  // Restore original styles
  ctx.strokeStyle = originalStroke
  ctx.lineWidth = originalLineWidth
}

const drawEndpointHandles = (
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number }
) => {
  // Draw selection line
  const originalStroke = ctx.strokeStyle
  const originalLineWidth = ctx.lineWidth
  
  ctx.strokeStyle = '#4299e1'
  ctx.lineWidth = 1
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  ctx.lineTo(end.x, end.y)
  ctx.stroke()
  ctx.setLineDash([])
  
  // Draw handles at endpoints
  const handleSize = 6
  const handles = [start, end]
  
  ctx.fillStyle = 'white'
  ctx.strokeStyle = '#4299e1'
  ctx.lineWidth = 1
  
  handles.forEach(handle => {
    ctx.beginPath()
    ctx.rect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize)
    ctx.fill()
    ctx.stroke()
  })
  
  // Restore original styles
  ctx.strokeStyle = originalStroke
  ctx.lineWidth = originalLineWidth
}

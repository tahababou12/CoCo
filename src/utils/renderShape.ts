import { Shape } from '../types'

export const renderShape = (ctx: CanvasRenderingContext2D, shape: Shape): void => {
  // Save current context state
  ctx.save()

  // Set line style
  ctx.strokeStyle = shape.style.strokeColor || 'black'
  ctx.lineWidth = shape.style.strokeWidth || 1
  
  // Set fill style
  ctx.fillStyle = shape.style.fillColor || 'transparent'
  
  // Set opacity if available
  if (shape.style.opacity !== undefined) {
    ctx.globalAlpha = shape.style.opacity
  }
  
  // Set global composite operation if available (for erasing)
  if (shape.style.globalCompositeOperation) {
    ctx.globalCompositeOperation = shape.style.globalCompositeOperation
  }

  // Draw based on shape type
  switch (shape.type) {
    case 'rectangle':
      drawRectangle(ctx, shape.points, shape.style.fillColor, shape.isSelected)
      break
    case 'ellipse':
      drawEllipse(ctx, shape.points, shape.style.fillColor, shape.isSelected)
      break
    case 'line':
      drawLine(ctx, shape.points, shape.isSelected)
      break
    case 'triangle':
      drawTriangle(ctx, shape.points, shape.isSelected)
      break
    case 'pencil':
      drawPencil(ctx, shape.points, shape.isSelected)
      break
    case 'text':
      drawText(ctx, shape.points[0], shape.text || '', shape.style.fontSize || 16, shape.isSelected)
      break
    case 'image': {
      if (shape.image && shape.points.length >= 2) {
        // Handle multiple points by finding the bounding box
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        
        shape.points.forEach(point => {
          minX = Math.min(minX, point.x)
          minY = Math.min(minY, point.y)
          maxX = Math.max(maxX, point.x)
          maxY = Math.max(maxY, point.y)
        })
        
        const width = maxX - minX
        const height = maxY - minY
        
        // Load image
        const img = new Image();
        img.src = shape.image;
        
        // If the image is already loaded, draw it immediately
        if (img.complete) {
          ctx.drawImage(img, minX, minY, width, height);
        } else {
          // Otherwise, draw when loaded
          img.onload = () => {
            ctx.drawImage(img, minX, minY, width, height);
          };
        }
      }
      break;
    }
    default:
      break
  }

  // Restore context state
  ctx.restore()
}

const drawRectangle = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  fillColor: string,
  isSelected: boolean
) => {
  if (points.length < 2) return

  // Handle multiple points by finding the bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  
  points.forEach(point => {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  })
  
  const width = maxX - minX
  const height = maxY - minY

  // Draw rectangle
  if (fillColor !== 'transparent') {
    ctx.fillRect(minX, minY, width, height)
  }
  ctx.strokeRect(minX, minY, width, height)

  // Draw selection handles if selected
  if (isSelected) {
    drawSelectionHandles(ctx, minX, minY, width, height)
  }
}

const drawEllipse = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  fillColor: string,
  isSelected: boolean
) => {
  if (points.length < 2) return

  // Handle multiple points by finding the bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  
  points.forEach(point => {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  })
  
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const radiusX = Math.abs(maxX - minX) / 2
  const radiusY = Math.abs(maxY - minY) / 2

  // Draw ellipse
  ctx.beginPath()
  ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
  if (fillColor !== 'transparent') {
    ctx.fill()
  }
  ctx.stroke()

  // Draw selection handles if selected
  if (isSelected) {
    drawSelectionHandles(ctx, minX, minY, maxX - minX, maxY - minY)
  }
}

const drawLine = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  isSelected: boolean
) => {
  if (points.length < 2) return

  // Handle multiple points by drawing a path through all of them
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y)
  }
  
  ctx.stroke()

  // Draw selection handles if selected
  if (isSelected) {
    // Use first and last points for selection handles
    const start = points[0]
    const end = points[points.length - 1]
    drawEndpointHandles(ctx, start, end)
  }
}

const drawTriangle = (
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  isSelected: boolean
) => {
  if (points.length < 3) return

  // Draw triangle with all 3 sides
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  ctx.lineTo(points[1].x, points[1].y)
  ctx.lineTo(points[2].x, points[2].y)
  ctx.closePath() // This automatically closes the triangle
  ctx.stroke()

  // Draw selection handles if selected
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

import { Point, Shape } from '../types'

export const hitTest = (shape: Shape, point: Point): boolean => {
  switch (shape.type) {
    case 'rectangle':
      return hitTestRectangle(shape.points, point)
    case 'ellipse':
      return hitTestEllipse(shape.points, point)
    case 'line':
      return hitTestLine(shape.points, point)
    case 'pencil':
      return hitTestPencil(shape.points, point)
    case 'text':
      return hitTestText(shape.points[0], point, shape.text || '', shape.style.fontSize || 16)
    default:
      return false
  }
}

const hitTestRectangle = (points: Point[], point: Point): boolean => {
  if (points.length < 2) return false

  const [start, end] = points
  const minX = Math.min(start.x, end.x)
  const maxX = Math.max(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  const maxY = Math.max(start.y, end.y)

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
}

const hitTestEllipse = (points: Point[], point: Point): boolean => {
  if (points.length < 2) return false

  const [start, end] = points
  const centerX = (start.x + end.x) / 2
  const centerY = (start.y + end.y) / 2
  const radiusX = Math.abs(end.x - start.x) / 2
  const radiusY = Math.abs(end.y - start.y) / 2

  // Normalize point to ellipse center
  const normalizedX = point.x - centerX
  const normalizedY = point.y - centerY

  // Check if point is inside ellipse using the ellipse equation
  return (normalizedX * normalizedX) / (radiusX * radiusX) + (normalizedY * normalizedY) / (radiusY * radiusY) <= 1
}

const hitTestLine = (points: Point[], point: Point): boolean => {
  if (points.length < 2) return false

  const [start, end] = points
  const tolerance = 5 // Tolerance in pixels

  // Calculate distance from point to line
  const lineLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
  if (lineLength === 0) return false

  const distance =
    Math.abs((end.y - start.y) * point.x - (end.x - start.x) * point.y + end.x * start.y - end.y * start.x) /
    lineLength

  // Check if point is close enough to the line
  if (distance > tolerance) return false

  // Check if point is within the bounding box of the line
  const minX = Math.min(start.x, end.x) - tolerance
  const maxX = Math.max(start.x, end.x) + tolerance
  const minY = Math.min(start.y, end.y) - tolerance
  const maxY = Math.max(start.y, end.y) + tolerance

  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
}

const hitTestPencil = (points: Point[], point: Point): boolean => {
  if (points.length < 2) return false

  // Check if point is close to any segment of the pencil path
  const tolerance = 5 // Tolerance in pixels

  for (let i = 1; i < points.length; i++) {
    const start = points[i - 1]
    const end = points[i]

    // Calculate distance from point to line segment
    const lineLength = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
    if (lineLength === 0) continue

    const distance =
      Math.abs((end.y - start.y) * point.x - (end.x - start.x) * point.y + end.x * start.y - end.y * start.x) /
      lineLength

    // Check if point is close enough to the line segment
    if (distance <= tolerance) {
      // Check if point is within the bounding box of the line segment
      const minX = Math.min(start.x, end.x) - tolerance
      const maxX = Math.max(start.x, end.x) + tolerance
      const minY = Math.min(start.y, end.y) - tolerance
      const maxY = Math.max(start.y, end.y) + tolerance

      if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
        return true
      }
    }
  }

  return false
}

const hitTestText = (position: Point, point: Point, text: string, fontSize: number): boolean => {
  // Approximate text dimensions
  const width = text.length * (fontSize * 0.6) // Rough estimate of text width
  const height = fontSize * 1.2

  // Check if point is within text bounding box
  return (
    point.x >= position.x &&
    point.x <= position.x + width &&
    point.y >= position.y &&
    point.y <= position.y + height
  )
}

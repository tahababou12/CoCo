import React, { useState, useRef, useEffect } from 'react'

interface DraggableDebugPanelProps {
  title: string
  children: React.ReactNode
  initialPosition?: { x: number; y: number }
  className?: string
  style?: React.CSSProperties
}

const DraggableDebugPanel: React.FC<DraggableDebugPanelProps> = ({
  title,
  children,
  initialPosition = { x: 20, y: 20 },
  className = '',
  style = {}
}) => {
  const [position, setPosition] = useState(initialPosition)
  const [isDragging, setIsDragging] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const panelRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!panelRef.current) return
    
    const rect = panelRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setIsDragging(true)
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return
    
    const newX = e.clientX - dragOffset.x
    const newY = e.clientY - dragOffset.y
    
    // Keep panel within window bounds
    const maxX = window.innerWidth - (panelRef.current?.offsetWidth || 0)
    const maxY = window.innerHeight - (panelRef.current?.offsetHeight || 0)
    
    setPosition({
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const toggleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMinimized(!isMinimized)
  }

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragOffset])

  const defaultStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y,
    zIndex: 1000,
    userSelect: 'none',
    minWidth: '200px',
    ...style
  }

  return (
    <div
      ref={panelRef}
      className={`bg-white rounded shadow-md border border-gray-300 ${className}`}
      style={defaultStyle}
    >
      {/* Draggable header */}
      <div
        className="bg-gray-100 px-3 py-2 rounded-t border-b border-gray-300 cursor-move flex items-center justify-between"
        onMouseDown={handleMouseDown}
      >
        <span className="text-sm font-bold text-gray-700">{title}</span>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMinimize}
            className="w-4 h-4 rounded-full bg-yellow-400 hover:bg-yellow-500 flex items-center justify-center text-xs"
            title={isMinimized ? "Maximize" : "Minimize"}
          >
            {isMinimized ? "+" : "−"}
          </button>
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
          </div>
        </div>
      </div>
      
      {/* Panel content */}
      {!isMinimized && (
        <div className="p-2">
          {children}
        </div>
      )}
    </div>
  )
}

export default DraggableDebugPanel 
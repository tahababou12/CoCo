import React, { useState } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { Download, Share2, Clock, User, ChevronDown } from 'lucide-react'

const Header: React.FC = () => {
  const { state } = useDrawing()
  const [documentName, setDocumentName] = useState('Untitled')
  
  const handleExport = () => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    // Find bounds of all shapes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    
    state.shapes.forEach(shape => {
      shape.points.forEach(point => {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
        maxX = Math.max(maxX, point.x)
        maxY = Math.max(maxY, point.y)
      })
    })
    
    // Add padding
    minX = Math.max(0, minX - 20)
    minY = Math.max(0, minY - 20)
    maxX = maxX + 20
    maxY = maxY + 20
    
    const width = maxX - minX
    const height = maxY - minY
    
    // Set canvas size
    canvas.width = width
    canvas.height = height
    
    // Draw shapes
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, width, height)
    
    ctx.translate(-minX, -minY)
    
    state.shapes.forEach(shape => {
      const { renderShape } = require('../utils/renderShape')
      renderShape(ctx, shape)
    })
    
    // Create download link
    const link = document.createElement('a')
    link.download = 'drawing.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDocumentName(e.target.value)
  }

  return (
    <header className="bg-white border-b border-neutral-100 px-2 py-1.5 flex items-center justify-between shadow-sm">
      <div className="flex items-center">
        <button className="w-8 h-8 rounded-md hover:bg-neutral-100 flex items-center justify-center mr-1">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6H20M4 12H20M4 18H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        
        <div className="flex items-center mr-2">
          <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
            C
          </div>
        </div>
        
        <div className="flex items-center">
          <input 
            type="text" 
            value={documentName} 
            onChange={handleNameChange}
            className="text-sm font-medium text-neutral-800 bg-transparent border-none outline-none focus:outline-none focus:ring-0 px-1 py-0.5 rounded hover:bg-neutral-100 focus:bg-neutral-100 transition-colors"
          />
          <span className="text-xs text-neutral-400 ml-1 font-normal">Free</span>
        </div>
        
        <button className="ml-1 p-1 rounded hover:bg-neutral-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V20M20 12H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      
      <div className="flex items-center space-x-1">
        <div className="flex items-center bg-neutral-100 rounded-md p-0.5">
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors">
            <User size={16} />
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors">
            <Clock size={16} />
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        <div className="flex items-center bg-neutral-100 rounded-md p-0.5">
          <button 
            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors"
            onClick={handleExport}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 7H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        <button className="px-3 py-1.5 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors">
          Share
        </button>
      </div>
    </header>
  )
}

export default Header

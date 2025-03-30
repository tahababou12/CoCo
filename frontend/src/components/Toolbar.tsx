import React, { useState, useEffect } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { useHandGesture } from './HandDrawing'
import { Tool } from '../types'
import { 
  MousePointer, 
  Square, 
  Circle, 
  Type, 
  Pencil, 
  Move, 
  Eraser,
  Plus,
  Minus,
  Palette,
  RotateCcw
} from 'lucide-react'

const Toolbar: React.FC = () => {
  const { state, dispatch } = useDrawing()
  const { currentGestures, isHandTrackingActive } = useHandGesture()
  const [showColorPicker, setShowColorPicker] = useState(false)

  // Get primary hand gesture (from first hand)
  const primaryGesture = currentGestures[0] || 'None'
  
  // Add debugging logs
  useEffect(() => {
    console.log('Toolbar - Hand tracking active:', isHandTrackingActive)
    console.log('Toolbar - Current gestures:', currentGestures)
    console.log('Toolbar - Primary gesture:', primaryGesture)
  }, [isHandTrackingActive, currentGestures, primaryGesture])

  // Function to get a friendly display text for the hand gesture
  const getGestureDisplayText = () => {
    if (!isHandTrackingActive) return 'Hand Tracking Off'
    
    // When hand tracking is active but no hands are detected
    if (!currentGestures || Object.keys(currentGestures).length === 0) {
      return 'No Hands Detected 👀'
    }
    
    // Log the gesture value for debugging
    console.log('Current primary gesture in toolbar:', primaryGesture)
    
    switch (primaryGesture) {
      case 'Drawing':
        return 'Drawing ✍️'
      case 'Erasing':
        return 'Erasing 🧹'
      case 'Clear All':
        return 'Clear All 🗑️'
      case 'None':
        // When a hand is detected but no specific gesture is recognized
        return 'Hand Detected 👋'
      default:
        return 'Hand Detected 👋'
    }
  }
  
  // Add debugging for the rendered text
  useEffect(() => {
    console.log('Toolbar - Display text:', getGestureDisplayText())
  }, [primaryGesture, isHandTrackingActive])

  const handleToolClick = (tool: Tool) => {
    console.log(`Setting tool to: ${tool}`)
    dispatch({ type: 'SET_TOOL', payload: tool })
  }

  const handleStrokeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: 'SET_STYLE',
      payload: { strokeColor: e.target.value },
    })
  }

  const handleFillColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: 'SET_FILL_COLOR',
      payload: e.target.value === '#000000' ? 'transparent' : e.target.value,
    })
  }

  const handleStrokeWidthChange = (value: number) => {
    dispatch({
      type: 'SET_STYLE',
      payload: { strokeWidth: value },
    })
  }

  const handleFontSizeChange = (value: number) => {
    dispatch({
      type: 'SET_STYLE',
      payload: { fontSize: value },
    })
  }

  const toggleColorPicker = () => {
    setShowColorPicker(!showColorPicker)
  }

  const handleZoomIn = () => {
    dispatch({ type: 'ZOOM', payload: 0.1 })
  }

  const handleZoomOut = () => {
    dispatch({ type: 'ZOOM', payload: -0.1 })
  }

  const handleResetView = () => {
    dispatch({ type: 'RESET_VIEW' })
  }

  return (
    <>
      {/* Main toolbar */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center z-10">
        {/* Hand gesture indicator - always show with different styling based on state */}
        <div className="mb-2 bg-white text-xs px-2 py-0.5 rounded-full shadow-sm">
          <span className={`${
            !isHandTrackingActive 
              ? 'text-gray-400' 
              : primaryGesture === 'Clear All' 
                ? 'text-red-600' 
                : 'text-purple-600'
          }`}>
            {getGestureDisplayText()}
          </span>
        </div>
        
        <div className="bg-white rounded-xl shadow-lg border border-neutral-200 flex items-center overflow-hidden">
          {/* Selection tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'select' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('select')}
            title="Select"
          >
            <MousePointer size={20} />
          </button>
          
          {/* Pencil tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'pencil' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('pencil')}
            title="Pencil"
          >
            <Pencil size={20} />
          </button>
          
          {/* Circle tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'ellipse' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('ellipse')}
            title="Circle"
          >
            <Circle size={20} />
          </button>
          
          {/* Rectangle tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'rectangle' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('rectangle')}
            title="Rectangle"
          >
            <Square size={20} />
          </button>
          
          {/* Text tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'text' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('text')}
            title="Text"
          >
            <Type size={20} />
          </button>
          
          {/* Line tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'line' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('line')}
            title="Line"
          >
            <div className="w-5 h-5 flex items-center justify-center">—</div>
          </button>
          
          {/* Eraser tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'eraser' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('eraser')}
            title="Object Eraser"
          >
            <Eraser size={20} />
          </button>
          
          {/* Pixel Eraser tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'pixel_eraser' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('pixel_eraser')}
            title="Pixel Eraser"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6" />
              <path d="M10 14L21 3" />
            </svg>
          </button>
          
          {/* Pan tool */}
          <button
            className={`p-2 rounded-lg ${
              state.tool === 'pan' ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={() => handleToolClick('pan')}
            title="Pan"
          >
            <Move size={20} />
          </button>
          
          {/* Color picker button */}
          <button
            className={`p-2 rounded-lg ${
              showColorPicker ? 'bg-purple-100 text-purple-700' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
            onClick={toggleColorPicker}
            title="Colors"
          >
            <Palette size={20} />
          </button>
        </div>
        
        {/* Color picker panel */}
        {showColorPicker && (
          <div className="mt-2 p-3 bg-white rounded-xl shadow-lg border border-neutral-200">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">Stroke:</label>
                <div className="relative">
                  <input
                    type="color"
                    value={state.defaultStyle.strokeColor}
                    onChange={handleStrokeColorChange}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                  <div 
                    className="absolute inset-0 rounded border border-neutral-300 pointer-events-none"
                    style={{ backgroundColor: state.defaultStyle.strokeColor }}
                  ></div>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    className={`w-6 h-6 rounded ${state.defaultStyle.strokeWidth === 1 ? 'bg-neutral-100' : ''}`}
                    onClick={() => handleStrokeWidthChange(1)}
                  >
                    <div className="w-4 h-1 bg-black mx-auto rounded-full"></div>
                  </button>
                  <button 
                    className={`w-6 h-6 rounded ${state.defaultStyle.strokeWidth === 2 ? 'bg-neutral-100' : ''}`}
                    onClick={() => handleStrokeWidthChange(2)}
                  >
                    <div className="w-4 h-1.5 bg-black mx-auto rounded-full"></div>
                  </button>
                  <button 
                    className={`w-6 h-6 rounded ${state.defaultStyle.strokeWidth === 4 ? 'bg-neutral-100' : ''}`}
                    onClick={() => handleStrokeWidthChange(4)}
                  >
                    <div className="w-4 h-2 bg-black mx-auto rounded-full"></div>
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <label className="text-sm text-neutral-600">Fill:</label>
                <div className="relative">
                  <input
                    type="color"
                    value={state.defaultStyle.fillColor === 'transparent' ? '#ffffff' : state.defaultStyle.fillColor}
                    onChange={handleFillColorChange}
                    className="w-8 h-8 rounded cursor-pointer"
                  />
                  <div 
                    className="absolute inset-0 rounded border border-neutral-300 pointer-events-none"
                    style={{ 
                      backgroundColor: state.defaultStyle.fillColor === 'transparent' ? 'white' : state.defaultStyle.fillColor,
                      backgroundImage: state.defaultStyle.fillColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)' : 'none',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 4px 4px'
                    }}
                  ></div>
                </div>
                <button 
                  className={`px-2 py-1 text-xs rounded ${state.defaultStyle.fillColor === 'transparent' ? 'bg-neutral-100' : ''}`}
                  onClick={() => dispatch({ type: 'SET_FILL_COLOR', payload: 'transparent' })}
                >
                  None
                </button>
              </div>
              
              {state.tool === 'text' && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-neutral-600">Font:</label>
                  <div className="flex items-center gap-1">
                    <button 
                      className={`w-6 h-6 rounded ${state.defaultStyle.fontSize === 12 ? 'bg-neutral-100' : ''}`}
                      onClick={() => handleFontSizeChange(12)}
                    >
                      <span className="text-xs">A</span>
                    </button>
                    <button 
                      className={`w-6 h-6 rounded ${state.defaultStyle.fontSize === 16 ? 'bg-neutral-100' : ''}`}
                      onClick={() => handleFontSizeChange(16)}
                    >
                      <span className="text-sm">A</span>
                    </button>
                    <button 
                      className={`w-6 h-6 rounded ${state.defaultStyle.fontSize === 24 ? 'bg-neutral-100' : ''}`}
                      onClick={() => handleFontSizeChange(24)}
                    >
                      <span className="text-base">A</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Zoom controls - positioned on the right side */}
      <div className="absolute right-4 bottom-4 flex items-center space-x-1 z-10">
        <button
          onClick={handleZoomOut}
          className="w-8 h-8 rounded-md bg-white shadow-md border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-100"
          title="Zoom Out"
        >
          <Minus size={16} />
        </button>
        
        <button
          onClick={handleZoomIn}
          className="w-8 h-8 rounded-md bg-white shadow-md border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-100"
          title="Zoom In"
        >
          <Plus size={16} />
        </button>
        
        <button
          onClick={handleResetView}
          className="w-8 h-8 rounded-md bg-white shadow-md border border-neutral-200 flex items-center justify-center text-neutral-700 hover:bg-neutral-100"
          title="Reset View"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </>
  )
}

export default Toolbar

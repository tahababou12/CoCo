import React, { useState, useEffect } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { useHandGesture } from '../context/HandGestureContext'
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
        return '🖐️ Drawing Mode'
      case 'Clearing':
        return '🤙 Clear Mode'
      case 'Clicking':
        return '✊ Click Mode'
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
    // Update color without changing the current tool
    dispatch({
      type: 'SET_STYLE',
      payload: { strokeColor: e.target.value },
    })
    
    // Make sure current tool remains active
    if (['pencil', 'rectangle', 'ellipse', 'line', 'text'].includes(state.tool)) {
      console.log(`Keeping current tool (${state.tool}) active after color change`)
    }
  }

  const handleFillColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({
      type: 'SET_FILL_COLOR',
      payload: e.target.value === '#000000' ? 'transparent' : e.target.value,
    })
    
    // Make sure current tool remains active
    if (['rectangle', 'ellipse'].includes(state.tool)) {
      console.log(`Keeping current tool (${state.tool}) active after fill color change`)
    }
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
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex flex-col items-center z-10">
        {/* Hand gesture indicator - Enhanced styling */}
        <div className="mb-3 bg-white/90 backdrop-blur-md text-sm px-4 py-2 rounded-full shadow-lg border border-purple-200">
          <span className={`font-medium ${
            !isHandTrackingActive 
              ? 'text-purple-400' 
              : primaryGesture === 'Clear All' 
                ? 'text-red-600' 
                : 'text-purple-600'
          }`}>
            {getGestureDisplayText()}
          </span>
        </div>
        
        {/* Main toolbar container */}
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-purple-200 flex items-center overflow-hidden">
          {/* Selection tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'select' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('select')}
            title="Select"
          >
            <MousePointer size={22} />
          </button>
          
          {/* Divider */}
          <div className="w-px h-8 bg-slate-200 mx-1"></div>
          
          {/* Pencil tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'pencil' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('pencil')}
            title="Pencil"
          >
            <Pencil size={22} />
          </button>
          
          {/* Circle tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'ellipse' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('ellipse')}
            title="Circle"
          >
            <Circle size={22} />
          </button>
          
          {/* Rectangle tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'rectangle' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('rectangle')}
            title="Rectangle"
          >
            <Square size={22} />
          </button>
          
          {/* Line tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'line' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('line')}
            title="Line"
          >
            <div className="w-5 h-5 flex items-center justify-center font-bold text-slate-700">—</div>
          </button>
          
          {/* Divider */}
          <div className="w-px h-8 bg-slate-200 mx-1"></div>
          
          {/* Text tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'text' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('text')}
            title="Text"
          >
            <Type size={22} />
          </button>
          
          {/* Divider */}
          <div className="w-px h-8 bg-slate-200 mx-1"></div>
          
          {/* Eraser tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'eraser' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('eraser')}
            title="Object Eraser"
          >
            <Eraser size={22} />
          </button>
          
          {/* Pixel Eraser tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'pixel_eraser' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('pixel_eraser')}
            title="Pixel Eraser"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <path d="M15 3h6v6" />
              <path d="M10 14L21 3" />
            </svg>
          </button>
          
          {/* Divider */}
          <div className="w-px h-8 bg-slate-200 mx-1"></div>
          
          {/* Pan tool */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              state.tool === 'pan' ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={() => handleToolClick('pan')}
            title="Pan"
          >
            <Move size={22} />
          </button>
          
          {/* Color picker button */}
          <button
            className={`p-3 rounded-xl transition-all duration-200 ${
              showColorPicker ? 'bg-purple-100 text-purple-700 shadow-inner' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
            onClick={toggleColorPicker}
            title="Colors"
          >
            <Palette size={22} />
          </button>
        </div>
        
        {/* Color picker panel - Enhanced styling */}
        {showColorPicker && (
          <div className="mt-3 p-4 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-purple-200">
            <div className="flex flex-col gap-4">
              {/* Stroke Color */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-purple-700 min-w-[60px]">Stroke:</label>
                <div className="relative">
                  <input
                    type="color"
                    value={state.defaultStyle.strokeColor}
                    onChange={handleStrokeColorChange}
                    className="w-10 h-10 rounded-lg cursor-pointer border-2 border-purple-200 hover:border-purple-300 transition-colors"
                  />
                  <div 
                    className="absolute inset-0 rounded-lg border-2 border-purple-300 pointer-events-none"
                    style={{ backgroundColor: state.defaultStyle.strokeColor }}
                  ></div>
                </div>
                
                {/* Stroke Width */}
                <div className="flex items-center gap-1 bg-purple-100 rounded-lg p-1">
                  <button 
                    className={`w-8 h-8 rounded-md transition-all duration-200 ${
                      state.defaultStyle.strokeWidth === 1 ? 'bg-white shadow-sm' : 'hover:bg-purple-200'
                    }`}
                    onClick={() => handleStrokeWidthChange(1)}
                    title="1px"
                  >
                    <div className="w-4 h-1 bg-purple-700 mx-auto rounded-full"></div>
                  </button>
                  <button 
                    className={`w-8 h-8 rounded-md transition-all duration-200 ${
                      state.defaultStyle.strokeWidth === 2 ? 'bg-white shadow-sm' : 'hover:bg-purple-200'
                    }`}
                    onClick={() => handleStrokeWidthChange(2)}
                    title="2px"
                  >
                    <div className="w-4 h-1.5 bg-purple-700 mx-auto rounded-full"></div>
                  </button>
                  <button 
                    className={`w-8 h-8 rounded-md transition-all duration-200 ${
                      state.defaultStyle.strokeWidth === 4 ? 'bg-white shadow-sm' : 'hover:bg-purple-200'
                    }`}
                    onClick={() => handleStrokeWidthChange(4)}
                    title="4px"
                  >
                    <div className="w-4 h-2 bg-purple-700 mx-auto rounded-full"></div>
                  </button>
                </div>
              </div>
              
              {/* Fill Color */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-purple-700 min-w-[60px]">Fill:</label>
                <div className="relative">
                  <input
                    type="color"
                    value={state.defaultStyle.fillColor === 'transparent' ? '#ffffff' : state.defaultStyle.fillColor}
                    onChange={handleFillColorChange}
                    className="w-10 h-10 rounded-lg cursor-pointer border-2 border-purple-200 hover:border-purple-300 transition-colors"
                  />
                  <div 
                    className="absolute inset-0 rounded-lg border-2 border-purple-300 pointer-events-none"
                    style={{ 
                      backgroundColor: state.defaultStyle.fillColor === 'transparent' ? 'white' : state.defaultStyle.fillColor,
                      backgroundImage: state.defaultStyle.fillColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)' : 'none',
                      backgroundSize: '8px 8px',
                      backgroundPosition: '0 0, 4px 4px'
                    }}
                  ></div>
                </div>
                <button 
                  className={`px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                    state.defaultStyle.fillColor === 'transparent' ? 'bg-purple-100 text-purple-700' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'
                  }`}
                  onClick={() => dispatch({ type: 'SET_FILL_COLOR', payload: 'transparent' })}
                >
                  None
                </button>
              </div>
              
              {/* Font Size - Only for text tool */}
              {state.tool === 'text' && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-purple-700 min-w-[60px]">Font:</label>
                  <div className="flex items-center gap-1 bg-purple-100 rounded-lg p-1">
                    <button 
                      className={`w-8 h-8 rounded-md transition-all duration-200 ${
                        state.defaultStyle.fontSize === 12 ? 'bg-white shadow-sm' : 'hover:bg-purple-200'
                      }`}
                      onClick={() => handleFontSizeChange(12)}
                      title="12px"
                    >
                      <span className="text-xs font-bold text-purple-700">A</span>
                    </button>
                    <button 
                      className={`w-8 h-8 rounded-md transition-all duration-200 ${
                        state.defaultStyle.fontSize === 16 ? 'bg-white shadow-sm' : 'hover:bg-purple-200'
                      }`}
                      onClick={() => handleFontSizeChange(16)}
                      title="16px"
                    >
                      <span className="text-sm font-bold text-purple-700">A</span>
                    </button>
                    <button 
                      className={`w-8 h-8 rounded-md transition-all duration-200 ${
                        state.defaultStyle.fontSize === 24 ? 'bg-white shadow-sm' : 'hover:bg-purple-200'
                      }`}
                      onClick={() => handleFontSizeChange(24)}
                      title="24px"
                    >
                      <span className="text-base font-bold text-purple-700">A</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Zoom controls - Enhanced styling */}
      <div className="absolute right-6 bottom-6 flex items-center space-x-2 z-10">
        <button
          onClick={handleZoomOut}
          className="w-10 h-10 rounded-xl bg-white/90 backdrop-blur-md shadow-lg border border-purple-200 flex items-center justify-center text-purple-700 hover:bg-white hover:shadow-xl transition-all duration-200"
          title="Zoom Out"
        >
          <Minus size={18} />
        </button>
        
        <button
          onClick={handleZoomIn}
          className="w-10 h-10 rounded-xl bg-white/90 backdrop-blur-md shadow-lg border border-purple-200 flex items-center justify-center text-purple-700 hover:bg-white hover:shadow-xl transition-all duration-200"
          title="Zoom In"
        >
          <Plus size={18} />
        </button>
        
        <button
          onClick={handleResetView}
          className="w-10 h-10 rounded-xl bg-white/90 backdrop-blur-md shadow-lg border border-purple-200 flex items-center justify-center text-purple-700 hover:bg-white hover:shadow-xl transition-all duration-200"
          title="Reset View"
        >
          <RotateCcw size={18} />
        </button>
      </div>
    </>
  )
}

export default Toolbar

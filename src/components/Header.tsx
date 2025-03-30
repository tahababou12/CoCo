import React, { useState, useRef } from 'react'
import { useDrawing } from '../context/DrawingContext'
import { Clock, User, History, ImageIcon } from 'lucide-react'
import { renderShape } from '../utils/renderShape'
import { Shape } from '../types'
import LoginButton from './LoginButton'
import LogoutButton from './LogoutButton'  
import { useAuth0 } from "@auth0/auth0-react"

interface HeaderProps {
  onToggleAI?: () => void;
  showAIAssistant?: boolean;
  onToggleCollaboration?: () => void;
  showShareButton?: boolean;
  canvasRef?: React.RefObject<HTMLCanvasElement>;
}

// Add Frame interface
interface StoryboardFrame {
  id: string;
  image: string;
  timestamp: number;
}

const Header: React.FC<HeaderProps> = () => {
  const { state, dispatch } = useDrawing()
  const { isAuthenticated } = useAuth0()
  const [documentName, setDocumentName] = useState('Untitled')
  const [showStoryboard, setShowStoryboard] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [frames, setFrames] = useState<StoryboardFrame[]>([])
  
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

  // Function to capture current canvas state
  const captureCanvasFrame = () => {
    // Find the main canvas in the document
    const mainCanvas = document.querySelector('canvas');
    if (!mainCanvas) {
      console.error('Canvas not found');
      return;
    }

    // Create a new canvas each time to render the current state
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = mainCanvas.width;
    captureCanvas.height = mainCanvas.height;

    const ctx = captureCanvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get canvas context');
      return;
    }

    // Draw the main canvas content to our capture canvas
    ctx.drawImage(mainCanvas, 0, 0);
    
    // Create a frame from the canvas
    const newFrame: StoryboardFrame = {
      id: Date.now().toString(),
      image: captureCanvas.toDataURL('image/png'),
      timestamp: Date.now()
    };

    // Add the new frame to the collection
    setFrames(prevFrames => [...prevFrames, newFrame]);
  };

  // Function to remove a frame
  const removeFrame = (id: string) => {
    setFrames(prevFrames => prevFrames.filter(frame => frame.id !== id));
  };

  // Storyboard icon component
  const StoryboardIcon = () => (
    <div style={{ position: 'relative', width: 16, height: 16 }}>
      {/* First frame - back */}
      <div style={{
        position: 'absolute',
        left: '-1px',
        top: '-1px',
        width: '11px',
        height: '11px',
        border: '1px solid #6b7280',
        borderRadius: '1px',
        background: '#f3f4f6',
        transform: 'rotate(-5deg)',
      }} />
      
      {/* Second frame - middle */}
      <div style={{
        position: 'absolute',
        left: '0',
        top: '0',
        width: '11px',
        height: '11px',
        border: '1px solid #4b5563',
        borderRadius: '1px',
        background: '#e5e7eb',
      }} />
      
      {/* Third frame - front */}
      <div style={{
        position: 'absolute',
        left: '2px',
        top: '2px',
        width: '11px',
        height: '11px',
        border: '1px solid #374151',
        borderRadius: '1px',
        background: '#d1d5db',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}>
        {/* Play icon */}
        <div style={{
          width: '0',
          height: '0',
          borderTop: '2px solid transparent',
          borderBottom: '2px solid transparent',
          borderLeft: '3px solid #111827',
          marginLeft: '1px',
        }} />
      </div>
    </div>
  );

  // Create a simple import button that directly opens the file dialog
  const ImportButton = () => {
    const { state, dispatch } = useDrawing();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      
      const file = e.target.files[0];
      if (!file.type.match('image.*')) {
        alert('Please select an image file (PNG, JPEG, etc)');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (!event.target || typeof event.target.result !== 'string') return;
        
        const imageDataUrl = event.target.result;
        const img = new Image();
        img.onload = () => {
          const centerX = 200;
          const centerY = 200;
          const maxDimension = 400;
          let width = img.width;
          let height = img.height;
          
          if (width > height && width > maxDimension) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
          
          const imageShape: Shape = {
            id: Date.now().toString(),
            type: 'image',
            points: [
              { x: centerX - width/2, y: centerY - height/2 },
              { x: centerX + width/2, y: centerY + height/2 }
            ],
            image: imageDataUrl,
            width,
            height,
            style: { ...state.defaultStyle },
            isSelected: false
          };
          
          dispatch({ type: 'ADD_SHAPE', payload: imageShape });
          console.log('Added image to canvas');
        };
        
        img.src = imageDataUrl;
      };
      
      reader.readAsDataURL(file);
      
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    return (
      <>
        <button 
          className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          title="Import Image"
        >
          <ImageIcon size={16} />
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileImport}
          accept="image/*"
          style={{ display: 'none' }}
        />
      </>
    );
  };

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
          {/* <span className="text-xs text-neutral-400 ml-1 font-normal">Free</span> */}
        </div>
        
        <button className="ml-1 p-1 rounded hover:bg-neutral-100">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V20M20 12H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      
      <div className="flex items-center space-x-1">
        <div className="flex items-center bg-neutral-100 rounded-md p-0.5">
          {/* Coco-ify button - Removing the star icon */}
          
          {/* Add Storyboard button */}
          <button 
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              showStoryboard 
                ? 'bg-blue-100 text-blue-600' 
                : 'text-neutral-500 hover:bg-white hover:text-neutral-700'
            }`}
            onClick={() => setShowStoryboard(!showStoryboard)}
            title="Storyboard"
          >
            <StoryboardIcon />
          </button>

          {isAuthenticated ? (
            <LogoutButton />
          ) : (
            <LoginButton />
          )}
          <button className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors">
            <User size={16} />
          </button>
          <button 
            className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              showHistory 
                ? 'bg-amber-100 text-amber-600' 
                : 'text-neutral-500 hover:bg-white hover:text-neutral-700'
            }`}
            onClick={() => setShowHistory(!showHistory)}
            title="Drawing History"
          >
            <Clock size={16} />
          </button>
          <ImportButton />
        </div>
        
        <div className="flex items-center bg-neutral-100 rounded-md p-0.5">
          <button 
            className="w-7 h-7 flex items-center justify-center rounded-md text-neutral-500 hover:bg-white hover:text-neutral-700 transition-colors"
            onClick={handleExport}
            title="Export Drawing"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        
        <button className="px-3 py-1.5 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 transition-colors">
          Share
        </button>
      </div>
      
      {/* History Panel */}
      {showHistory && (
        <div
          style={{
            position: 'absolute',
            right: '20px',
            top: '60px',
            width: '240px',
            height: '400px',
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 1000,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
            Drawing History
          </div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {state.history.past.length === 0 ? (
              <div style={{ 
                height: '120px', 
                background: '#f3f4f6', 
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#9ca3af',
                flexDirection: 'column'
              }}>
                <div>No history yet</div>
                <div style={{ fontSize: '0.8em', marginTop: '4px' }}>Start drawing to create history</div>
              </div>
            ) : (
              <>
                {state.history.past.map((_, index) => (
                  <div key={index} style={{ 
                    position: 'relative',
                    padding: '8px',
                    background: '#f3f4f6', 
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: '#e5e7eb',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}>
                      <History size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.9em' }}>
                        Step {state.history.past.length - index}
                      </div>
                      <div style={{ fontSize: '0.7em', color: '#6b7280' }}>
                        {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        // Undo to this point in history
                        for (let i = 0; i < state.history.past.length - index; i++) {
                          dispatch({ type: 'UNDO' });
                        }
                      }}
                      style={{
                        marginLeft: 'auto',
                        background: '#e5e7eb',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '4px 8px',
                        fontSize: '0.8em',
                        cursor: 'pointer'
                      }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #eee',
            paddingTop: '8px'
          }}>
            <button 
              onClick={() => dispatch({ type: 'UNDO' })}
              disabled={state.history.past.length === 0}
              style={{
                background: state.history.past.length === 0 ? '#9ca3af' : '#4b5563',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: state.history.past.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Undo
            </button>
            <button 
              onClick={() => dispatch({ type: 'REDO' })}
              disabled={state.history.future.length === 0}
              style={{
                background: state.history.future.length === 0 ? '#9ca3af' : '#4b5563',
                color: 'white',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: state.history.future.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              Redo
            </button>
          </div>
        </div>
      )}

      {/* Storyboard Panel */}
      {showStoryboard && (
        <div
          style={{
            position: 'absolute',
            right: '20px',
            top: '60px',
            width: '240px',
            height: '400px',
            background: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 1000,
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ fontWeight: 'bold', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
            Storyboard ({frames.length} frames)
          </div>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}>
            {frames.length === 0 ? (
              <div style={{ 
                height: '120px', 
                background: '#f3f4f6', 
                borderRadius: '4px',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: '#9ca3af',
                flexDirection: 'column'
              }}>
                <div>No frames yet</div>
                <div style={{ fontSize: '0.8em', marginTop: '4px' }}>Click "Add Frame" to capture the current canvas</div>
              </div>
            ) : (
              frames.map((frame, index) => (
                <div key={frame.id} style={{ 
                  position: 'relative',
                  height: '120px', 
                  background: '#f3f4f6', 
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <img 
                    src={frame.image} 
                    alt={`Frame ${index + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: '4px',
                    right: '4px',
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '0.7em'
                  }}>
                    Frame {index + 1}
                  </div>
                  <button 
                    onClick={() => removeFrame(frame.id)}
                    style={{
                      position: 'absolute',
                      bottom: '4px',
                      right: '4px',
                      background: 'rgba(255,0,0,0.6)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      width: '20px',
                      height: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: '1px solid #eee',
            paddingTop: '8px'
          }}>
            <button 
              onClick={captureCanvasFrame}
              style={{
                background: '#f3f4f6',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Add Frame
            </button>
            <button style={{
              background: frames.length > 0 ? '#4b5563' : '#9ca3af',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: frames.length > 0 ? 'pointer' : 'not-allowed'
            }}
            disabled={frames.length === 0}
            >
              Play
            </button>
          </div>
        </div>
      )}
    </header>
  )
}

export default Header
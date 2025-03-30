import React from 'react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import Header from './components/Header'
import HandDrawing from './components/HandDrawing'
import { DrawingProvider } from './context/DrawingContext'
import { HandGestureProvider } from './context/HandGestureContext'

function App() {
  return (
    <DrawingProvider>
      <HandGestureProvider>
        <div className="flex flex-col h-screen bg-neutral-50 text-neutral-800 overflow-hidden" 
             style={{ touchAction: 'none' }}>
          <Header />
          <div className="flex-1 overflow-hidden relative">
            <Canvas />
            <Toolbar />
            <HandDrawing />
          </div>
        </div>
      </HandGestureProvider>
    </DrawingProvider>
  )
}

export default App

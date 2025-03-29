import React from 'react'
import Canvas from './components/Canvas'
import Toolbar from './components/Toolbar'
import Header from './components/Header'
import { DrawingProvider } from './context/DrawingContext'

function App() {
  return (
    <DrawingProvider>
      <div className="flex flex-col h-screen bg-neutral-50 text-neutral-800 overflow-hidden" 
           style={{ touchAction: 'none' }}>
        <Header />
        <div className="flex-1 overflow-hidden relative">
          <Canvas />
          <Toolbar />
        </div>
      </div>
    </DrawingProvider>
  )
}

export default App

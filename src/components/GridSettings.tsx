import React from 'react';
import { useDrawing } from '../context/DrawingContext';
import { Grid3X3, Ruler, Settings } from 'lucide-react';

const GridSettings: React.FC = () => {
  const { state, dispatch } = useDrawing();

  const updateGridSettings = (updates: Partial<typeof state.gridSettings>) => {
    dispatch({
      type: 'UPDATE_GRID_SETTINGS',
      payload: updates
    });
  };

  return (
    <div className="absolute right-6 top-80 z-40 bg-white/95 backdrop-blur-lg rounded-xl border border-purple-200 shadow-lg p-4 w-64">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Grid & Rulers</h3>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_GRID_SETTINGS' })}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      {/* Grid toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Grid3X3 size={16} className="text-gray-600" />
          <span className="text-sm text-gray-700">Show Grid</span>
        </div>
        <button
          onClick={() => updateGridSettings({ enabled: !state.gridSettings.enabled })}
          className={`w-10 h-6 rounded-full transition-colors ${
            state.gridSettings.enabled ? 'bg-purple-600' : 'bg-gray-300'
          }`}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
            state.gridSettings.enabled ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* Grid size */}
      <div className="mb-4">
        <label className="block text-sm text-gray-700 mb-2">Grid Size</label>
        <input
          type="range"
          min="10"
          max="100"
          step="5"
          value={state.gridSettings.size}
          onChange={(e) => updateGridSettings({ size: parseInt(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>10px</span>
          <span>{state.gridSettings.size}px</span>
          <span>100px</span>
        </div>
      </div>

      {/* Grid color */}
      <div className="mb-4">
        <label className="block text-sm text-gray-700 mb-2">Grid Color</label>
        <input
          type="color"
          value={state.gridSettings.color}
          onChange={(e) => updateGridSettings({ color: e.target.value })}
          className="w-full h-8 rounded-lg border border-gray-300"
        />
      </div>

      {/* Grid opacity */}
      <div className="mb-4">
        <label className="block text-sm text-gray-700 mb-2">Grid Opacity</label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={state.gridSettings.opacity}
          onChange={(e) => updateGridSettings({ opacity: parseFloat(e.target.value) })}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>0%</span>
          <span>{Math.round(state.gridSettings.opacity * 100)}%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Snap to grid */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Settings size={16} className="text-gray-600" />
          <span className="text-sm text-gray-700">Snap to Grid</span>
        </div>
        <button
          onClick={() => updateGridSettings({ snapToGrid: !state.gridSettings.snapToGrid })}
          className={`w-10 h-6 rounded-full transition-colors ${
            state.gridSettings.snapToGrid ? 'bg-purple-600' : 'bg-gray-300'
          }`}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
            state.gridSettings.snapToGrid ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {/* Show rulers */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Ruler size={16} className="text-gray-600" />
          <span className="text-sm text-gray-700">Show Rulers</span>
        </div>
        <button
          onClick={() => updateGridSettings({ showRulers: !state.gridSettings.showRulers })}
          className={`w-10 h-6 rounded-full transition-colors ${
            state.gridSettings.showRulers ? 'bg-purple-600' : 'bg-gray-300'
          }`}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${
            state.gridSettings.showRulers ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </button>
      </div>
    </div>
  );
};

export default GridSettings; 
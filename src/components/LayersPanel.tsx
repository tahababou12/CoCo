import React, { useState } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { Layer } from '../types';
import { 
  Eye, 
  EyeOff, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  Copy,
  MoveUp,
  MoveDown
} from 'lucide-react';

const LayersPanel: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [newLayerName, setNewLayerName] = useState('');

  const addLayer = () => {
    if (newLayerName.trim()) {
      const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        name: newLayerName,
        visible: true,
        locked: false,
        opacity: 1,
        shapes: [],
        order: state.layers.length
      };
      
      dispatch({ 
        type: 'ADD_LAYER', 
        payload: newLayer 
      });
      setNewLayerName('');
    }
  };

  const toggleLayerVisibility = (layerId: string) => {
    dispatch({
      type: 'UPDATE_LAYER',
      payload: {
        layerId,
        updates: { visible: !state.layers.find(l => l.id === layerId)?.visible }
      }
    });
  };

  const toggleLayerLock = (layerId: string) => {
    dispatch({
      type: 'UPDATE_LAYER',
      payload: {
        layerId,
        updates: { locked: !state.layers.find(l => l.id === layerId)?.locked }
      }
    });
  };

  const deleteLayer = (layerId: string) => {
    if (state.layers.length > 1) {
      dispatch({
        type: 'DELETE_LAYER',
        payload: layerId
      });
    }
  };

  const setActiveLayer = (layerId: string) => {
    dispatch({
      type: 'SET_ACTIVE_LAYER',
      payload: layerId
    });
  };

  const moveLayer = (layerId: string, direction: 'up' | 'down') => {
    dispatch({
      type: 'MOVE_LAYER',
      payload: { layerId, direction }
    });
  };

  return (
    <div className="absolute right-6 top-24 z-40 bg-white/95 backdrop-blur-lg rounded-xl border border-purple-200 shadow-lg p-4 w-64">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Layers</h3>
        <button
          onClick={() => dispatch({ type: 'TOGGLE_LAYERS_PANEL' })}
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      {/* Add new layer */}
      <div className="flex items-center space-x-2 mb-4">
        <input
          type="text"
          value={newLayerName}
          onChange={(e) => setNewLayerName(e.target.value)}
          placeholder="Layer name"
          className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          onKeyPress={(e) => e.key === 'Enter' && addLayer()}
        />
        <button
          onClick={addLayer}
          className="p-1 text-purple-600 hover:text-purple-700"
          title="Add Layer"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Layers list */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {state.layers.map((layer, index) => (
          <div
            key={layer.id}
            className={`flex items-center justify-between p-2 rounded-lg border ${
              state.activeLayerId === layer.id
                ? 'bg-purple-100 border-purple-300'
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="flex items-center space-x-2 flex-1">
              {/* Visibility toggle */}
              <button
                onClick={() => toggleLayerVisibility(layer.id)}
                className="text-gray-600 hover:text-gray-800"
                title={layer.visible ? 'Hide Layer' : 'Show Layer'}
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>

              {/* Lock toggle */}
              <button
                onClick={() => toggleLayerLock(layer.id)}
                className="text-gray-600 hover:text-gray-800"
                title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
              >
                {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
              </button>

              {/* Layer name */}
              <span
                className={`text-sm cursor-pointer flex-1 ${
                  state.activeLayerId === layer.id
                    ? 'font-semibold text-purple-700'
                    : 'text-gray-700'
                }`}
                onClick={() => setActiveLayer(layer.id)}
              >
                {layer.name}
              </span>
            </div>

            {/* Layer actions */}
            <div className="flex items-center space-x-1">
              {/* Move up */}
              {index > 0 && (
                <button
                  onClick={() => moveLayer(layer.id, 'up')}
                  className="text-gray-400 hover:text-gray-600"
                  title="Move Up"
                >
                  <MoveUp size={12} />
                </button>
              )}

              {/* Move down */}
              {index < state.layers.length - 1 && (
                <button
                  onClick={() => moveLayer(layer.id, 'down')}
                  className="text-gray-400 hover:text-gray-600"
                  title="Move Down"
                >
                  <MoveDown size={12} />
                </button>
              )}

              {/* Delete layer */}
              {state.layers.length > 1 && (
                <button
                  onClick={() => deleteLayer(layer.id)}
                  className="text-red-400 hover:text-red-600"
                  title="Delete Layer"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Layer opacity slider */}
      {state.activeLayerId && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-600">Opacity</span>
            <span className="text-xs text-gray-600">
              {Math.round((state.layers.find(l => l.id === state.activeLayerId)?.opacity || 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={state.layers.find(l => l.id === state.activeLayerId)?.opacity || 1}
            onChange={(e) => dispatch({
              type: 'UPDATE_LAYER',
              payload: {
                layerId: state.activeLayerId,
                updates: { opacity: parseFloat(e.target.value) }
              }
            })}
            className="w-full"
          />
        </div>
      )}
    </div>
  );
};

export default LayersPanel; 
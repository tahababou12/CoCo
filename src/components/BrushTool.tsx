import React, { useState, useEffect } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { BrushSettings } from '../types';
import { Palette, Droplet, Sliders } from 'lucide-react';

const BrushTool: React.FC = () => {
  const { state, dispatch } = useDrawing();
  const [showSettings, setShowSettings] = useState(false);
  const [localSettings, setLocalSettings] = useState<BrushSettings>(state.brushSettings);

  // Update local settings when global state changes
  useEffect(() => {
    setLocalSettings(state.brushSettings);
  }, [state.brushSettings]);

  const handleSizeChange = (size: number) => {
    const newSettings = { ...localSettings, size };
    setLocalSettings(newSettings);
    dispatch({ type: 'SET_BRUSH_SETTINGS', payload: newSettings });
  };

  const handleOpacityChange = (opacity: number) => {
    const newSettings = { ...localSettings, opacity };
    setLocalSettings(newSettings);
    dispatch({ type: 'SET_BRUSH_SETTINGS', payload: newSettings });
  };

  const handlePressureChange = (pressure: number) => {
    const newSettings = { ...localSettings, pressure };
    setLocalSettings(newSettings);
    dispatch({ type: 'SET_BRUSH_SETTINGS', payload: newSettings });
  };

  const handleTextureChange = (texture: BrushSettings['texture']) => {
    const newSettings = { ...localSettings, texture };
    setLocalSettings(newSettings);
    dispatch({ type: 'SET_BRUSH_SETTINGS', payload: newSettings });
  };

  const getBrushPreview = () => {
    const size = localSettings.size;
    const opacity = localSettings.opacity;
    
    return (
      <div
        className="rounded-full border-2 border-gray-300 bg-current transition-all duration-200"
        style={{
          width: `${Math.max(8, Math.min(32, size))}px`,
          height: `${Math.max(8, Math.min(32, size))}px`,
          opacity: opacity,
          backgroundColor: state.defaultStyle.strokeColor,
        }}
      />
    );
  };

  const getTextureIcon = (texture: BrushSettings['texture']) => {
    switch (texture) {
      case 'smooth':
        return '⚪';
      case 'rough':
        return '🟤';
      case 'watercolor':
        return '💧';
      case 'marker':
        return '✏️';
      default:
        return '⚪';
    }
  };

  if (state.tool !== 'brush') return null;

  return (
    <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-20">
      {/* Brush Settings Panel */}
      <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-4 w-80">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Palette className="w-5 h-5 mr-2 text-purple-600" />
            <h3 className="font-semibold text-gray-800">Advanced Brush</h3>
          </div>
          <div className="flex items-center">
            {getBrushPreview()}
          </div>
        </div>

        {/* Brush Size */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Size: {localSettings.size}px
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={localSettings.size}
            onChange={(e) => handleSizeChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
        </div>

        {/* Brush Opacity */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Opacity: {Math.round(localSettings.opacity * 100)}%
          </label>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.1"
            value={localSettings.opacity}
            onChange={(e) => handleOpacityChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
        </div>

        {/* Pressure Sensitivity */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Pressure Sensitivity: {Math.round(localSettings.pressure * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={localSettings.pressure}
            onChange={(e) => handlePressureChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
          />
          <p className="text-xs text-gray-500 mt-1">
            Higher values make brush size respond more to hand distance
          </p>
        </div>

        {/* Brush Texture */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Texture
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['smooth', 'rough', 'watercolor', 'marker'] as const).map((texture) => (
              <button
                key={texture}
                onClick={() => handleTextureChange(texture)}
                className={`p-3 rounded-lg border-2 transition-all ${
                  localSettings.texture === texture
                    ? 'border-purple-500 bg-purple-100'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-2xl mb-1">{getTextureIcon(texture)}</div>
                <div className="text-xs capitalize">{texture}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Quick Presets */}
        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quick Presets
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const preset = { size: 5, opacity: 0.8, pressure: 0.3, texture: 'smooth' as const };
                setLocalSettings(preset);
                dispatch({ type: 'SET_BRUSH_SETTINGS', payload: preset });
              }}
              className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
            >
              Fine Detail
            </button>
            <button
              onClick={() => {
                const preset = { size: 15, opacity: 0.6, pressure: 0.7, texture: 'watercolor' as const };
                setLocalSettings(preset);
                dispatch({ type: 'SET_BRUSH_SETTINGS', payload: preset });
              }}
              className="px-3 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
            >
              Artistic
            </button>
            <button
              onClick={() => {
                const preset = { size: 25, opacity: 1, pressure: 0.5, texture: 'marker' as const };
                setLocalSettings(preset);
                dispatch({ type: 'SET_BRUSH_SETTINGS', payload: preset });
              }}
              className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200"
            >
              Bold
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrushTool; 
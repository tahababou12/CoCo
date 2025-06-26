import React, { useState } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { X, Download, Eye } from 'lucide-react';

const SharedAIImages: React.FC = () => {
  const { state } = useDrawing();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ userId: string; imageData: string; prompt: string; timestamp: number } | null>(null);

  // Only show if there are shared AI images
  if (state.sharedAIImages.length === 0) return null;

  const downloadImage = (imageData: string, prompt: string) => {
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `ai-image-${prompt.slice(0, 20).replace(/\s+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      {/* Floating panel */}
      <div className={`fixed top-20 left-4 bg-white rounded-lg shadow-lg border border-gray-200 z-40 transition-all duration-300 ${
        isExpanded ? 'w-80' : 'w-64'
      }`}>
        <div className="p-3 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">
              Shared AI Images ({state.sharedAIImages.length})
            </h3>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-500 hover:text-gray-700 text-xs"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
        
        <div className={`max-h-96 overflow-y-auto ${isExpanded ? 'p-3' : 'p-2'}`}>
          {state.sharedAIImages.slice().reverse().map((aiImage, index) => (
            <div key={`${aiImage.userId}-${aiImage.timestamp}`} className="mb-3 last:mb-0">
              <div className="text-xs text-gray-500 mb-1">
                From: {aiImage.userId} • {new Date(aiImage.timestamp).toLocaleTimeString()}
              </div>
              <div className="relative group">
                <img
                  src={aiImage.imageData}
                  alt={aiImage.prompt}
                  className={`w-full rounded cursor-pointer transition-transform hover:scale-105 ${
                    isExpanded ? 'max-h-32' : 'max-h-24'
                  } object-cover`}
                  onClick={() => setSelectedImage(aiImage)}
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all rounded flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <Eye className="text-white" size={20} />
                </div>
              </div>
              <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                "{aiImage.prompt}"
              </div>
              {isExpanded && (
                <button
                  onClick={() => downloadImage(aiImage.imageData, aiImage.prompt)}
                  className="mt-1 text-xs text-blue-500 hover:text-blue-700 flex items-center"
                >
                  <Download size={12} className="mr-1" /> Download
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Full-size image modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={() => setSelectedImage(null)}>
          <div className="max-w-4xl max-h-4xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-white rounded-lg overflow-hidden">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">AI Generated Image</h3>
                  <p className="text-sm text-gray-500">
                    From: {selectedImage.userId} • {new Date(selectedImage.timestamp).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4">
                <img
                  src={selectedImage.imageData}
                  alt={selectedImage.prompt}
                  className="max-w-full max-h-[70vh] object-contain mx-auto"
                />
                <div className="mt-4 p-3 bg-gray-50 rounded">
                  <p className="text-sm text-gray-700">
                    <strong>Prompt:</strong> "{selectedImage.prompt}"
                  </p>
                </div>
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => downloadImage(selectedImage.imageData, selectedImage.prompt)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded flex items-center"
                  >
                    <Download size={16} className="mr-2" /> Download Image
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SharedAIImages; 
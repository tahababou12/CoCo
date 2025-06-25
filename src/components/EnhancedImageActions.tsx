import React from 'react';

interface EnhancedImageActionsProps {
  imageData: {
    path: string;
    filename: string;
    base64Data: string;
  };
  onClose?: () => void;
}

const EnhancedImageActions: React.FC<EnhancedImageActionsProps> = ({ imageData }) => {
  const addToStoryboard = async () => {
    try {
      // Extract just the path part from the full URL
      const path = imageData.path.replace('http://localhost:5001', '');
      
      const response = await fetch('http://localhost:5001/api/storyboard/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imagePath: path }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add image to storyboard: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        window.showToast('Image added to storyboard!', 'success', 2000);
      } else {
        throw new Error('Failed to add image to storyboard');
      }
    } catch (err) {
      console.error('Error adding image to storyboard:', err);
      window.showToast(`Error adding to storyboard: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  };

  const downloadImage = () => {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${imageData.base64Data}`;
    link.download = imageData.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.showToast('Image downloading...', 'success', 2000);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 flex justify-center space-x-3 z-40 bg-black bg-opacity-60 py-2 px-3 pointer-events-auto">
      <button
        onClick={addToStoryboard}
        className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors shadow flex items-center cursor-pointer"
        title="Add to Storyboard"
        style={{ pointerEvents: 'auto' }}
      >
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        </svg>
        Add to Storyboard
      </button>
      
      <button
        onClick={downloadImage}
        className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors shadow flex items-center cursor-pointer"
        title="Download Image"
        style={{ pointerEvents: 'auto' }}
      >
        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download
      </button>
    </div>
  );
};

// Add a global type definition for the showToast function if not already defined
declare global {
  interface Window {
    showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  }
}

export default EnhancedImageActions; 
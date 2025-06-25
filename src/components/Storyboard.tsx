import React, { useState, useEffect } from 'react';
import './Storyboard.css';

interface StoryboardImage {
  path: string;
  filename: string;
  base64Data: string;
  width: number;
  height: number;
}

interface StoryboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const Storyboard: React.FC<StoryboardProps> = ({ isOpen, onClose }) => {
  const [storyboardImages, setStoryboardImages] = useState<StoryboardImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoRequestId, setVideoRequestId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<'idle' | 'processing' | 'complete' | 'error'>('idle');
  const [videoResult, setVideoResult] = useState<{ url: string; filename: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [imagePath, setImagePath] = useState('');

  // Fetch storyboard images when component mounts or is opened
  useEffect(() => {
    if (isOpen) {
      fetchStoryboard();
    }
  }, [isOpen]);

  // Poll for video status if we have a requestId
  useEffect(() => {
    let intervalId: number | null = null;

    if (videoRequestId && videoStatus === 'processing') {
      intervalId = window.setInterval(() => {
        checkVideoStatus(videoRequestId);
      }, 2000); // Poll every 2 seconds
    }

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [videoRequestId, videoStatus]);

  const fetchStoryboard = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('http://localhost:5001/api/storyboard');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch storyboard: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.storyboard) {
        setStoryboardImages(data.storyboard.images || []);
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (err) {
      console.error('Error fetching storyboard:', err);
      setError(`Failed to load storyboard: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addImageToStoryboard = async (imagePath: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('http://localhost:5001/api/storyboard/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imagePath }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add image: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.storyboard) {
        setStoryboardImages(data.storyboard.images || []);
        window.showToast('Image added to storyboard', 'success', 2000);
        setImagePath('');
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (err) {
      console.error('Error adding image to storyboard:', err);
      setError(`Failed to add image: ${err instanceof Error ? err.message : String(err)}`);
      window.showToast(`Failed to add image: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddImage = (e: React.FormEvent) => {
    e.preventDefault();
    if (imagePath.trim()) {
      addImageToStoryboard(imagePath.trim());
    }
  };

  const clearStoryboard = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('http://localhost:5001/api/storyboard/clear', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to clear storyboard: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        setStoryboardImages([]);
        window.showToast('Storyboard cleared', 'success', 2000);
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (err) {
      console.error('Error clearing storyboard:', err);
      setError(`Failed to clear storyboard: ${err instanceof Error ? err.message : String(err)}`);
      window.showToast(`Failed to clear storyboard: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteImageFromStoryboard = async (imagePath: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('http://localhost:5001/api/storyboard/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imagePath }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete image: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.storyboard) {
        setStoryboardImages(data.storyboard.images || []);
        window.showToast('Image removed from storyboard', 'success', 2000);
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (err) {
      console.error('Error deleting image from storyboard:', err);
      setError(`Failed to delete image: ${err instanceof Error ? err.message : String(err)}`);
      window.showToast(`Failed to delete image: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const generateVideo = async () => {
    try {
      setVideoStatus('processing');
      setStatusMessage('Starting video generation...');
      setVideoResult(null);
      setError(null);

      const response = await fetch('http://localhost:5001/api/generate-video', {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to start video generation: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success && data.requestId) {
        setVideoRequestId(data.requestId);
        setStatusMessage('Video generation in progress...');
        window.showToast('Video generation started', 'info', 2000);
      } else {
        throw new Error('Invalid response format from server');
      }
    } catch (err) {
      console.error('Error generating video:', err);
      setError(`Failed to generate video: ${err instanceof Error ? err.message : String(err)}`);
      setVideoStatus('error');
      setStatusMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
      window.showToast(`Failed to generate video: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  };

  const checkVideoStatus = async (requestId: string) => {
    try {
      const response = await fetch(`http://localhost:5001/api/video-status/${requestId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to check video status: ${response.status} ${response.statusText}`);
      }
      
      const status = await response.json();
      
      if (status.status === 'processing') {
        setStatusMessage('Video generation in progress...');
      } else if (status.status === 'complete' && status.result) {
        setVideoStatus('complete');
        setStatusMessage('Video generation complete!');
        setVideoResult({
          url: status.result.url,
          filename: status.result.filename
        });
        window.showToast('Video generated successfully!', 'success', 3000);
      } else if (status.status === 'error') {
        setVideoStatus('error');
        setStatusMessage(`Error: ${status.message || 'Unknown error'}`);
        window.showToast(`Video generation failed: ${status.message || 'Unknown error'}`, 'error', 3000);
      }
    } catch (err) {
      console.error('Error checking video status:', err);
      setError(`Failed to check video status: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const playVideo = async (filename: string) => {
    try {
      const response = await fetch(`http://localhost:5001/api/play-video/${filename}`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to play video: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        window.showToast('Video opened in default player', 'success', 2000);
      } else {
        throw new Error('Failed to play video');
      }
    } catch (err) {
      console.error('Error playing video:', err);
      window.showToast(`Failed to play video: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  };

  const downloadVideo = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto">
      <div className="fixed inset-0 transition-opacity" onClick={onClose}>
        <div className="absolute inset-0 bg-black opacity-50"></div>
      </div>
      
      <div 
        className="relative bg-white rounded-lg w-full max-w-4xl mx-auto shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh' }}
      >
        <button
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-500"
          onClick={onClose}
        >
          <span className="sr-only">Close</span>
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6 text-purple-800">Storyboard</h2>
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}
          
          {/* Manual image path input */}
          <div className="mb-6">
            <form onSubmit={handleAddImage} className="flex gap-2">
              <input
                type="text"
                value={imagePath}
                onChange={(e) => setImagePath(e.target.value)}
                placeholder="Enter image URL or path"
                className="flex-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                className="px-3 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                disabled={isLoading || !imagePath.trim()}
              >
                Add Image
              </button>
            </form>
            <p className="text-sm text-gray-500 mt-1">
              Enter an image path (e.g. /enhanced/image.png) to add it directly to the storyboard
            </p>
          </div>
          
          <div className="mb-6 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Your Images ({storyboardImages.length})</h3>
            <div className="space-x-2">
              <button
                onClick={fetchStoryboard}
                className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                disabled={isLoading}
              >
                Refresh
              </button>
              <button
                onClick={clearStoryboard}
                className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                disabled={isLoading || storyboardImages.length === 0}
              >
                Clear All
              </button>
            </div>
          </div>
          
          <div className="storyboard-grid">
            {isLoading ? (
              <div className="col-span-full flex justify-center items-center h-40">
                <div className="spinner"></div>
              </div>
            ) : storyboardImages.length > 0 ? (
              storyboardImages.map((image, index) => (
                <div key={index} className="storyboard-image relative group">
                  <img
                    src={`data:image/png;base64,${image.base64Data}`}
                    alt={`Storyboard image ${index + 1}`}
                  />
                  <div className="storyboard-image-label">
                    #{index + 1}: {image.filename.substring(0, 15)}...
                  </div>
                  <button
                    onClick={() => deleteImageFromStoryboard(image.path)}
                    className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Delete this image"
                    style={{ pointerEvents: 'auto' }}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))
            ) : (
              <div className="col-span-full text-center py-8 text-gray-500">
                No images in storyboard yet. Add enhanced images to create a video.
              </div>
            )}
          </div>

          <div className="mt-8 border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">Video Generation</h3>
            
            <div className={`video-status ${videoStatus !== 'idle' ? videoStatus : ''}`}>
              {videoStatus === 'idle' && (
                <div className="flex flex-col items-center">
                  <button
                    onClick={generateVideo}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center w-full md:w-auto"
                    disabled={storyboardImages.length < 2}
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Generate Video
                  </button>
                  {storyboardImages.length < 2 && (
                    <p className="text-sm text-gray-500 mt-2">You need at least 2 images to generate a video</p>
                  )}
                </div>
              )}
              
              {videoStatus === 'processing' && (
                <div className="flex items-center">
                  <div className="spinner"></div>
                  <span>{statusMessage}</span>
                </div>
              )}
              
              {videoStatus === 'complete' && videoResult && (
                <div>
                  <div className="flex items-center text-green-600 font-medium mb-2">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Video ready!
                  </div>
                  <div className="video-actions">
                    <button
                      onClick={() => playVideo(videoResult.filename)}
                      className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Play
                    </button>
                    <button
                      onClick={() => downloadVideo(videoResult.url, videoResult.filename)}
                      className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download
                    </button>
                    <button
                      onClick={() => {
                        setVideoStatus('idle');
                        setVideoResult(null);
                      }}
                      className="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors flex items-center"
                    >
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      New Video
                    </button>
                  </div>
                </div>
              )}
              
              {videoStatus === 'error' && (
                <div className="text-red-600">
                  <div className="flex items-center mb-2">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Error: {statusMessage}
                  </div>
                  <button
                    onClick={() => setVideoStatus('idle')}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 border-t pt-4 text-sm text-gray-500">
            <p>Tips:</p>
            <ul className="list-disc list-inside">
              <li>You need at least 2 images to generate a video</li>
              <li>The video will include all images in the storyboard</li>
              <li>The video will be generated with audio narration</li>
              <li>Video generation may take a minute or two</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

// Add a global type definition for the showToast function
declare global {
  interface Window {
    showToast: (message: string, type: 'success' | 'error' | 'info', duration?: number) => void;
  }
}

export default Storyboard; 
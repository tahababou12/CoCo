import React, { useState } from 'react';
import { Mic, StopCircle } from 'lucide-react';

// Define API URL constant
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

interface EnhancedImageActionsProps {
  imageData: {
    path: string;
    filename: string;
    base64Data: string;
  };
  onClose?: () => void;
  onImageUpdate?: (newImageData: string) => void;
}

const EnhancedImageActions: React.FC<EnhancedImageActionsProps> = ({ imageData, onImageUpdate }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const recognitionRef = React.useRef<any>(null);

  // Initialize speech recognition
  React.useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.error("Speech recognition not supported in this browser.");
      return;
    }

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onresult = (event: any) => {
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' ';
        }
      }
      setFinalTranscript(prev => prev + final);
    };

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const startRecording = () => {
    if (recognitionRef.current && !isRecording) {
      setFinalTranscript('');
      recognitionRef.current.start();
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  };

  const refineImageWithVoice = async () => {
    if (!finalTranscript) {
      window.showToast('Please speak your refinement instructions', 'info', 3000);
      return;
    }

    setIsRefining(true);

    try {
      const response = await fetch(`${API_URL}/api/refine-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData: `data:image/png;base64,${imageData.base64Data}`,
          prompt: finalTranscript
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to refine image');
      }

      const result = await response.json();
      
      if (result.success && result.requestId) {
        window.showToast('Refining your image with Gemini...', 'info', 3000);
        pollRefinementStatus(result.requestId);
      } else {
        throw new Error('Failed to start refinement process');
      }
    } catch (err) {
      console.error('Error refining image:', err);
      window.showToast(`Error refining image: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    } finally {
      setIsRefining(false);
      setFinalTranscript('');
    }
  };

  const pollRefinementStatus = async (requestId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/enhancement-status/${requestId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch refinement status: ${response.status} ${response.statusText}`);
      }
      
      const status = await response.json();
      
      if (status.status === 'processing') {
        setTimeout(() => pollRefinementStatus(requestId), 2000);
      } else if (status.status === 'complete' && status.result) {
        window.showToast('Refinement complete!', 'success', 3000);
        if (onImageUpdate && status.result.base64Data) {
          onImageUpdate(status.result.base64Data);
        }
      } else if (status.status === 'error') {
        throw new Error(status.message || 'Unknown error occurred');
      }
    } catch (err) {
      console.error('Error polling refinement status:', err);
      window.showToast(`Error checking refinement status: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  };

  const addToStoryboard = async () => {
    try {
      const path = imageData.path.replace(API_URL, '');
      
      const response = await fetch(`${API_URL}/api/storyboard/add`, {
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
    <div className="absolute bottom-0 left-0 right-0 flex flex-col space-y-2 z-30 bg-black bg-opacity-60 py-2 px-3">
      {/* Voice Refinement Controls */}
      <div className="flex justify-center space-x-2">
        <button
          onClick={startRecording}
          disabled={isRecording || isRefining}
          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors shadow flex items-center disabled:opacity-50"
          title="Start Voice Refinement"
        >
          <Mic size={14} className="mr-1" />
          Start Voice
        </button>
        <button
          onClick={stopRecording}
          disabled={!isRecording || isRefining}
          className="text-xs px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors shadow flex items-center disabled:opacity-50"
          title="Stop Voice Refinement"
        >
          <StopCircle size={14} className="mr-1" />
          Stop Voice
        </button>
        {finalTranscript && (
          <button
            onClick={refineImageWithVoice}
            disabled={isRefining}
            className="text-xs px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors shadow flex items-center disabled:opacity-50"
            title="Apply Voice Refinement"
          >
            Apply Refinement
          </button>
        )}
      </div>
      
      {/* Transcription Display */}
      {finalTranscript && (
        <div className="text-xs text-white bg-black bg-opacity-50 p-2 rounded">
          {finalTranscript}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-center space-x-3">
        <button
          onClick={addToStoryboard}
          className="text-xs px-2 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors shadow flex items-center"
          title="Add to Storyboard"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Add to Storyboard
        </button>
        
        <button
          onClick={downloadImage}
          className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors shadow flex items-center"
          title="Download Image"
        >
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download
        </button>
      </div>
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
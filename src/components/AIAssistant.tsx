import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { Sparkles, Download, Mic, StopCircle, X } from 'lucide-react';

// --- Add SpeechRecognition types globally ---
declare global {
  interface Window {
    webkitSpeechRecognition: any;
    SpeechRecognition: any;
  }
}
// --- End SpeechRecognition types ---

interface AIAssistantProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ isOpen, onClose }) => {
  const { state } = useDrawing();
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState('');
  const [prompt, setPrompt] = useState('Create an image based on my drawing');
  const [error, setError] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  // --- New state variables ---
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refinedImage, setRefinedImage] = useState<string | null>(null);
  const [refinementError, setRefinementError] = useState('');
  const recognitionRef = useRef<any>(null); // Ref to store recognition instance
  // --- End new state variables ---


  // --- Initialize Speech Recognition ---
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.error("Speech recognition not supported in this browser.");
      // Optionally disable microphone features here
      return;
    }

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    const recognition = recognitionRef.current;

    recognition.continuous = true; // Keep listening even after pauses
    recognition.interimResults = true; // Get results as they come
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsRecording(true);
      setInterimTranscript('');
      setFinalTranscript(''); // Clear previous final transcript on start
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsRecording(false);
      // Don't automatically refine here, wait for explicit call in stopRecording
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      setError(`Speech recognition error: ${event.error}`);
      setIsRecording(false);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = ''; // Accumulate final transcript for this specific result event

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setInterimTranscript(interim);
      // Append the newly finalized parts to the existing final transcript
      setFinalTranscript(prevFinal => prevFinal + final);
    };

    // Cleanup function to stop recognition if component unmounts while recording
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []); // Run only once on mount
  // --- End Speech Recognition ---


  // --- Refactored API call for initial generation ---
  const generateWithGemini = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');
    setError('');
    setGeneratedImage(null);
    setRefinedImage(null); // Clear previous refinements
    setRefinementError(''); // Clear previous refinement errors
    setFinalTranscript(''); // Clear previous transcript
    setInterimTranscript('');

    try {
      // Call backend endpoint instead of Google API directly
      const apiResponse = await fetch('/api/generate-initial-image', { // Using relative path
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt: prompt }) // Send only the prompt
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || `API responded with status ${apiResponse.status}`);
      }

      const data = await apiResponse.json();
      console.log('Backend API response:', data);

      if (data.imageData) {
         setGeneratedImage(data.imageData);
      } else {
          setError('No image was generated. Please try a different prompt.');
      }
       if (data.textResponse) {
           setResponse(data.textResponse);
       }

    } catch (error) {
      console.error('Error calling backend API:', error);
      setError(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };
  // --- End Refactored API call ---

  // --- Functions for Voice Refinement ---
  const startRecording = () => {
    if (recognitionRef.current && !isRecording) {
      try {
        setFinalTranscript(''); // Clear previous transcript before starting
        setInterimTranscript('');
        recognitionRef.current.start();
      } catch (err) {
        console.error("Error starting speech recognition:", err);
        setError("Could not start microphone. Please check permissions.");
      }
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
      // Refinement logic will be triggered AFTER recognition.onend confirms stop
      // We need the final transcript which is updated in onresult and accumulated
      // Use a slight delay or check state in useEffect to trigger refinement reliably after finalTranscript updates
      // Let's refine immediately after stop is called, using the current finalTranscript state
      // Note: finalTranscript state might not be *instantly* updated after stop(),
      // but it should contain the result from the last 'onresult' event.
      // A more robust way might involve waiting for onend and checking transcript state then.
      setTimeout(() => { // Use timeout to allow final state update
          if (generatedImage && finalTranscript.trim()) {
              refineImageWithVoice();
          } else if (!finalTranscript.trim()) {
              setRefinementError("No speech detected for refinement.");
          }
      }, 100); // Small delay
    }
  };


  const refineImageWithVoice = async () => {
    if (!finalTranscript) {
      window.showToast('Please speak your refinement instructions', 'info', 3000);
      return;
    }

    setIsRefining(true);
    setRefinementError('');
    setRefinedImage(null);

    console.log("Refining image with prompt:", finalTranscript);

    try {
      // Get the current canvas state
      const canvas = document.querySelector('canvas');
      if (!canvas) {
        throw new Error('Canvas not found');
      }

      // Convert canvas to base64
      const imageData = canvas.toDataURL('image/png');

      // Send to backend for refinement
      const response = await fetch('/api/refine-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData,
          prompt: finalTranscript
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to refine image');
      }

      const result = await response.json();
      
      if (result.success && result.requestId) {
        // Show a toast notification that refinement is in progress
        window.showToast('Refining your image with Gemini...', 'info', 3000);
        
        // Poll for refinement status
        await pollRefinementStatus(result.requestId);
      } else {
        throw new Error('Failed to start refinement process');
      }
    } catch (err) {
      console.error('Error refining image:', err);
      setRefinementError(err instanceof Error ? err.message : 'Failed to refine image');
      window.showToast(`Error refining image: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    } finally {
      setIsRefining(false);
      setFinalTranscript('');
    }
  };

  const pollRefinementStatus = async (requestId: string) => {
    try {
      const response = await fetch('/api/enhancement-status/' + requestId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch refinement status: ${response.status} ${response.statusText}`);
      }
      
      const status = await response.json();
      
      if (status.status === 'processing') {
        // Continue polling every 2 seconds
        setTimeout(() => pollRefinementStatus(requestId), 2000);
      } else if (status.status === 'complete' && status.result) {
        // Refinement is complete, update the image
        setRefinedImage(`data:image/png;base64,${status.result.base64Data}`);
        window.showToast('Refinement complete!', 'success', 3000);
      } else if (status.status === 'error') {
        throw new Error(status.message || 'Unknown error occurred');
      }
    } catch (err) {
      console.error('Error polling refinement status:', err);
      setRefinementError(err instanceof Error ? err.message : 'Failed to check refinement status');
      window.showToast(`Error checking refinement status: ${err instanceof Error ? err.message : String(err)}`, 'error', 3000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {/* Increased padding */}
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        {/* Increased max-width, max-height, and overflow */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Sparkles className="mr-2 text-purple-500" size={20} />
            Coco-ify your drawing
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl leading-none" // Made button bigger
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your prompt here..."
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
            rows={3}
          />
        </div>

        <button
          onClick={generateWithGemini}
          disabled={isLoading || isRecording || isRefining} // Disable if loading or recording/refining
          className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors mb-4 flex items-center justify-center disabled:opacity-50" // Added disabled style
        >
          {isLoading ? (
            <>
              {/* Loading Spinner SVG */}
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </>
          ) : (
            <>Generate with Coco</>
          )}
        </button>

        {error && (
          <div className="mt-4 bg-red-50 text-red-700 p-3 rounded-md text-sm">
            {error}
          </div>
        )}

        {/* --- Display Generated Image and Refinement Section --- */}
        {generatedImage && !isLoading && (
          <div className="mt-4 border-t pt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">Generated image:</h3>
              <a
                href={generatedImage}
                download="coco-generated-image.png"
                className="text-blue-500 hover:text-blue-700 flex items-center text-sm"
              >
                <Download size={14} className="mr-1" /> Download
              </a>
            </div>
            <img
              src={refinedImage ?? generatedImage} // Show refined image if available, otherwise original
              alt={refinedImage ? "Refined by Coco" : "Generated by Coco"}
              className="w-full rounded-md shadow-sm mb-4"
            />

            {/* --- Voice Refinement Controls --- */}
            <div className="mt-4 p-4 bg-gray-50 rounded-md">
                <h4 className="text-md font-semibold mb-2 text-gray-800">Refine with Voice</h4>
                <div className="flex items-center space-x-2 mb-2">
                     <button
                        onClick={startRecording}
                        disabled={isRecording || isRefining}
                        className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 disabled:opacity-50"
                        aria-label="Start recording"
                     >
                        <Mic size={18} />
                    </button>
                    <button
                        onClick={stopRecording}
                        disabled={!isRecording || isRefining}
                        className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 disabled:opacity-50"
                        aria-label="Stop recording"
                    >
                        <StopCircle size={18} />
                    </button>
                    {isRecording && <span className="text-sm text-red-600 animate-pulse">Recording...</span>}
                    {isRefining && <span className="text-sm text-purple-600">Refining...</span>}
                </div>
                 {/* Transcription Display */}
                {(interimTranscript || finalTranscript) && (
                    <div className="mt-2 text-sm text-gray-600 bg-white p-2 border rounded min-h-[4em]">
                        <span className="text-gray-800">{finalTranscript}</span>
                        <span className="text-gray-400">{interimTranscript}</span>
                    </div>
                )}
                 {/* Refinement Error Display */}
                {refinementError && (
                    <div className="mt-2 bg-red-50 text-red-700 p-2 rounded-md text-sm">
                        {refinementError}
                    </div>
                )}
            </div>
            {/* --- End Voice Refinement Controls --- */}

          </div>
        )}
        {/* --- End Display Generated Image --- */}


        {response && !isLoading && ( // Show original text response if available
          <div className="mt-4 bg-gray-50 p-3 rounded-md border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Coco response:</h3>
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{response}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistant; 
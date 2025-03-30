import React, { useState } from 'react';
import { useDrawing } from '../context/DrawingContext';
import { Sparkles, Download } from 'lucide-react';

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

  const generateWithGemini = async () => {
    if (!prompt.trim()) return;

    setIsLoading(true);
    setResponse('');
    setError('');
    setGeneratedImage(null);

    try {
      // Prepare a request to the image generation model
      const requestBody = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["Text", "Image"]
        }
      };

      console.log('Sending request to Gemini image generation API:', requestBody);

      // Call Gemini API with the correct model for image generation
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=AIzaSyA8h1TQVustGawTluFlQi4KNSZsdIbPtBU', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API responded with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Gemini API response:', data);
      
      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        // Process both text and image parts from the response
        const parts = data.candidates[0].content.parts || [];
        
        for (const part of parts) {
          if (part.text) {
            setResponse(part.text);
          } else if (part.inline_data) {
            // Handle image data
            setGeneratedImage(`data:${part.inline_data.mime_type};base64,${part.inline_data.data}`);
          }
        }
        
        if (!generatedImage && !response) {
          setError('No text or image was generated. Please try a different prompt.');
        }
      } else {
        console.error('Unexpected API response format:', data);
        setError('Received an unexpected response format from the API');
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      setError(`Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center">
            <Sparkles className="mr-2 text-purple-500" size={20} />
            Coco-ify your drawing
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ×
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
          disabled={isLoading}
          className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition-colors mb-4 flex items-center justify-center"
        >
          {isLoading ? (
            <>
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
        
        {generatedImage && (
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-sm font-medium text-gray-700">Generated image:</h3>
              <a 
                href={generatedImage} 
                download="coco-generated-image.png"
                className="text-blue-500 flex items-center text-sm"
              >
                <Download size={14} className="mr-1" /> Download
              </a>
            </div>
            <img 
              src={generatedImage} 
              alt="Generated by Coco" 
              className="w-full rounded-md shadow-sm"
            />
          </div>
        )}
        
        {response && (
          <div className="mt-4 bg-gray-50 p-3 rounded-md">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Coco response:</h3>
            <div className="text-sm text-gray-600 whitespace-pre-wrap">{response}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AIAssistant; 
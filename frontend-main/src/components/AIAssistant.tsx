import React, { useState } from 'react';
import { useDrawing } from '../context/DrawingContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface AIAssistantProps {
  onClose: () => void;
}

const AIAssistant: React.FC<AIAssistantProps> = ({ onClose }) => {
  const { state } = useDrawing();
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  
  // Function to get the drawing data
  const getDrawingData = () => {
    // Convert shapes to a string representation
    return JSON.stringify(state.shapes);
  };
  
  // Function to get quick feedback on the drawing
  const getQuickFeedback = async () => {
    setIsLoading(true);
    setError('');
    setFeedback('');
    
    try {
      const drawingData = getDrawingData();
      
      const response = await fetch(`${API_URL}/api/claude/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ drawing_data: drawingData }),
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      setFeedback(data.feedback);
    } catch (err) {
      setError(`Error getting feedback: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Function to get detailed improvement suggestions
  const getImprovement = async () => {
    setIsLoading(true);
    setError('');
    setFeedback('');
    
    try {
      const drawingData = getDrawingData();
      
      const response = await fetch(`${API_URL}/api/claude/improve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          drawing_data: drawingData,
          prompt: prompt || 'Improve this drawing with more details and better technique.' 
        }),
      });
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const data = await response.json();
      setFeedback(data.improved_drawing);
    } catch (err) {
      setError(`Error getting improvements: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="absolute top-14 right-20 w-80 bg-white/90 rounded-lg shadow-lg p-4 z-20">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-bold">Claude AI Assistant</h3>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
      
      <div className="mb-3">
        <label className="block text-xs text-gray-700 mb-1">Specific Instructions (Optional)</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full text-xs p-2 border border-gray-300 rounded resize-none"
          placeholder="E.g., Make my drawing more realistic, add more details to the background, etc."
          rows={3}
        />
      </div>
      
      <div className="flex space-x-2 mb-3">
        <button
          onClick={getQuickFeedback}
          disabled={isLoading}
          className="flex-1 py-1 px-2 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition-colors disabled:bg-blue-300"
        >
          Quick Feedback
        </button>
        <button
          onClick={getImprovement}
          disabled={isLoading}
          className="flex-1 py-1 px-2 bg-purple-500 text-white text-xs rounded-md hover:bg-purple-600 transition-colors disabled:bg-purple-300"
        >
          Detailed Improvement
        </button>
      </div>
      
      {isLoading && (
        <div className="text-center py-2">
          <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-gray-600 mt-1">Claude is thinking...</p>
        </div>
      )}
      
      {error && (
        <div className="bg-red-100 text-red-700 p-2 rounded text-xs mb-2">
          {error}
        </div>
      )}
      
      {feedback && (
        <div className="bg-gray-100 p-3 rounded max-h-80 overflow-y-auto">
          <p className="text-xs whitespace-pre-wrap">{feedback}</p>
        </div>
      )}
    </div>
  );
};

export default AIAssistant; 
import React, { useState } from 'react';

interface FeedbackSubmission {
  feedback: string;
  timestamp: string;
}

const FeedbackTab: React.FC = () => {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!feedback.trim()) {
      setStatusMessage('Please enter some feedback before submitting.');
      setSubmitStatus('error');
      return;
    }

    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedback: feedback.trim(),
          timestamp: new Date().toISOString()
        }),
      });

      if (response.ok) {
        setSubmitStatus('success');
        setStatusMessage('Thank you for your feedback!');
        setFeedback('');
      } else {
        throw new Error('Failed to submit feedback');
      }
    } catch (error) {
      setSubmitStatus('error');
      setStatusMessage('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusColor = () => {
    switch (submitStatus) {
      case 'success':
        return 'text-green-600';
      case 'error':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className="w-full px-4 pt-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-transparent p-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Feedback
            </h1>
            <p className="text-gray-600">
              We'd love to hear what you think about this app!
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-2">
                What do you think about this app?
              </label>
              <textarea
                id="feedback"
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Share your thoughts, suggestions, or any issues you've encountered..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                rows={6}
                disabled={isSubmitting}
              />
            </div>

            {statusMessage && (
              <div className={`text-center ${getStatusColor()}`}>
                {statusMessage}
              </div>
            )}

            <div className="text-center">
              <button
                type="submit"
                disabled={isSubmitting || !feedback.trim()}
                className={`px-8 py-3 rounded-lg font-medium transition-colors ${
                  isSubmitting || !feedback.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </form>

          <div className="mt-8 text-center text-sm text-gray-500">
            <p>Your feedback helps us improve the app for everyone!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackTab; 
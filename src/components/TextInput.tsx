import React, { useState } from 'react';

interface TextInputProps {
  onSendText: (text: string) => void;
}

const TextInput: React.FC<TextInputProps> = ({ onSendText }) => {
  const [text, setText] = useState('');
  const [showTextArea, setShowTextArea] = useState(false);

  const handleSend = () => {
    if (text.trim()) {
      onSendText(text);
      setText('');
      setShowTextArea(false);
    }
  };

  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setText(clipboardText);
      setShowTextArea(true);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      alert('Please allow clipboard access to paste text');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="space-y-2">
      {!showTextArea ? (
        <div className="flex gap-2">
          <button
            onClick={() => setShowTextArea(true)}
            className="flex-1 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 transition"
          >
            Share Text
          </button>
          <button
            onClick={handlePaste}
            className="flex-1 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 transition"
          >
            Paste & Share
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Enter text to share..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
            rows={4}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={handleSend}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium transition"
            >
              Send
            </button>
            <button
              onClick={() => {
                setShowTextArea(false);
                setText('');
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TextInput;
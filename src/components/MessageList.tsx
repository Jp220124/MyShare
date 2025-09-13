import React from 'react';
import type { Message } from '../types';

interface MessageListProps {
  messages: Message[];
}

const MessageList: React.FC<MessageListProps> = ({ messages }) => {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const downloadFile = async (fileData: string, fileName: string) => {
    console.log('[Download] Starting download for:', fileName);
    console.log('[Download] Data type:', fileData.substring(0, 50));
    
    try {
      if (!fileData) {
        console.error('No file data available');
        alert('File download failed: No data available');
        return;
      }

      // Check if it's a data URL
      if (fileData.startsWith('data:')) {
        console.log('[Download] Downloading data URL, length:', fileData.length);
        // Direct download for data URLs
        const link = document.createElement('a');
        link.href = fileData;
        link.download = fileName || 'download';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        // Give browser time to process the download
        setTimeout(() => {
          document.body.removeChild(link);
        }, 100);
        console.log('[Download] Download initiated for:', fileName);
      } else if (fileData.startsWith('http://') || fileData.startsWith('https://')) {
        // External URL - fetch and download
        console.log(`Downloading from external URL: ${fileData}`);
        
        try {
          // For external services, we need to fetch the file first
          const response = await fetch(fileData);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);
          
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          // Clean up
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
        } catch (fetchError) {
          console.error('Fetch failed, trying direct download:', fetchError);
          // If fetch fails (CORS), try opening in new tab
          window.open(fileData, '_blank');
        }
      } else {
        console.error('Unknown file data format:', fileData);
        alert('File download failed: Unknown data format');
      }
    } catch (error) {
      console.error('Download failed:', error);
      alert('File download failed. Please try again.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 ? (
        <div className="text-center text-gray-400 mt-8">
          <p>No items shared yet</p>
          <p className="text-sm mt-1">Start by sharing a file or text</p>
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={`${
              message.sender === 'You'
                ? 'ml-auto bg-indigo-50 border-indigo-200'
                : message.sender === 'System'
                ? 'bg-gray-50 border-gray-200'
                : 'bg-white border-gray-200'
            } border rounded-lg p-3 max-w-md`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">{message.sender}</span>
              <span className="text-xs text-gray-400">
                {new Date(message.timestamp).toLocaleTimeString()}
              </span>
            </div>

            {message.type === 'text' && (
              <p className="text-gray-800 break-words">{message.content}</p>
            )}

            {message.type === 'file' && (
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 2a2 2 0 00-2 2v1H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2V4a2 2 0 00-2-2H9z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{message.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {message.fileSize && formatFileSize(message.fileSize)}
                    {message.content && ` • ${message.content}`}
                  </p>
                </div>
                {message.fileData ? (
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => downloadFile(message.fileData as string, message.fileName!)}
                      className="flex-shrink-0 bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
                    >
                      Download
                    </button>
                    <a
                      href={message.fileData as string}
                      download={message.fileName}
                      className="text-xs text-indigo-600 hover:text-indigo-700 text-center"
                    >
                      Direct Link
                    </a>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">Processing...</span>
                )}
              </div>
            )}

            {message.type === 'image' && (
              <div>
                {message.fileData && (
                  <img
                    src={message.fileData as string}
                    alt={message.fileName}
                    className="max-w-full rounded cursor-pointer hover:opacity-90"
                    onClick={() => downloadFile(message.fileData as string, message.fileName!)}
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {message.fileName} • {message.fileSize && formatFileSize(message.fileSize)}
                </p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default MessageList;
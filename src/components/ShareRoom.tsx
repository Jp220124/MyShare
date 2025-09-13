import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import type { Message, Peer } from '../types';
import { SimpleWebSocketService } from '../services/SimpleWebSocketService';
import { WebRTCService } from '../services/WebRTCService';
import { ChunkedFileService } from '../services/ChunkedFileService';
import { generatePeerId } from '../utils/generateRoomId';
import MessageList from './MessageList';
import FileUpload from './FileUpload';
import TextInput from './TextInput';

const ShareRoom: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [connected, setConnected] = useState(false);
  const roomUrl = `${window.location.origin}/room/${roomId}`;
  
  const wsRef = useRef<SimpleWebSocketService | null>(null);
  const webRTCRef = useRef<WebRTCService | null>(null);
  const peerIdRef = useRef<string>(generatePeerId());

  useEffect(() => {
    if (!roomId) return;

    // Initialize WebSocket connection
    const ws = new SimpleWebSocketService(roomId, peerIdRef.current);
    wsRef.current = ws;

    // Initialize WebRTC service
    const webRTC = new WebRTCService(ws, peerIdRef.current);
    webRTCRef.current = webRTC;

    // Set up event handlers
    const unsubscribeMessage = ws.onMessage((message) => {
      if (message.sender !== peerIdRef.current) {
        setMessages(prev => [...prev, message]);
      }
    });

    const unsubscribePeers = ws.onPeersUpdate((updatedPeers) => {
      setPeers(updatedPeers.filter(p => p.id !== peerIdRef.current));
      
      // Try to establish P2P connections with new peers
      updatedPeers.forEach(peer => {
        if (peer.id !== peerIdRef.current) {
          webRTC.createConnection(peer.id);
        }
      });
    });

    const unsubscribeConnection = ws.onConnectionChange((isConnected) => {
      setConnected(isConnected);
      if (isConnected) {
        const welcomeMessage: Message = {
          id: Date.now().toString(),
          type: 'text',
          sender: 'System',
          content: `Welcome to room ${roomId}! Share this code with others to connect.`,
          timestamp: Date.now()
        };
        setMessages([welcomeMessage]);
      }
    });

    // Connect to WebSocket
    ws.connect();

    // Cleanup
    return () => {
      unsubscribeMessage();
      unsubscribePeers();
      unsubscribeConnection();
      webRTC.disconnect();
      ws.disconnect();
    };
  }, [roomId]);

  const handleSendText = (text: string) => {
    if (!wsRef.current) return;
    
    const message = wsRef.current.sendTextMessage(text);
    setMessages(prev => [...prev, { ...message, sender: 'You' }]);
  };

  const handleSendFile = async (file: File) => {
    if (!wsRef.current) return;

    // Check file size - if over 100KB, use chunking
    const MAX_DIRECT_SIZE = 100 * 1024; // 100KB
    
    if (file.size > MAX_DIRECT_SIZE) {
      // Large file - use chunked transfer
      const message: Message = {
        id: Date.now().toString(),
        type: 'file',
        sender: 'You',
        fileName: file.name,
        fileSize: file.size,
        content: 'Uploading large file...',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, message]);
      
      try {
        await ChunkedFileService.sendFileInChunks(
          wsRef.current,
          file,
          peerIdRef.current,
          (progress) => {
            console.log(`Upload progress: ${progress.toFixed(1)}%`);
          }
        );
        
        // Update message to show completion
        setMessages(prev => prev.map(m => 
          m.id === message.id 
            ? { ...m, content: 'File sent successfully!' }
            : m
        ));
      } catch (error) {
        console.error('Failed to send large file:', error);
        setMessages(prev => prev.map(m => 
          m.id === message.id 
            ? { ...m, content: 'Failed to send file' }
            : m
        ));
      }
    } else {
      // Small file - send directly
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!wsRef.current) return;
        const message = wsRef.current.sendFileMessage(
          file.name,
          file.size,
          e.target?.result as string
        );
        setMessages(prev => [...prev, { ...message, sender: 'You' }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLeaveRoom = () => {
    if (wsRef.current) {
      wsRef.current.disconnect();
    }
    if (webRTCRef.current) {
      webRTCRef.current.disconnect();
    }
    navigate('/');
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId || '');
    alert('Room code copied!');
  };

  const copyRoomUrl = () => {
    navigator.clipboard.writeText(roomUrl);
    alert('Room URL copied!');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-semibold text-gray-800">WebShare</h1>
            <div className="flex items-center space-x-2">
              <span className="text-gray-600">Room:</span>
              <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">{roomId}</code>
              <button
                onClick={copyRoomCode}
                className="text-indigo-600 hover:text-indigo-700 text-sm"
              >
                Copy
              </button>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm text-gray-600">
                {connected ? `${peers.length + 1} device(s)` : 'Connecting...'}
              </span>
            </div>
            <button
              onClick={() => setShowQR(!showQR)}
              className="bg-gray-100 px-3 py-1 rounded hover:bg-gray-200 text-sm"
            >
              {showQR ? 'Hide' : 'Show'} QR
            </button>
            <button
              onClick={handleLeaveRoom}
              className="bg-red-500 text-white px-3 py-1 rounded hover:bg-red-600 text-sm"
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {showQR && (
        <div className="absolute top-16 right-4 bg-white rounded-lg shadow-xl p-4 z-50">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-2">Scan to join room</p>
            <QRCodeSVG value={roomUrl} size={200} />
            <button
              onClick={copyRoomUrl}
              className="mt-3 text-sm text-indigo-600 hover:text-indigo-700"
            >
              Copy room URL
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 max-w-6xl mx-auto w-full flex gap-4 p-4">
        {/* Messages Area */}
        <div className="flex-1 bg-white rounded-lg shadow-sm border flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-gray-800">Shared Items</h2>
          </div>
          <MessageList messages={messages} />
        </div>

        {/* Sidebar */}
        <div className="w-80 space-y-4">
          {/* Connected Devices */}
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <h3 className="font-semibold text-gray-800 mb-3">Connected Devices</h3>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm">You (this device)</span>
              </div>
              {peers.map((peer) => (
                <div key={peer.id} className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span className="text-sm">{peer.name}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Share Options */}
          <div className="bg-white rounded-lg shadow-sm border p-4 space-y-3">
            <h3 className="font-semibold text-gray-800">Share</h3>
            <FileUpload onFileSelect={handleSendFile} />
            <TextInput onSendText={handleSendText} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShareRoom;
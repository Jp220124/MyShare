import type { Message, Peer } from '../types';

export class SimpleWebSocketService {
  private ws: WebSocket | null = null;
  private roomId: string;
  private peerId: string;
  private messageHandlers: Set<(message: Message) => void> = new Set();
  private peerHandlers: Set<(peers: Peer[]) => void> = new Set();
  private connectionHandlers: Set<(connected: boolean) => void> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private wsUrl: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private fileChunks: Map<string, { metadata: any; chunks: Map<number, string> }> = new Map();

  constructor(roomId: string, peerId: string) {
    this.roomId = roomId;
    this.peerId = peerId;
    // Use the deployed Worker URL
    this.wsUrl = import.meta.env.VITE_WS_URL || 'wss://webshare-worker.priyanshukumarmaurya786.workers.dev';
  }

  connect() {
    try {
      // Construct WebSocket URL
      const wsEndpoint = `${this.wsUrl}/room/${this.roomId}?peerId=${this.peerId}`;
      console.log('Connecting to:', wsEndpoint);
      
      this.ws = new WebSocket(wsEndpoint);

      this.ws.onopen = () => {
        console.log('WebSocket connected successfully');
        this.reconnectAttempts = 0;
        this.notifyConnectionHandlers(true);
        
        // Send join message
        this.sendMessage({
          type: 'join',
          roomId: this.roomId,
          peerId: this.peerId,
          timestamp: Date.now(),
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse message:', error, event.data);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.notifyConnectionHandlers(false);
        
        // Attempt reconnect if not intentional close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.notifyConnectionHandlers(false);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      this.notifyConnectionHandlers(false);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.attemptReconnect();
      }
    }
  }

  private attemptReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'peers':
        console.log('Peers update:', data.peers);
        this.notifyPeerHandlers(data.peers || []);
        break;
        
      case 'message':
        console.log('Message received:', data.message);
        this.notifyMessageHandlers(data.message);
        break;
        
      case 'file-start':
        console.log('File transfer starting:', data);
        this.fileChunks.set(data.fileId, {
          metadata: data,
          chunks: new Map()
        });
        break;
        
      case 'file-chunk':
        console.log(`File chunk received: ${data.chunkIndex}`);
        const fileData = this.fileChunks.get(data.fileId);
        if (fileData) {
          fileData.chunks.set(data.chunkIndex, data.chunkData);
        }
        break;
        
      case 'file-end':
        console.log('File transfer complete:', data.fileId);
        const completeFile = this.fileChunks.get(data.fileId);
        if (completeFile) {
          // Reassemble and notify
          import('./ChunkedFileService').then(({ ChunkedFileService }) => {
            try {
              const fileDataUrl = ChunkedFileService.reassembleFile(
                completeFile.chunks,
                completeFile.metadata
              );
              
              const message: Message = {
                id: data.fileId,
                type: completeFile.metadata.fileType.startsWith('image/') ? 'image' : 'file',
                sender: data.sender,
                fileName: completeFile.metadata.fileName,
                fileSize: completeFile.metadata.fileSize,
                fileData: fileDataUrl,
                timestamp: Date.now()
              };
              
              this.notifyMessageHandlers(message);
              this.fileChunks.delete(data.fileId);
            } catch (error) {
              console.error('Failed to reassemble file:', error);
            }
          });
        }
        break;
        
      case 'peer-joined':
        console.log('Peer joined:', data.peerId);
        // Request updated peer list
        this.sendMessage({ type: 'get-peers' });
        break;
        
      case 'peer-left':
        console.log('Peer left:', data.peerId);
        // Request updated peer list
        this.sendMessage({ type: 'get-peers' });
        break;
        
      case 'error':
        console.error('Server error:', data.message);
        break;
        
      default:
        if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice-candidate') {
          // WebRTC signaling messages
          this.notifyMessageHandlers(data);
        } else {
          console.log('Unknown message type:', data.type);
        }
    }
  }

  sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const messageStr = JSON.stringify(message);
      console.log('Sending message:', messageStr);
      this.ws.send(messageStr);
    } else {
      console.error('WebSocket is not connected. State:', this.ws?.readyState);
      // Queue message or notify user
    }
  }

  sendTextMessage(content: string) {
    const message: Message = {
      id: Date.now().toString(),
      type: 'text',
      sender: this.peerId,
      content,
      timestamp: Date.now(),
    };
    
    this.sendMessage({
      type: 'message',
      message,
    });
    
    return message;
  }

  sendFileMessage(fileName: string, fileSize: number, fileData: string) {
    const message: Message = {
      id: Date.now().toString(),
      type: fileData.startsWith('data:image/') ? 'image' : 'file',
      sender: this.peerId,
      fileName,
      fileSize,
      fileData,
      timestamp: Date.now(),
    };
    
    this.sendMessage({
      type: 'message',
      message,
    });
    
    return message;
  }

  onMessage(handler: (message: Message) => void) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onPeersUpdate(handler: (peers: Peer[]) => void) {
    this.peerHandlers.add(handler);
    return () => this.peerHandlers.delete(handler);
  }

  onConnectionChange(handler: (connected: boolean) => void) {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  private notifyMessageHandlers(message: Message) {
    this.messageHandlers.forEach(handler => handler(message));
  }

  private notifyPeerHandlers(peers: Peer[]) {
    this.peerHandlers.forEach(handler => handler(peers));
  }

  private notifyConnectionHandlers(connected: boolean) {
    this.connectionHandlers.forEach(handler => handler(connected));
  }

  disconnect() {
    console.log('Disconnecting WebSocket');
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.ws) {
      // Send leave message before closing
      if (this.ws.readyState === WebSocket.OPEN) {
        this.sendMessage({
          type: 'leave',
          peerId: this.peerId,
        });
      }
      
      this.ws.close(1000, 'User disconnect');
      this.ws = null;
    }
    
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
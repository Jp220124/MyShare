import type { Message, Peer } from '../types';

export class WebSocketService {
  private ws: WebSocket | null = null;
  private roomId: string;
  private peerId: string;
  private messageHandlers: Set<(message: Message) => void> = new Set();
  private peerHandlers: Set<(peers: Peer[]) => void> = new Set();
  private connectionHandlers: Set<(connected: boolean) => void> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private wsUrl: string;

  constructor(roomId: string, peerId: string) {
    this.roomId = roomId;
    this.peerId = peerId;
    // For development, use local WebSocket server. In production, this will be the Cloudflare Worker URL
    this.wsUrl = import.meta.env.VITE_WS_URL || 'wss://webshare-worker.your-subdomain.workers.dev';
  }

  connect() {
    try {
      this.ws = new WebSocket(`${this.wsUrl}/room/${this.roomId}?peerId=${this.peerId}`);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.notifyConnectionHandlers(true);
        this.sendMessage({
          type: 'join',
          roomId: this.roomId,
          peerId: this.peerId,
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.notifyConnectionHandlers(false);
        this.attemptReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.notifyConnectionHandlers(false);
      };
    } catch (error) {
      console.error('Failed to connect:', error);
      this.notifyConnectionHandlers(false);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    this.reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect...');
      this.connect();
    }, 3000);
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'peers':
        this.notifyPeerHandlers(data.peers);
        break;
      case 'message':
        this.notifyMessageHandlers(data.message);
        break;
      case 'peer-joined':
        console.log('Peer joined:', data.peerId);
        break;
      case 'peer-left':
        console.log('Peer left:', data.peerId);
        break;
      default:
        if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice-candidate') {
          // These will be handled by WebRTC service
          this.notifyMessageHandlers(data);
        }
    }
  }

  sendMessage(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error('WebSocket is not connected');
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
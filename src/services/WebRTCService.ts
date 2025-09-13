import { P2PFileTransfer, type ReceivedFile } from './P2PFileTransfer';

export class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private connectionStates: Map<string, string> = new Map();
  private ws: any; // WebSocketService instance
  private localPeerId: string;
  private p2pFileTransfer: P2PFileTransfer;
  private onFileReceivedCallback?: (file: ReceivedFile) => void;
  
  private readonly iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
  ];

  constructor(ws: any, localPeerId: string) {
    this.ws = ws;
    this.localPeerId = localPeerId;
    this.p2pFileTransfer = new P2PFileTransfer();
    
    // Set up file received callback
    this.p2pFileTransfer.onFileReceivedCallback((file) => {
      if (this.onFileReceivedCallback) {
        this.onFileReceivedCallback(file);
      }
    });
    
    // Listen for WebRTC signaling messages
    ws.onMessage((message: any) => {
      if (message.type === 'offer') {
        this.handleOffer(message);
      } else if (message.type === 'answer') {
        this.handleAnswer(message);
      } else if (message.type === 'ice-candidate') {
        this.handleIceCandidate(message);
      }
    });
  }

  async createConnection(remotePeerId: string): Promise<RTCDataChannel> {
    console.log(`[WebRTC] Creating connection to ${remotePeerId}`);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(remotePeerId, pc);
    
    // Monitor connection state
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${remotePeerId}: ${pc.connectionState}`);
      this.connectionStates.set(remotePeerId, pc.connectionState);
    };

    // Create data channel
    const dataChannel = pc.createDataChannel('fileTransfer');
    this.setupDataChannel(dataChannel, remotePeerId);
    this.dataChannels.set(remotePeerId, dataChannel);

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.sendMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          from: this.localPeerId,
          to: remotePeerId,
        });
      }
    };

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    this.ws.sendMessage({
      type: 'offer',
      offer: offer,
      from: this.localPeerId,
      to: remotePeerId,
    });

    return dataChannel;
  }

  private async handleOffer(message: any) {
    const { offer, from } = message;
    
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(from, pc);

    pc.ondatachannel = (event) => {
      const dataChannel = event.channel;
      this.setupDataChannel(dataChannel, from);
      this.dataChannels.set(from, dataChannel);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.sendMessage({
          type: 'ice-candidate',
          candidate: event.candidate,
          from: this.localPeerId,
          to: from,
        });
      }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.ws.sendMessage({
      type: 'answer',
      answer: answer,
      from: this.localPeerId,
      to: from,
    });
  }

  private async handleAnswer(message: any) {
    const { answer, from } = message;
    const pc = this.peerConnections.get(from);
    
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  private async handleIceCandidate(message: any) {
    const { candidate, from } = message;
    const pc = this.peerConnections.get(from);
    
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string) {
    // Set binary type for file transfers
    dataChannel.binaryType = 'arraybuffer';
    
    dataChannel.onopen = () => {
      console.log(`[WebRTC] Data channel opened with ${peerId}`);
      this.connectionStates.set(peerId, 'connected');
    };

    dataChannel.onclose = () => {
      console.log(`[WebRTC] Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
      this.connectionStates.set(peerId, 'disconnected');
    };

    dataChannel.onerror = (error) => {
      console.error(`[WebRTC] Data channel error with ${peerId}:`, error);
      this.connectionStates.set(peerId, 'error');
    };

    dataChannel.onmessage = (event) => {
      // Handle incoming data through P2PFileTransfer
      this.p2pFileTransfer.handleMessage(event.data, peerId);
    };
  }


  sendDataToPeer(peerId: string, data: any) {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel && dataChannel.readyState === 'open') {
      if (typeof data === 'object') {
        dataChannel.send(JSON.stringify(data));
      } else {
        dataChannel.send(data);
      }
      return true;
    }
    return false;
  }

  async sendFileToPeer(
    peerId: string, 
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    const dataChannel = this.dataChannels.get(peerId);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      console.log(`[WebRTC] DataChannel not available for ${peerId}`);
      return false;
    }

    // Use P2PFileTransfer for reliable file transfer
    return await this.p2pFileTransfer.sendFile(dataChannel, file, onProgress);
  }

  // Check if P2P connection is available for a peer
  isPeerConnected(peerId: string): boolean {
    const dataChannel = this.dataChannels.get(peerId);
    return dataChannel !== undefined && dataChannel.readyState === 'open';
  }

  // Get connection state for a peer
  getConnectionState(peerId: string): string {
    return this.connectionStates.get(peerId) || 'disconnected';
  }

  // Set callback for when files are received
  onFileReceived(callback: (file: ReceivedFile) => void): void {
    this.onFileReceivedCallback = callback;
  }

  disconnect() {
    this.dataChannels.forEach(channel => channel.close());
    this.peerConnections.forEach(pc => pc.close());
    this.dataChannels.clear();
    this.peerConnections.clear();
  }
}
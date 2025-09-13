export class WebRTCService {
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private ws: any; // WebSocketService instance
  private localPeerId: string;
  
  private readonly iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  constructor(ws: any, localPeerId: string) {
    this.ws = ws;
    this.localPeerId = localPeerId;
    
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
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.peerConnections.set(remotePeerId, pc);

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
    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
      this.dataChannels.delete(peerId);
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
    };

    dataChannel.onmessage = (event) => {
      // Handle incoming data
      this.handleDataChannelMessage(event.data, peerId);
    };
  }

  private handleDataChannelMessage(data: any, peerId: string) {
    try {
      const message = JSON.parse(data);
      // Process the message based on type
      console.log('Received via P2P:', message);
    } catch (error) {
      // Handle binary data for file transfers
      console.log('Received binary data from', peerId);
    }
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

  async sendFileToPeer(peerId: string, file: File) {
    const dataChannel = this.dataChannels.get(peerId);
    if (!dataChannel || dataChannel.readyState !== 'open') {
      // Fallback to WebSocket if P2P is not available
      return false;
    }

    const chunkSize = 16384; // 16KB chunks
    const reader = new FileReader();
    
    // Send file metadata first
    dataChannel.send(JSON.stringify({
      type: 'file-start',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    }));

    // Read and send file in chunks
    let offset = 0;
    
    const readSlice = () => {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = (e) => {
      if (e.target?.result && e.target.result instanceof ArrayBuffer) {
        dataChannel.send(e.target.result);
        offset += chunkSize;
        
        if (offset < file.size) {
          readSlice();
        } else {
          // File transfer complete
          dataChannel.send(JSON.stringify({ type: 'file-end' }));
        }
      }
    };

    readSlice();
    return true;
  }

  disconnect() {
    this.dataChannels.forEach(channel => channel.close());
    this.peerConnections.forEach(pc => pc.close());
    this.dataChannels.clear();
    this.peerConnections.clear();
  }
}
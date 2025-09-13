// P2P File Transfer Service using WebRTC DataChannel
export class P2PFileTransfer {
  private static CHUNK_SIZE = 65536; // 64KB - optimal for DataChannel
  private fileReceivers: Map<string, FileReceiver> = new Map();
  private onFileReceived?: (file: ReceivedFile) => void;

  constructor() {
    this.fileReceivers = new Map();
  }

  // Send file through DataChannel with progress tracking
  async sendFile(
    dataChannel: RTCDataChannel,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<boolean> {
    if (dataChannel.readyState !== 'open') {
      console.error('DataChannel is not open');
      return false;
    }

    try {
      const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const totalChunks = Math.ceil(file.size / P2PFileTransfer.CHUNK_SIZE);
      
      console.log(`[P2P] Starting file transfer: ${file.name} (${file.size} bytes, ${totalChunks} chunks)`);

      // Send file metadata
      const metadata = {
        type: 'file-metadata',
        fileId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        totalChunks
      };
      
      dataChannel.send(JSON.stringify(metadata));
      
      // Wait a bit for receiver to prepare
      await new Promise(resolve => setTimeout(resolve, 100));

      // Send file chunks
      let offset = 0;
      let chunkIndex = 0;

      while (offset < file.size) {
        const chunk = file.slice(offset, offset + P2PFileTransfer.CHUNK_SIZE);
        const arrayBuffer = await this.readChunkAsArrayBuffer(chunk);
        
        // Send chunk header
        const chunkHeader = {
          type: 'file-chunk-header',
          fileId,
          chunkIndex,
          chunkSize: arrayBuffer.byteLength
        };
        
        dataChannel.send(JSON.stringify(chunkHeader));
        
        // Wait for buffer to clear if needed
        while (dataChannel.bufferedAmount > P2PFileTransfer.CHUNK_SIZE * 10) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Send chunk data
        dataChannel.send(arrayBuffer);
        
        offset += P2PFileTransfer.CHUNK_SIZE;
        chunkIndex++;
        
        if (onProgress) {
          const progress = (chunkIndex / totalChunks) * 100;
          onProgress(progress);
          console.log(`[P2P] Sent chunk ${chunkIndex}/${totalChunks} (${progress.toFixed(1)}%)`);
        }
        
        // Small delay between chunks to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Send completion message
      const completion = {
        type: 'file-complete',
        fileId
      };
      dataChannel.send(JSON.stringify(completion));
      
      console.log(`[P2P] File transfer complete: ${file.name}`);
      return true;
      
    } catch (error) {
      console.error('[P2P] File transfer failed:', error);
      return false;
    }
  }

  // Handle incoming messages from DataChannel
  handleMessage(data: any, peerId: string): void {
    // Handle text messages (JSON)
    if (typeof data === 'string') {
      try {
        const message = JSON.parse(data);
        this.handleControlMessage(message, peerId);
      } catch (error) {
        console.error('[P2P] Failed to parse message:', error);
      }
    } 
    // Handle binary data (file chunks)
    else if (data instanceof ArrayBuffer) {
      this.handleChunkData(data, peerId);
    }
  }

  private handleControlMessage(message: any, peerId: string): void {
    switch (message.type) {
      case 'file-metadata':
        this.startFileReception(message, peerId);
        break;
      case 'file-chunk-header':
        this.prepareForChunk(message, peerId);
        break;
      case 'file-complete':
        this.completeFileReception(message.fileId, peerId);
        break;
    }
  }

  private startFileReception(metadata: any, peerId: string): void {
    console.log(`[P2P] Receiving file: ${metadata.fileName} from ${peerId}`);
    
    const receiver: FileReceiver = {
      fileId: metadata.fileId,
      fileName: metadata.fileName,
      fileSize: metadata.fileSize,
      fileType: metadata.fileType,
      totalChunks: metadata.totalChunks,
      chunks: new Map(),
      expectedChunkIndex: -1,
      peerId
    };
    
    this.fileReceivers.set(metadata.fileId, receiver);
  }

  private prepareForChunk(header: any, peerId: string): void {
    const receiver = this.fileReceivers.get(header.fileId);
    if (receiver) {
      receiver.expectedChunkIndex = header.chunkIndex;
      receiver.expectedChunkSize = header.chunkSize;
    }
  }

  private handleChunkData(arrayBuffer: ArrayBuffer, peerId: string): void {
    // Find the receiver expecting this chunk
    let receiver: FileReceiver | undefined;
    
    for (const [_, recv] of this.fileReceivers) {
      if (recv.peerId === peerId && recv.expectedChunkIndex >= 0) {
        receiver = recv;
        break;
      }
    }
    
    if (receiver) {
      receiver.chunks.set(receiver.expectedChunkIndex, arrayBuffer);
      console.log(`[P2P] Received chunk ${receiver.expectedChunkIndex + 1}/${receiver.totalChunks} for ${receiver.fileName}`);
      receiver.expectedChunkIndex = -1; // Reset for next chunk
    }
  }

  private async completeFileReception(fileId: string, peerId: string): Promise<void> {
    const receiver = this.fileReceivers.get(fileId);
    if (!receiver) return;
    
    console.log(`[P2P] Assembling file: ${receiver.fileName}`);
    
    // Combine all chunks
    const chunks: ArrayBuffer[] = [];
    for (let i = 0; i < receiver.totalChunks; i++) {
      const chunk = receiver.chunks.get(i);
      if (!chunk) {
        console.error(`[P2P] Missing chunk ${i} for file ${receiver.fileName}`);
        return;
      }
      chunks.push(chunk);
    }
    
    // Create blob from chunks
    const blob = new Blob(chunks, { type: receiver.fileType });
    const dataUrl = await this.blobToDataURL(blob);
    
    console.log(`[P2P] File received successfully: ${receiver.fileName}`);
    
    // Notify about received file
    if (this.onFileReceived) {
      this.onFileReceived({
        fileName: receiver.fileName,
        fileSize: receiver.fileSize,
        fileType: receiver.fileType,
        fileData: dataUrl,
        blob: blob,
        peerId: peerId
      });
    }
    
    // Clean up
    this.fileReceivers.delete(fileId);
  }

  private readChunkAsArrayBuffer(chunk: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result instanceof ArrayBuffer) {
          resolve(e.target.result);
        } else {
          reject(new Error('Failed to read chunk as ArrayBuffer'));
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(chunk);
    });
  }

  private blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Set callback for when file is received
  onFileReceivedCallback(callback: (file: ReceivedFile) => void): void {
    this.onFileReceived = callback;
  }
}

// Types
interface FileReceiver {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  totalChunks: number;
  chunks: Map<number, ArrayBuffer>;
  expectedChunkIndex: number;
  expectedChunkSize?: number;
  peerId: string;
}

export interface ReceivedFile {
  fileName: string;
  fileSize: number;
  fileType: string;
  fileData: string; // Data URL
  blob: Blob;
  peerId: string;
}
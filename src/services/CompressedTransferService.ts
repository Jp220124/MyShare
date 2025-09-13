// Compressed WebSocket Transfer Service
// Splits files into small chunks and sends through WebSocket with compression

export class CompressedTransferService {
  private static CHUNK_SIZE = 32 * 1024; // 32KB chunks (smaller for WebSocket)
  private static MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max
  
  // Convert file to base64 chunks
  static async fileToChunks(file: File): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const chunks: string[] = [];
      let offset = 0;

      const readNextChunk = () => {
        if (offset >= file.size) {
          resolve(chunks);
          return;
        }

        const chunk = file.slice(offset, offset + this.CHUNK_SIZE);
        reader.readAsDataURL(chunk);
      };

      reader.onload = (e) => {
        if (e.target?.result) {
          // Extract just the base64 data part
          const base64 = (e.target.result as string).split(',')[1] || '';
          chunks.push(base64);
          offset += this.CHUNK_SIZE;
          readNextChunk();
        }
      };

      reader.onerror = reject;
      readNextChunk();
    });
  }

  // Reassemble chunks back to file
  static chunksToDataUrl(chunks: string[], mimeType: string): string {
    const fullBase64 = chunks.join('');
    return `data:${mimeType};base64,${fullBase64}`;
  }

  // Send file through WebSocket in chunks
  static async sendFileInChunks(
    ws: any,
    file: File,
    roomId: string,
    peerId: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    const chunks = await this.fileToChunks(file);
    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[Compressed] Sending ${file.name} in ${chunks.length} chunks`);

    // Send metadata first
    ws.sendMessage({
      type: 'file-metadata',
      roomId,
      peerId,
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks: chunks.length,
      timestamp: Date.now()
    });

    // Send chunks with delay to avoid overwhelming
    for (let i = 0; i < chunks.length; i++) {
      ws.sendMessage({
        type: 'file-chunk',
        roomId,
        peerId,
        fileId,
        chunkIndex: i,
        chunkData: chunks[i],
        timestamp: Date.now()
      });

      if (onProgress) {
        const progress = ((i + 1) / chunks.length) * 100;
        onProgress(progress);
      }

      // Small delay between chunks
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Send completion message
    ws.sendMessage({
      type: 'file-complete',
      roomId,
      peerId,
      fileId,
      timestamp: Date.now()
    });

    console.log(`[Compressed] File transfer complete: ${file.name}`);
  }

  // Handle receiving file chunks
  private static receivedFiles = new Map<string, {
    metadata: any;
    chunks: Map<number, string>;
  }>();

  static handleFileMetadata(data: any): void {
    console.log(`[Compressed] Receiving file: ${data.fileName}`);
    this.receivedFiles.set(data.fileId, {
      metadata: data,
      chunks: new Map()
    });
  }

  static handleFileChunk(data: any): void {
    const file = this.receivedFiles.get(data.fileId);
    if (file) {
      file.chunks.set(data.chunkIndex, data.chunkData);
      const progress = ((file.chunks.size / file.metadata.totalChunks) * 100).toFixed(1);
      console.log(`[Compressed] Chunk ${data.chunkIndex + 1}/${file.metadata.totalChunks} (${progress}%)`);
    }
  }

  static handleFileComplete(data: any): { fileName: string; fileData: string; fileSize: number; fileType: string } | null {
    const file = this.receivedFiles.get(data.fileId);
    if (!file) return null;

    // Reassemble chunks in order
    const orderedChunks: string[] = [];
    for (let i = 0; i < file.metadata.totalChunks; i++) {
      const chunk = file.chunks.get(i);
      if (!chunk) {
        console.error(`[Compressed] Missing chunk ${i}`);
        return null;
      }
      orderedChunks.push(chunk);
    }

    const dataUrl = this.chunksToDataUrl(orderedChunks, file.metadata.fileType);
    
    // Clean up
    this.receivedFiles.delete(data.fileId);

    console.log(`[Compressed] File assembled: ${file.metadata.fileName}`);
    
    return {
      fileName: file.metadata.fileName,
      fileData: dataUrl,
      fileSize: file.metadata.fileSize,
      fileType: file.metadata.fileType
    };
  }
}
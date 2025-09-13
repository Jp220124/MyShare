export class ChunkedFileService {
  private static CHUNK_SIZE = 50000; // 50KB chunks to stay under limit

  static async sendFileInChunks(
    ws: any,
    file: File,
    peerId: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    const reader = new FileReader();
    const fileId = Date.now().toString();
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);
    
    // Send file metadata first
    ws.sendMessage({
      type: 'file-start',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks,
      sender: peerId,
    });

    // Read and send file in chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      await new Promise<void>((resolve, reject) => {
        reader.onload = (e) => {
          if (e.target?.result) {
            ws.sendMessage({
              type: 'file-chunk',
              fileId,
              chunkIndex: i,
              chunkData: e.target.result as string,
              sender: peerId,
            });
            
            if (onProgress) {
              onProgress((i + 1) / totalChunks * 100);
            }
            
            resolve();
          } else {
            reject(new Error('Failed to read chunk'));
          }
        };
        
        reader.onerror = reject;
        reader.readAsDataURL(chunk);
      });
      
      // Small delay between chunks to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Send completion message
    ws.sendMessage({
      type: 'file-end',
      fileId,
      sender: peerId,
    });
  }

  static reassembleFile(
    chunks: Map<number, string>,
    metadata: any
  ): string {
    const sortedChunks: string[] = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      const chunk = chunks.get(i);
      if (!chunk) {
        throw new Error(`Missing chunk ${i}`);
      }
      
      // Remove data URL prefix from chunks after the first
      if (i === 0) {
        sortedChunks.push(chunk);
      } else {
        const base64Data = chunk.split(',')[1];
        sortedChunks.push(base64Data);
      }
    }
    
    // Combine chunks
    if (sortedChunks.length === 1) {
      return sortedChunks[0];
    }
    
    const [prefix, firstData] = sortedChunks[0].split(',');
    const combinedData = firstData + sortedChunks.slice(1).join('');
    return `${prefix},${combinedData}`;
  }
}
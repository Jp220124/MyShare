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
        console.error(`Missing chunk ${i} of ${metadata.totalChunks}`);
        throw new Error(`Missing chunk ${i}`);
      }
      sortedChunks.push(chunk);
    }
    
    // For single chunk, return as-is
    if (sortedChunks.length === 1) {
      return sortedChunks[0];
    }
    
    // For multiple chunks, combine them properly
    // First chunk has the full data URL prefix
    let result = sortedChunks[0];
    
    // Subsequent chunks should have their prefix removed
    for (let i = 1; i < sortedChunks.length; i++) {
      const chunk = sortedChunks[i];
      // Remove the data URL prefix from subsequent chunks
      const commaIndex = chunk.indexOf(',');
      if (commaIndex !== -1) {
        result += chunk.substring(commaIndex + 1);
      } else {
        result += chunk;
      }
    }
    
    return result;
  }
}
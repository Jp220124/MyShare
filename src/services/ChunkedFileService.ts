export class ChunkedFileService {
  private static CHUNK_SIZE = 8192; // 8KB chunks for better reliability with WebSocket limits

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
    console.log(`Starting file transfer: ${file.name} (${file.size} bytes, ${totalChunks} chunks)`);
    ws.sendMessage({
      type: 'file-start',
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      totalChunks,
      sender: peerId,
    });

    // Read and send file in chunks as base64 (without data URL prefix)
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      await new Promise<void>((resolve, reject) => {
        reader.onload = (e) => {
          if (e.target?.result) {
            // Extract just the base64 part from the data URL
            const dataUrl = e.target.result as string;
            const base64Data = dataUrl.split(',')[1] || dataUrl;
            
            ws.sendMessage({
              type: 'file-chunk',
              fileId,
              chunkIndex: i,
              chunkData: base64Data, // Send only base64 data
              sender: peerId,
            });
            
            console.log(`Sent chunk ${i + 1}/${totalChunks} (${base64Data.length} bytes)`);
            
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
      
      // Delay between chunks to avoid overwhelming WebSocket
      await new Promise(resolve => setTimeout(resolve, 100));
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
    
    // Since we're now sending pure base64 chunks, we need to reconstruct the data URL
    // Combine all base64 chunks
    const combinedBase64 = sortedChunks.join('');
    
    // Create the data URL with the appropriate MIME type from metadata
    const mimeType = metadata.fileType || 'application/octet-stream';
    const dataUrl = `data:${mimeType};base64,${combinedBase64}`;
    
    console.log(`Reassembled file: ${metadata.fileName}, MIME: ${mimeType}, size: ${dataUrl.length}`);
    
    return dataUrl;
  }
}
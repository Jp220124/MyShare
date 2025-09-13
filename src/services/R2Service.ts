export class R2Service {
  private static WORKER_URL = import.meta.env.VITE_R2_WORKER_URL || 'https://your-worker.workers.dev';
  private static MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit
  
  static async uploadFile(file: File): Promise<string> {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('file', file);

      // Upload directly to worker
      const response = await fetch(`${this.WORKER_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Upload failed: ${error}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }

      console.log(`[R2] File uploaded successfully: ${file.name}`);
      console.log(`[R2] Download URL: ${result.url}`);
      
      return result.url;

    } catch (error) {
      console.error('[R2] Upload failed:', error);
      throw error;
    }
  }

  static async deleteFile(fileId: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.WORKER_URL}/delete-file`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileId }),
      });

      return response.ok;
    } catch (error) {
      console.error('[R2] Delete failed:', error);
      return false;
    }
  }

  static isConfigured(): boolean {
    return this.WORKER_URL !== 'https://your-worker.workers.dev';
  }
}
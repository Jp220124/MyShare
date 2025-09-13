export class R2Service {
  private static WORKER_URL = import.meta.env.VITE_R2_WORKER_URL || 'https://your-worker.workers.dev';
  private static MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit
  
  static async uploadFile(file: File): Promise<string> {
    if (file.size > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds ${this.MAX_FILE_SIZE / 1024 / 1024}MB limit`);
    }

    try {
      // Get presigned URL from worker
      const presignedResponse = await fetch(`${this.WORKER_URL}/get-upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, downloadUrl, fileId } = await presignedResponse.json();

      // Upload file directly to R2 using presigned URL
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to R2');
      }

      console.log(`[R2] File uploaded successfully: ${file.name} (ID: ${fileId})`);
      return downloadUrl;

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
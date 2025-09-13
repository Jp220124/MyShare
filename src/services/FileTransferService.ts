// New file transfer service using external hosting
export class FileTransferService {
  // Using file.io - free, no account needed, files auto-delete after 14 days or 1 download
  private static FILE_IO_UPLOAD_URL = 'https://file.io/';
  
  // Alternative: 0x0.st - files up to 512MB, stored for at least 30 days
  private static ZEROX_UPLOAD_URL = 'https://0x0.st';
  
  static async uploadToFileIO(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(this.FILE_IO_UPLOAD_URL, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      return data.link; // Returns the download URL
    } catch (error) {
      console.error('File.io upload failed:', error);
      throw error;
    }
  }
  
  static async uploadTo0x0(file: File): Promise<string> {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch(this.ZEROX_UPLOAD_URL, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const url = await response.text();
      return url.trim(); // Returns the download URL
    } catch (error) {
      console.error('0x0.st upload failed:', error);
      throw error;
    }
  }
  
  // For small files (< 100KB), use data URLs directly
  static async fileToDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
  // Main method - decides which approach to use
  static async shareFile(file: File): Promise<{ method: string; url: string }> {
    // For small files, use data URL
    if (file.size < 100 * 1024) { // 100KB
      const dataUrl = await this.fileToDataURL(file);
      return { method: 'dataurl', url: dataUrl };
    }
    
    // For larger files, try external hosting
    try {
      // Try 0x0.st first (more reliable, larger limit)
      const url = await this.uploadTo0x0(file);
      return { method: '0x0.st', url };
    } catch (error) {
      // Fallback to file.io
      try {
        const url = await this.uploadToFileIO(file);
        return { method: 'file.io', url };
      } catch (error) {
        // Last resort - try data URL even for large files
        console.warn('External upload failed, using data URL');
        const dataUrl = await this.fileToDataURL(file);
        return { method: 'dataurl', url: dataUrl };
      }
    }
  }
}
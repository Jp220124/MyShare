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
        body: formData,
        mode: 'cors'
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const url = await response.text();
      // Ensure HTTPS for better compatibility
      const httpsUrl = url.trim().replace('http://', 'https://');
      return httpsUrl;
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
    // For files up to 500KB, use data URL directly (increased limit)
    // Most browsers can handle data URLs up to several MB
    if (file.size < 500 * 1024) { // 500KB
      const dataUrl = await this.fileToDataURL(file);
      return { method: 'dataurl', url: dataUrl };
    }
    
    // For larger files, still try data URL but warn about size
    // Modern browsers can typically handle data URLs up to 2-5MB
    if (file.size < 2 * 1024 * 1024) { // 2MB
      console.warn(`File size is ${(file.size / 1024 / 1024).toFixed(2)}MB. Using data URL, but performance may be affected.`);
      const dataUrl = await this.fileToDataURL(file);
      return { method: 'dataurl-large', url: dataUrl };
    }
    
    // For very large files, inform user about limitations
    console.error(`File size is ${(file.size / 1024 / 1024).toFixed(2)}MB. This exceeds the recommended limit.`);
    console.log('Consider using R2 service or P2P transfer for large files.');
    
    // Still attempt data URL as last resort
    const dataUrl = await this.fileToDataURL(file);
    return { method: 'dataurl-xlarge', url: dataUrl };
  }
}
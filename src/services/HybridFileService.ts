import { WebRTCService } from './WebRTCService';
import { R2Service } from './R2Service';
import { FileTransferService } from './FileTransferService';

export interface FileTransferResult {
  success: boolean;
  method: 'p2p' | 'r2' | 'external' | 'dataurl';
  url?: string;
  error?: string;
}

export interface FileTransferProgress {
  method: 'p2p' | 'r2' | 'external';
  progress: number;
  status: string;
}

export class HybridFileService {
  private webRTC: WebRTCService | null = null;
  private onProgressCallback?: (progress: FileTransferProgress) => void;

  constructor() {}

  setWebRTCService(webRTC: WebRTCService): void {
    this.webRTC = webRTC;
  }

  onProgress(callback: (progress: FileTransferProgress) => void): void {
    this.onProgressCallback = callback;
  }

  async sendFile(file: File, peerId?: string): Promise<FileTransferResult> {
    console.log(`[Hybrid] Starting file transfer for ${file.name} (${file.size} bytes)`);

    // Strategy 1: Try R2 FIRST if configured (most reliable)
    if (R2Service.isConfigured()) {
      console.log(`[Hybrid] Attempting R2 upload (primary method)`);
      
      try {
        if (this.onProgressCallback) {
          this.onProgressCallback({
            method: 'r2',
            progress: 0,
            status: 'Uploading to cloud...'
          });
        }

        const url = await R2Service.uploadFile(file);
        
        if (this.onProgressCallback) {
          this.onProgressCallback({
            method: 'r2',
            progress: 100,
            status: 'Upload complete'
          });
        }

        console.log(`[Hybrid] R2 upload successful`);
        return {
          success: true,
          method: 'r2',
          url
        };
      } catch (error) {
        console.warn('[Hybrid] R2 upload failed:', error);
      }
    }

    // Strategy 2: Try P2P if peer is connected
    if (peerId && this.webRTC?.isPeerConnected(peerId)) {
      console.log(`[Hybrid] Attempting P2P transfer to ${peerId}`);
      
      try {
        const success = await this.webRTC.sendFileToPeer(
          peerId, 
          file,
          (progress) => {
            if (this.onProgressCallback) {
              this.onProgressCallback({
                method: 'p2p',
                progress,
                status: `Sending via P2P: ${Math.round(progress)}%`
              });
            }
          }
        );

        if (success) {
          console.log(`[Hybrid] P2P transfer successful`);
          return {
            success: true,
            method: 'p2p'
          };
        }
      } catch (error) {
        console.warn('[Hybrid] P2P transfer failed:', error);
      }
    }

    // Strategy 3: Fall back to data URL
    console.log(`[Hybrid] Falling back to data URL`);
    
    try {
      if (this.onProgressCallback) {
        this.onProgressCallback({
          method: 'external',
          progress: 0,
          status: 'Uploading to external service...'
        });
      }

      const result = await FileTransferService.shareFile(file);
      
      if (this.onProgressCallback) {
        this.onProgressCallback({
          method: 'external',
          progress: 100,
          status: `Uploaded via ${result.method}`
        });
      }

      console.log(`[Hybrid] External service upload successful via ${result.method}`);
      return {
        success: true,
        method: result.method === 'dataurl' ? 'dataurl' : 'external',
        url: result.url
      };
    } catch (error) {
      console.error('[Hybrid] All transfer methods failed:', error);
      return {
        success: false,
        method: 'external',
        error: 'All transfer methods failed'
      };
    }
  }

  // Check if P2P is available for a specific peer
  isP2PAvailable(peerId: string): boolean {
    return this.webRTC?.isPeerConnected(peerId) || false;
  }

  // Check if R2 is configured
  isR2Available(): boolean {
    return R2Service.isConfigured();
  }

  // Get transfer method priority for a file
  getRecommendedMethod(file: File, peerId?: string): string {
    // For small files, data URL is fastest
    if (file.size < 500 * 1024) {
      return 'Direct transfer (small file)';
    }

    // Check P2P availability
    if (peerId && this.isP2PAvailable(peerId)) {
      return 'Peer-to-peer (fastest)';
    }

    // Check R2 availability
    if (this.isR2Available() && file.size < 100 * 1024 * 1024) {
      return 'Cloud storage (reliable)';
    }

    // Data URL for medium files
    if (file.size < 2 * 1024 * 1024) {
      return 'Direct transfer (medium file)';
    }

    return 'Direct transfer (large file - may be slow)';
  }
}
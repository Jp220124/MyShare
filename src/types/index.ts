export interface Message {
  id: string;
  type: 'text' | 'file' | 'image' | 'join' | 'leave' | 'offer' | 'answer' | 'ice-candidate';
  sender: string;
  content?: string;
  fileName?: string;
  fileSize?: number;
  fileData?: ArrayBuffer | string;
  timestamp: number;
}

export interface Peer {
  id: string;
  name: string;
  joined: number;
}

export interface Room {
  id: string;
  peers: Peer[];
  created: number;
}
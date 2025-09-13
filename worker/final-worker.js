// Final working WebSocket Worker with proper state management
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': '*',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }
    
    // Only handle WebSocket
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebShare Worker v3 - Active', {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Parse room and peer info
    const pathParts = url.pathname.split('/');
    const roomId = pathParts[2] || 'default';
    const peerId = url.searchParams.get('peerId') || Math.random().toString(36).substring(7);
    
    console.log(`New connection: Room ${roomId}, Peer ${peerId}`);
    
    // Use Durable Object for this room
    const roomDOId = env.ROOMS.idFromName(roomId);
    const roomDO = env.ROOMS.get(roomDOId);
    
    // Forward request to Durable Object
    return roomDO.fetch(request);
  }
};

// Durable Object to manage room state persistently
export class RoomDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
  }

  async fetch(request) {
    const url = new URL(request.url);
    const peerId = url.searchParams.get('peerId');
    
    // Must be WebSocket
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 400 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    // Accept and handle
    this.handleSession(server, peerId);
    
    // Return client
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  handleSession(ws, peerId) {
    ws.accept();
    
    // Create session
    const session = {
      ws,
      peerId,
      joined: Date.now(),
      quit: false
    };
    
    this.sessions.push(session);
    console.log(`Session added. Total: ${this.sessions.length}`);
    
    // Send welcome
    ws.send(JSON.stringify({
      type: 'welcome',
      message: 'Connected to room',
      peerId,
      roomSize: this.sessions.length
    }));
    
    // Send peer list to all
    this.broadcastPeerList();
    
    // Notify others
    this.broadcast({
      type: 'peer-joined',
      peerId,
      timestamp: Date.now()
    }, peerId);
    
    // Handle messages
    ws.addEventListener('message', event => {
      if (session.quit) return;
      
      try {
        const data = JSON.parse(event.data);
        console.log(`Message from ${peerId}: ${data.type}`);
        
        switch (data.type) {
          case 'message':
            // Broadcast to others
            this.broadcast({
              type: 'message',
              message: { ...data.message, sender: peerId }
            }, peerId);
            break;
            
          case 'file-start':
          case 'file-chunk':
          case 'file-end':
            // Broadcast file data
            this.broadcast({
              ...data,
              sender: peerId
            }, peerId);
            break;
            
          case 'get-peers':
          case 'join':
            // Send peer list
            this.sendPeerList(ws, peerId);
            break;
            
          default:
            console.log('Unknown type:', data.type);
        }
      } catch (error) {
        console.error('Message error:', error);
      }
    });
    
    // Handle close
    ws.addEventListener('close', () => {
      session.quit = true;
      this.sessions = this.sessions.filter(s => s !== session);
      console.log(`Session removed. Total: ${this.sessions.length}`);
      
      // Notify others
      this.broadcast({
        type: 'peer-left',
        peerId,
        timestamp: Date.now()
      });
      
      // Update peer lists
      this.broadcastPeerList();
    });
    
    // Handle errors
    ws.addEventListener('error', err => {
      console.error('WebSocket error:', err);
      session.quit = true;
    });
  }

  broadcast(message, excludePeerId = null) {
    const msg = JSON.stringify(message);
    this.sessions.forEach(session => {
      if (!session.quit && session.peerId !== excludePeerId) {
        try {
          session.ws.send(msg);
        } catch (err) {
          console.error('Broadcast error:', err);
        }
      }
    });
  }

  sendPeerList(ws, currentPeerId) {
    const peers = this.sessions
      .filter(s => !s.quit && s.peerId !== currentPeerId)
      .map(s => ({
        id: s.peerId,
        name: `Device ${s.peerId.substring(0, 6)}`,
        joined: s.joined
      }));
    
    ws.send(JSON.stringify({
      type: 'peers',
      peers
    }));
  }

  broadcastPeerList() {
    this.sessions.forEach(session => {
      if (!session.quit) {
        this.sendPeerList(session.ws, session.peerId);
      }
    });
  }
}
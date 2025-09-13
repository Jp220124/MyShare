// Cloudflare Worker for WebSocket handling
// Deploy this as a separate Worker and update the WebSocket URL in your app

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    
    // Handle WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader === 'websocket') {
      return handleWebSocket(request, env);
    }
    
    // Basic HTTP response for non-WebSocket requests
    return new Response('WebShare WebSocket Server - Ready', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    });
  },
};

function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleWebSocket(request, env) {
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected websocket', { status: 400 });
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const roomId = pathParts[2]; // /room/{roomId}
  const peerId = url.searchParams.get('peerId');

  if (!roomId || !peerId) {
    return new Response('Room ID and Peer ID required', { status: 400 });
  }

  // Create WebSocket pair
  const [client, server] = Object.values(new WebSocketPair());

  // Accept the WebSocket connection
  server.accept();

  // Get or create room in Durable Object
  const roomDurableObjectId = env.ROOM.idFromName(roomId);
  const roomDurableObject = env.ROOM.get(roomDurableObjectId);

  // Forward the WebSocket to the Durable Object
  const response = await roomDurableObject.fetch(request.url, {
    method: 'GET',
    headers: {
      'Upgrade': 'websocket',
      'X-Peer-Id': peerId,
      'X-Room-Id': roomId,
    },
    webSocket: server,
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
}

// Durable Object for managing room state
export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.messages = [];
  }

  async fetch(request) {
    const url = new URL(request.url);
    const peerId = request.headers.get('X-Peer-Id');
    const roomId = request.headers.get('X-Room-Id');

    // Handle WebSocket connection
    if (request.headers.get('Upgrade') === 'websocket') {
      const webSocket = request.webSocket;
      if (!webSocket) {
        return new Response('WebSocket expected', { status: 400 });
      }

      // Accept the WebSocket
      webSocket.accept();

      // Create session
      const session = {
        webSocket,
        peerId,
        roomId,
        joined: Date.now(),
      };

      // Store session
      this.sessions.set(peerId, session);

      // Send current peers list to new client
      this.sendPeersList(peerId);

      // Notify others about new peer
      this.broadcast({
        type: 'peer-joined',
        peerId,
        timestamp: Date.now(),
      }, peerId);

      // Handle messages
      webSocket.addEventListener('message', async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleMessage(data, peerId);
        } catch (error) {
          console.error('Error handling message:', error);
        }
      });

      // Handle close
      webSocket.addEventListener('close', () => {
        this.sessions.delete(peerId);
        this.broadcast({
          type: 'peer-left',
          peerId,
          timestamp: Date.now(),
        });
        this.sendPeersListToAll();
      });

      return new Response(null, { status: 101 });
    }

    return new Response('Not found', { status: 404 });
  }

  async handleMessage(data, senderId) {
    switch (data.type) {
      case 'message':
        // Broadcast message to all peers except sender
        this.broadcast({
          type: 'message',
          message: { ...data.message, sender: senderId },
        }, senderId);
        
        // Store message (limit to last 100)
        this.messages.push(data.message);
        if (this.messages.length > 100) {
          this.messages.shift();
        }
        break;

      case 'file-start':
      case 'file-chunk':
      case 'file-end':
        // Broadcast file chunks to all peers except sender
        this.broadcast({
          ...data,
          sender: senderId,
        }, senderId);
        break;

      case 'offer':
      case 'answer':
      case 'ice-candidate':
        // WebRTC signaling - forward to specific peer
        const targetSession = this.sessions.get(data.to);
        if (targetSession) {
          targetSession.webSocket.send(JSON.stringify({
            ...data,
            from: senderId,
          }));
        }
        break;

      case 'join':
        // Already handled in connection setup
        break;
        
      case 'get-peers':
        // Send current peers list
        this.sendPeersList(senderId);
        break;

      default:
        console.log('Unknown message type:', data.type);
    }
  }

  sendPeersList(excludePeerId) {
    const peers = Array.from(this.sessions.entries())
      .filter(([id]) => id !== excludePeerId)
      .map(([id, session]) => ({
        id,
        name: `Device ${id.substring(0, 6)}`,
        joined: session.joined,
      }));

    const targetSession = this.sessions.get(excludePeerId);
    if (targetSession) {
      targetSession.webSocket.send(JSON.stringify({
        type: 'peers',
        peers,
      }));
    }
  }

  sendPeersListToAll() {
    this.sessions.forEach((session, peerId) => {
      this.sendPeersList(peerId);
    });
  }

  broadcast(message, excludePeerId) {
    const messageStr = JSON.stringify(message);
    this.sessions.forEach((session, peerId) => {
      if (peerId !== excludePeerId) {
        try {
          session.webSocket.send(messageStr);
        } catch (error) {
          console.error(`Failed to send to ${peerId}:`, error);
        }
      }
    });
  }
}
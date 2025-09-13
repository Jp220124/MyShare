// Working WebSocket Worker with room management

// Store active rooms in memory (resets on worker restart)
const rooms = new Map();

export default {
  async fetch(request) {
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
    
    // Handle WebSocket upgrade
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebShare Worker - Active', {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Get room and peer info
    const pathParts = url.pathname.split('/');
    const roomId = pathParts[2] || 'default';
    const peerId = url.searchParams.get('peerId') || Math.random().toString(36).substring(7);
    
    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    // Handle the connection
    handleWebSocket(server, roomId, peerId);
    
    // Return client
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
};

function handleWebSocket(ws, roomId, peerId) {
  // Accept connection
  ws.accept();
  
  // Get or create room
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  const room = rooms.get(roomId);
  
  // Add peer to room
  const peer = {
    id: peerId,
    name: `Device ${peerId.substring(0, 6)}`,
    joined: Date.now(),
    ws: ws
  };
  room.set(peerId, peer);
  
  console.log(`Peer ${peerId} joined room ${roomId}. Room size: ${room.size}`);
  
  // Send welcome and current peers
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected successfully',
    roomId,
    peerId
  }));
  
  // Send updated peer list to all
  broadcastPeerList(roomId);
  
  // Notify others about new peer
  broadcast(roomId, {
    type: 'peer-joined',
    peerId,
    timestamp: Date.now()
  }, peerId);
  
  // Handle messages
  ws.addEventListener('message', event => {
    try {
      const data = JSON.parse(event.data);
      console.log(`Message from ${peerId}:`, data.type);
      
      switch (data.type) {
        case 'message':
          // Broadcast message to others
          broadcast(roomId, {
            type: 'message',
            message: { ...data.message, sender: peerId }
          }, peerId);
          break;
          
        case 'file-start':
        case 'file-chunk':
        case 'file-end':
          // Broadcast file chunks
          broadcast(roomId, {
            ...data,
            sender: peerId
          }, peerId);
          break;
          
        case 'offer':
        case 'answer':
        case 'ice-candidate':
          // WebRTC signaling - send to specific peer
          const targetPeer = room.get(data.to);
          if (targetPeer) {
            targetPeer.ws.send(JSON.stringify({
              ...data,
              from: peerId
            }));
          }
          break;
          
        case 'get-peers':
        case 'join':
          // Send current peer list
          sendPeerList(ws, roomId, peerId);
          break;
          
        default:
          console.log('Unknown message type:', data.type);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.toString()
      }));
    }
  });
  
  // Handle disconnect
  ws.addEventListener('close', () => {
    console.log(`Peer ${peerId} left room ${roomId}`);
    
    // Remove from room
    room.delete(peerId);
    
    // Clean up empty room
    if (room.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      // Notify others
      broadcast(roomId, {
        type: 'peer-left',
        peerId,
        timestamp: Date.now()
      });
      
      // Send updated peer list
      broadcastPeerList(roomId);
    }
  });
}

function broadcast(roomId, message, excludePeerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const messageStr = JSON.stringify(message);
  room.forEach((peer, id) => {
    if (id !== excludePeerId && peer.ws.readyState === 1) {
      try {
        peer.ws.send(messageStr);
      } catch (error) {
        console.error(`Failed to send to ${id}:`, error);
      }
    }
  });
}

function sendPeerList(ws, roomId, currentPeerId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const peers = Array.from(room.entries())
    .filter(([id]) => id !== currentPeerId)
    .map(([id, peer]) => ({
      id: peer.id,
      name: peer.name,
      joined: peer.joined
    }));
  
  ws.send(JSON.stringify({
    type: 'peers',
    peers
  }));
}

function broadcastPeerList(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.forEach((peer, id) => {
    sendPeerList(peer.ws, roomId, id);
  });
}
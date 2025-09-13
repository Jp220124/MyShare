// Simplified WebSocket Worker for debugging

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }
    
    // Handle WebSocket
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      
      // Get room and peer info
      const pathParts = url.pathname.split('/');
      const roomId = pathParts[2] || 'default';
      const peerId = url.searchParams.get('peerId') || 'anonymous';
      
      console.log(`New connection: Room ${roomId}, Peer ${peerId}`);
      
      // Accept WebSocket
      server.accept();
      
      // Simple message handling
      server.addEventListener('message', async (event) => {
        console.log('Message received:', event.data);
        
        try {
          const data = JSON.parse(event.data);
          
          // Echo back with confirmation
          server.send(JSON.stringify({
            type: 'echo',
            original: data,
            timestamp: Date.now(),
            roomId,
            peerId,
          }));
          
          // Send peer list
          if (data.type === 'join' || data.type === 'get-peers') {
            server.send(JSON.stringify({
              type: 'peers',
              peers: [],
              message: 'Simple worker - no peer tracking yet'
            }));
          }
        } catch (error) {
          console.error('Error processing message:', error);
          server.send(JSON.stringify({
            type: 'error',
            message: error.toString()
          }));
        }
      });
      
      server.addEventListener('close', () => {
        console.log(`Connection closed: Room ${roomId}, Peer ${peerId}`);
      });
      
      // Send welcome message
      server.send(JSON.stringify({
        type: 'welcome',
        message: 'Connected to simple worker',
        roomId,
        peerId,
      }));
      
      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
    
    // Regular HTTP response
    return new Response('Simple WebSocket Worker - Working!', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/plain',
      },
    });
  },
};
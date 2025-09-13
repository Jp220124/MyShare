// Ultra-minimal WebSocket worker for testing
export default {
  async fetch(request) {
    // Only handle WebSocket upgrades
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket server running');
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    
    // Handle the server side
    handleWebSocket(server);
    
    // Return client for the connection
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
};

function handleWebSocket(ws) {
  // Accept the WebSocket
  ws.accept();
  
  // Send immediate welcome
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to minimal worker!',
    timestamp: Date.now()
  }));
  
  // Echo everything back
  ws.addEventListener('message', event => {
    console.log('Received:', event.data);
    
    try {
      const data = JSON.parse(event.data);
      
      // Always send back peers list
      ws.send(JSON.stringify({
        type: 'peers',
        peers: [{
          id: 'test-peer',
          name: 'Test Device',
          joined: Date.now()
        }]
      }));
      
      // Echo the message
      ws.send(JSON.stringify({
        type: 'echo',
        original: data,
        timestamp: Date.now()
      }));
      
    } catch (e) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON'
      }));
    }
  });
  
  ws.addEventListener('close', () => {
    console.log('WebSocket closed');
  });
}
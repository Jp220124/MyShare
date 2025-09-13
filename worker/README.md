# WebShare Worker

This is the Cloudflare Worker that handles WebSocket connections for the WebShare application.

## Setup

1. Install Wrangler CLI:
```bash
npm install -g wrangler
```

2. Login to Cloudflare:
```bash
wrangler login
```

3. Install dependencies:
```bash
npm install
```

## Development

Run the worker locally:
```bash
npm run dev
```

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

After deployment, update the `VITE_WS_URL` in your main app's `.env` file with the deployed worker URL.

## Features

- WebSocket connection management
- Room-based messaging
- Peer discovery
- WebRTC signaling
- Message broadcasting
- Durable Objects for persistent room state
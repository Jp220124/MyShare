# Quick R2 Deployment Guide

## 1. Prerequisites
- Cloudflare account (free)
- Node.js installed

## 2. Quick Setup (5 minutes)

### Step 1: Install Wrangler
```bash
npm install -g wrangler
```

### Step 2: Login to Cloudflare
```bash
wrangler login
```

### Step 3: Create R2 Bucket
```bash
# In cloudflare-worker directory
cd cloudflare-worker
wrangler r2 bucket create webshare-files
```

### Step 4: Deploy Worker
```bash
# Deploy using the simple config
wrangler deploy -c wrangler-simple.toml
```

### Step 5: Get Your Worker URL
After deployment, you'll see:
```
Published webshare-r2 
https://webshare-r2.YOUR-SUBDOMAIN.workers.dev
```

### Step 6: Update .env File
1. Copy the worker URL from above
2. Open `.env` file in the web-share folder
3. Replace the URL with your actual worker URL:
```
VITE_R2_WORKER_URL=https://webshare-r2.YOUR-SUBDOMAIN.workers.dev
```

### Step 7: Restart Dev Server
```bash
# Stop current server (Ctrl+C)
# Start again
npm run dev
```

## That's it! R2 is now configured.

## How It Works
- Files upload to Cloudflare R2 (100GB free storage)
- Download links work from any device
- No CORS issues
- Files auto-delete after 24 hours (optional)

## Testing
1. Share a file from one device
2. Check console for "[R2] File uploaded successfully"
3. Receiving device gets a direct download link
4. Click download - it works!

## Troubleshooting
- If upload fails, check the worker URL in .env
- Make sure the bucket name is exactly "webshare-files"
- Check Cloudflare dashboard for worker logs
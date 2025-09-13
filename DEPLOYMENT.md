# WebShare Deployment Guide

This guide will help you deploy your WebShare application to Cloudflare Pages for free.

## Prerequisites

- A Cloudflare account (free at [cloudflare.com](https://cloudflare.com))
- Node.js 16+ installed locally
- Git installed (optional, for Git-based deployment)

## Step-by-Step Deployment

### Step 1: Deploy the WebSocket Worker

The WebSocket Worker handles real-time communication between devices.

1. **Navigate to the worker directory:**
```bash
cd worker
```

2. **Install Wrangler CLI:**
```bash
npm install -g wrangler
```

3. **Login to Cloudflare:**
```bash
wrangler login
```
This will open your browser to authenticate with Cloudflare.

4. **Install worker dependencies:**
```bash
npm install
```

5. **Deploy the worker:**
```bash
npm run deploy
```

6. **Save your Worker URL:**
After deployment, you'll see a URL like:
```
https://webshare-worker.YOUR-SUBDOMAIN.workers.dev
```
Save this URL - you'll need it in the next step.

### Step 2: Configure the Main Application

1. **Go back to the main project directory:**
```bash
cd ..
```

2. **Update the environment variable:**
Edit the `.env` file and replace the placeholder with your actual Worker URL:
```
VITE_WS_URL=wss://webshare-worker.YOUR-SUBDOMAIN.workers.dev
```
Note: Use `wss://` (not `https://`) for WebSocket connections.

### Step 3: Build the Application

1. **Install dependencies (if not already done):**
```bash
npm install
```

2. **Build the production version:**
```bash
npm run build
```
This creates a `dist` folder with your production-ready files.

### Step 4: Deploy to Cloudflare Pages

You have two options:

#### Option A: Direct Upload (Quickest)

1. Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com/pages)
2. Click "Create a project"
3. Select "Direct Upload"
4. Name your project (e.g., "webshare")
5. Drag and drop the `dist` folder or click to browse and select it
6. Click "Deploy site"
7. Your site will be live at `https://webshare.pages.dev` (or similar)

#### Option B: Git Integration (For Continuous Deployment)

1. **Create a GitHub repository:**
   - Go to [GitHub](https://github.com) and create a new repository
   - Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

2. **Connect to Cloudflare Pages:**
   - Go to [Cloudflare Pages Dashboard](https://dash.cloudflare.com/pages)
   - Click "Create a project"
   - Select "Connect to Git"
   - Authorize GitHub and select your repository
   
3. **Configure build settings:**
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   
4. **Add environment variables:**
   - Click "Environment variables"
   - Add variable:
     - Name: `VITE_WS_URL`
     - Value: `wss://webshare-worker.YOUR-SUBDOMAIN.workers.dev`
   
5. **Deploy:**
   - Click "Save and Deploy"
   - Future pushes to GitHub will auto-deploy

## Testing Your Deployment

1. **Open your deployed site** (e.g., `https://webshare.pages.dev`)
2. **Create a new room** by clicking "Create New Room"
3. **Open the same URL on another device** (phone, tablet, or another computer)
4. **Join the room** using the room code or QR code
5. **Try sharing** a file or text between devices

## Troubleshooting

### Worker Not Responding
- Check the Worker logs in Cloudflare Dashboard
- Ensure the Worker URL in `.env` uses `wss://` protocol
- Verify Durable Objects are enabled in your Cloudflare account

### Build Fails on Cloudflare Pages
- Ensure Node.js version is compatible (set in environment variables if needed)
- Check build logs for specific errors
- Try building locally first with `npm run build`

### Connection Issues
- Check browser console for errors (F12)
- Ensure WebSockets aren't blocked by firewall
- Try using a different network

### File Sharing Not Working
- Check file size (limit is 100MB)
- Ensure both devices have stable internet
- Try smaller files first for testing

## Custom Domain (Optional)

To use your own domain:

1. Go to your Cloudflare Pages project
2. Click "Custom domains"
3. Add your domain
4. Follow DNS configuration instructions
5. Wait for SSL certificate (usually automatic)

## Monitoring & Analytics

- **Worker Analytics**: Check request count and errors in Workers dashboard
- **Pages Analytics**: View visitor stats in Pages dashboard
- **Real User Monitoring**: Enable Web Analytics in Cloudflare

## Cost

This entire setup is **FREE** on Cloudflare's free tier:
- Workers: 100,000 requests/day
- Durable Objects: 10 million requests/month
- Pages: Unlimited requests
- Bandwidth: Unlimited

## Support

If you encounter issues:
1. Check browser console for errors
2. Review Worker logs in Cloudflare dashboard
3. Ensure all environment variables are set correctly
4. Try deploying a fresh build

## Next Steps

After successful deployment:
- Share your app URL with friends and family
- Consider adding a custom domain
- Monitor usage in Cloudflare dashboard
- Customize the UI to your preference

Congratulations! Your WebShare app is now live and accessible worldwide! 🎉
# Cloudflare R2 Deployment Guide

This guide will help you set up Cloudflare R2 for the hybrid file sharing approach.

## Prerequisites

- Cloudflare account (free tier works)
- Node.js installed
- Wrangler CLI (`npm install -g wrangler`)

## Step 1: Create R2 Bucket

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to R2 in the sidebar
3. Click "Create bucket"
4. Name it `webshare-files`
5. Keep default settings and create

## Step 2: Create KV Namespace

1. In Cloudflare Dashboard, go to Workers & Pages > KV
2. Click "Create namespace"
3. Name it `webshare-file-metadata`
4. Note down the namespace ID

## Step 3: Update Worker Configuration

1. Edit `wrangler.toml`:
   - Replace `your-kv-namespace-id` with your actual KV namespace ID
   - Optionally update the worker name

## Step 4: Deploy the Worker

```bash
cd cloudflare-worker
npx wrangler login
npx wrangler deploy
```

## Step 5: Configure the App

1. Copy `.env.example` to `.env`
2. Update `VITE_R2_WORKER_URL` with your deployed worker URL

## How It Works

### File Upload Flow:
1. App requests presigned URL from worker
2. Worker generates temporary upload URL (1 hour expiry)
3. App uploads file directly to R2
4. Worker stores metadata in KV with 24-hour TTL

### File Download Flow:
1. App shares download URL with peers
2. When accessed, worker checks if file exists and hasn't expired
3. Worker serves file from R2 or returns error if expired

### Auto-Cleanup:
- KV entries auto-expire after 24 hours
- Daily cron job (2 AM UTC) cleans up expired files from R2
- Files are automatically deleted after expiry

## Cost Considerations

### Free Tier Limits:
- R2: 10GB storage, 10 million requests/month
- KV: 100,000 reads/day, 1,000 writes/day
- Workers: 100,000 requests/day

### For Production:
- Consider implementing rate limiting
- Add authentication if needed
- Monitor usage through Cloudflare Analytics

## Troubleshooting

### Worker Not Deploying:
- Ensure you're logged in: `npx wrangler login`
- Check wrangler.toml syntax
- Verify KV namespace ID is correct

### Files Not Uploading:
- Check CORS settings in worker
- Verify R2 bucket name matches
- Check browser console for errors

### Files Expiring Too Early:
- Adjust `FILE_EXPIRY_HOURS` in wrangler.toml
- Modify cron schedule if needed

## Security Notes

- Files are publicly accessible via the download URL
- Consider adding authentication for sensitive files
- URLs are unguessable (random IDs) but not encrypted
- Files auto-delete after 24 hours for privacy
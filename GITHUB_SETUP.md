# GitHub + Cloudflare Pages Setup Guide

## Step 1: Create GitHub Repository

1. Open this link: https://github.com/new
2. Fill in:
   - Repository name: `webshare`
   - Description: "Instant file sharing between devices"
   - Public or Private: Your choice
   - **DON'T check any boxes** (no README, no .gitignore, no license)
3. Click **"Create repository"**

## Step 2: Push Your Code

After creating the repository, run this command in your terminal:

```bash
cd web-share
git push -u origin main
```

If you get an authentication error, you may need to:
1. Use a Personal Access Token instead of password
2. Or push via GitHub Desktop

## Step 3: Connect to Cloudflare Pages

1. Go to: https://pages.cloudflare.com/
2. Click **"Create a project"**
3. Click **"Connect to Git"**
4. **Authorize GitHub** if prompted
5. **Select your repository**: `webshare`
6. Configure:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `dist`
7. Add Environment Variable:
   - Name: `VITE_WS_URL`
   - Value: `wss://webshare-worker.priyanshukumarmaurya786.workers.dev`
8. Click **"Save and Deploy"**

## Benefits

✅ **Automatic Deployment**: Every `git push` triggers a new deployment  
✅ **Version Control**: Keep track of all changes  
✅ **Rollback**: Revert to any previous version  
✅ **Preview URLs**: Test changes before going live  

## For Future Updates

Whenever you make changes:

```bash
git add .
git commit -m "Description of changes"
git push
```

Cloudflare will automatically rebuild and deploy in 2-3 minutes!

## Troubleshooting

### Authentication Issues
If GitHub asks for a password, you need a Personal Access Token:
1. Go to: https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo`
4. Use the token as your password

### Alternative: GitHub Desktop
1. Download: https://desktop.github.com/
2. Sign in to your account
3. Add existing repository
4. Push changes with one click
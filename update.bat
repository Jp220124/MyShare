@echo off
echo Pushing updates to GitHub...
git add .
git commit -m "Update WebShare app"
git push
echo Done! Cloudflare Pages will auto-deploy in 2-3 minutes.
pause
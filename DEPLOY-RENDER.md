# Deploy to Render (Free, No Credit Card)

## Step 1: Create a GitHub Repository

1. Go to https://github.com/new
2. Name it `pokemon-showdown-pinkacord` (or anything)
3. Keep it **Private** (your admin password will be in env vars)
4. Don't initialize with README
5. Click "Create repository"

## Step 2: Push Your Code

```bash
cd /c/pokemon-showdown-pinkacord

# Add your GitHub repo as origin
git remote add origin https://github.com/YOUR-USERNAME/pokemon-showdown-pinkacord.git

# Add all Pinkacord files
git add render.yaml Dockerfile .dockerignore .env.example DEPLOY-RENDER.md
git add tools/pinkacord-admin/ tools/pinkacord/ tools/pinkacord-client/
git add content/ data/mods/pinkacord/ data/random-battles/pinkacord/
git add config/config.js config/formats.ts
git add ADMIN.pinkacord.md ARCHITECTURE.pinkacord.md CLIENT.pinkacord.md
git add EDGE-CASES.pinkacord.md HOSTING.pinkacord.md
git add server/static/index.html server/sockets.ts
git add tools/launcher.js
git add package.json package-lock.json
git add client/

# Commit
git commit -m "Pinkacord setup: admin panel, custom formats, Render deployment"

# Push
git push -u origin main
```

## Step 3: Deploy on Render

1. Go to https://render.com and sign up with GitHub (free, no credit card)
2. Click **New** → **Blueprint**
3. Connect your GitHub repo
4. Render detects `render.yaml` automatically
5. Enter your admin password when prompted
6. Click **Apply**

Build takes 5-10 minutes first time.

## Step 4: Your URL

After deploy, Render gives you:
- **Game**: `https://pokemon-showdown-pinkacord.onrender.com`

That's it! Users open that URL in their browser to play.

## Step 5: Keep It Alive (UptimeRobot)

Render free tier sleeps after 15 min without traffic. Fix:

1. Go to https://uptimerobot.com (free, no credit card)
2. Sign up, click **Add New Monitor**
3. Set:
   - Type: HTTP(s)
   - URL: `https://pokemon-showdown-pinkacord.onrender.com/health`
   - Interval: 5 minutes
4. Save

This pings every 5 min to keep the server alive 24/7.

## Step 6: Admin Panel

The admin panel runs internally on the server but isn't accessible externally on Render free tier.

**How to manage content:**
1. Run the admin panel locally: `npm run pinkacord-admin`
2. Open http://localhost:8001
3. Create/edit formats, Pokemon, abilities, etc.
4. Push changes to GitHub
5. Render auto-redeploys

**For live tournaments:** Run the full stack locally:
```bash
npm run start:all
```
This gives you both the game server and admin panel on your PC.

## Important Notes

### Free Tier Limits
- 750 hours/month (one 24/7 service = ~744 hours — just enough)
- Spins down after 15 min inactivity (UptimeRobot fixes this)
- No persistent disk (changes via admin panel are lost on restart)
- Content is baked into the Docker image at build time

### How Updates Work
1. Make changes in admin panel locally
2. `git add . && git commit -m "update" && git push`
3. Render auto-redeploys (if autodeploy is on)

### WebSocket Support
Render free tier supports WebSockets. Players can battle in real-time.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Build fails | Check Render logs, make sure all files are committed |
| Server sleeps | UptimeRobot should ping /health every 5 min |
| Can't connect | Use `https://` not `http://`, no port number |
| Admin panel not accessible | Run locally: `npm run pinkacord-admin` |
| Changes lost after restart | Content is baked in at build time — push to GitHub to persist |

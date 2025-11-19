# Deployment Guide

## Pre-Deployment Checklist

### ✅ Security & Configuration

1. **Set a strong SESSION_SECRET**
   - Generate a random string: `openssl rand -base64 32`
   - Set as environment variable: `SESSION_SECRET`
   - **CRITICAL**: Never commit this to git!

2. **Environment Variables**
   - `SESSION_SECRET` - Required for production
   - `OPENAI_API_KEY` - Optional (for better AI analysis)
   - `PORT` - Usually set automatically by hosting platform
   - `NODE_ENV` - Set to `production` on hosting platform

3. **Database**
   - SQLite database (`ama.db`) will be created automatically
   - Make sure your hosting platform supports file-based databases
   - Consider migrating to PostgreSQL for production scale

### ✅ Code Review

- [ ] All sensitive data is in environment variables
- [ ] No hardcoded secrets or API keys
- [ ] `.gitignore` includes `.env`, `ama.db`, `node_modules`
- [ ] Database migrations are handled automatically (already done)

### ✅ Testing

- [ ] Test registration/login flow
- [ ] Test submission creation
- [ ] Test AI analysis (with and without OpenAI API key)
- [ ] Test viewing submissions

## Deployment Options

### Option 1: Railway (Recommended - Easy & Free Tier Available)

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Deploy on Railway**
   - Go to https://railway.app
   - Sign up/login with GitHub
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repository
   - Add environment variables:
     - `SESSION_SECRET` (generate with: `openssl rand -base64 32`)
     - `OPENAI_API_KEY` (optional)
     - `NODE_ENV=production`
   - Railway will auto-detect Node.js and deploy
   - Your app will be live at `https://your-app-name.railway.app`

### Option 2: Render

1. **Push to GitHub** (same as above)

2. **Deploy on Render**
   - Go to https://render.com
   - Sign up/login with GitHub
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Settings:
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Environment**: Node
   - Add environment variables:
     - `SESSION_SECRET`
     - `OPENAI_API_KEY` (optional)
     - `NODE_ENV=production`
   - Click "Create Web Service"
   - Your app will be live at `https://your-app-name.onrender.com`

### Option 3: Heroku

1. **Install Heroku CLI** (if not installed)
   ```bash
   # macOS
   brew tap heroku/brew && brew install heroku
   ```

2. **Create Procfile**
   ```bash
   echo "web: node server.js" > Procfile
   ```

3. **Login and Deploy**
   ```bash
   heroku login
   heroku create your-app-name
   heroku config:set SESSION_SECRET=$(openssl rand -base64 32)
   heroku config:set NODE_ENV=production
   # Optional: heroku config:set OPENAI_API_KEY=your_key
   git push heroku main
   ```

### Option 4: Fly.io

1. **Install Fly CLI**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Initialize Fly**
   ```bash
   fly launch
   ```

3. **Set Environment Variables**
   ```bash
   fly secrets set SESSION_SECRET=$(openssl rand -base64 32)
   fly secrets set NODE_ENV=production
   # Optional: fly secrets set OPENAI_API_KEY=your_key
   ```

## Post-Deployment

1. **Test your live site**
   - Visit your deployed URL
   - Test registration
   - Test submission creation
   - Verify AI analysis works

2. **Monitor logs**
   - Check for any errors in platform logs
   - Verify database is being created correctly

3. **Set up custom domain** (optional)
   - Most platforms allow custom domains
   - Update DNS settings as per platform instructions

## Important Notes

- **Database Persistence**: SQLite files persist on most platforms, but check your platform's file system persistence policy
- **Scaling**: For production with many users, consider migrating to PostgreSQL
- **HTTPS**: All modern platforms provide HTTPS automatically
- **Session Cookies**: Already configured to work with HTTPS in production

## Troubleshooting

- **Database errors**: Ensure the platform supports file-based databases
- **Port issues**: Most platforms set PORT automatically - don't hardcode it
- **Session issues**: Make sure SESSION_SECRET is set and is a strong random string
- **Build errors**: Check Node.js version compatibility (app uses Node 14+)


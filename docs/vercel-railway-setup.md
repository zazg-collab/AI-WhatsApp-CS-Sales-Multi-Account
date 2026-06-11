# Vercel + Railway Deployment Guide

This guide walks you through deploying **Hermes AI Sales & Customer Service Control Center** to production using **Vercel** (for Next.js web frontend) and **Railway** (for NestJS API backend + databases).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Step 1: Create Railway Project & Databases](#step-1-create-railway-project--databases)
5. [Step 2: Deploy NestJS API to Railway](#step-2-deploy-nestjs-api-to-railway)
6. [Step 3: Deploy Next.js Web to Vercel](#step-3-deploy-nextjs-web-to-vercel)
7. [Step 4: Post-Deployment Configuration](#step-4-post-deployment-configuration)
8. [Step 5: Custom Domain Setup (Optional)](#step-5-custom-domain-setup-optional)
9. [Monitoring & Logs](#monitoring--logs)
10. [Troubleshooting](#troubleshooting)
11. [Costs & Scaling](#costs--scaling)

---

## Overview

### Why This Stack?

| Component | Service | Why |
|-----------|---------|-----|
| **Next.js Web UI** | Vercel | Built by the creators; auto-scaling, CDN, edge functions. Free tier includes 100GB/month bandwidth. |
| **NestJS API** | Railway | Persistent long-running containers; cheap managed databases; better for background jobs (BullMQ queues). |
| **PostgreSQL** | Railway | Managed database with automatic backups; direct Prisma connection. |
| **Redis** | Railway | Managed Redis for queues, sessions, and caching. |

### High-Level Flow

```
[Customer WhatsApp]
    ↓ (via Baileys)
[Railway: NestJS API] ← [PostgreSQL + Redis (Railway)]
    ↑
[Vercel: Next.js Web] ← [Admin Dashboard]
    ↓
[Customer]
```

- **Vercel** serves the web frontend; every request to `/api/v1/*` proxies to Railway's API URL.
- **Railway** runs the backend, databases, and BullMQ job queues.
- **Session persistence** for WhatsApp accounts is stored in Postgres + filesystem (Railway `/tmp` is ephemeral; use persistent volumes or Postgres).

---

## Prerequisites

Before starting, ensure you have:

- **Node.js 20+** installed locally
- **GitHub account** (for Vercel/Railway authentication and code deployment)
- **Vercel account** (free; sign up at [vercel.com](https://vercel.com))
- **Railway account** (free $5/month credit; sign up at [railway.app](https://railway.app))
- **Repository** pushed to GitHub (`public` or `private`)
- **Custom domain** (optional; `.vercel.app` and `railway.app` subdomains work for testing)
- **OpenAI-compatible AI endpoint** configured (e.g., Nous Portal, OpenAI, OpenRouter)

### Local Verification

Ensure the app builds locally:

```bash
npm ci
npm run db:generate
npm run build
```

If this passes, the deployment will work.

---

## Architecture

### Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                      Vercel (Edge/CDN)                      │
│                    apps/web (Next.js)                       │
│  - Static + SSR rendering                                   │
│  - NEXT_PUBLIC_API_URL → https://api.railway.app/api/v1    │
└─────────────────────────────────────────────────────────────┘
         ↓
┌─────────────────────────────────────────────────────────────┐
│                    Railway (Containers)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ NestJS API (apps/api)                                │   │
│  │ - Port 3001                                          │   │
│  │ - BullMQ job processing                             │   │
│  │ - Baileys WhatsApp gateway                          │   │
│  │ - Hermes supervisor logic                           │   │
│  └──────────────────────────────────────────────────────┘   │
│         ↓             ↓                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgreSQL        │  Redis                          │   │
│  │  (Hermes data)     │  (Queue + cache)                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Step 1: Create Railway Project & Databases

### 1.1 Sign Up & Create Project

1. Go to [railway.app](https://railway.app) and sign in with GitHub.
2. Click **"Create a New Project"**.
3. Choose **"Empty Project"** (we'll add services manually for clarity).
4. Name it: `hermes-prod` (or your preferred name).

### 1.2 Add PostgreSQL Plugin

1. In your Railway project, click **"Add Service"** → **"Database"** → **"PostgreSQL"**.
2. Railway will spin up a Postgres instance.
3. Once ready, click on the **PostgreSQL service** to view details.
4. Click the **"Variables"** tab.
5. Copy the **`DATABASE_URL`** variable (looks like `postgresql://user:pass@host:port/db?sslmode=require`).
6. **Save this value** — you'll paste it into the API environment variables later.

### 1.3 Add Redis Plugin

1. Click **"Add Service"** → **"Database"** → **"Redis"**.
2. Once ready, click on the **Redis service** and go to **"Variables"** tab.
3. Copy the **`REDIS_URL`** variable (looks like `redis://:password@host:port`).
4. **Save this value** — you'll need it next.

### 1.4 (Optional) Add Persistent Volume for WhatsApp Sessions

By default, Railway containers have ephemeral `/tmp` storage. If you redeploy, WhatsApp sessions are lost, requiring QR re-login. To avoid this:

1. In your Railway project, click **"Add Service"** → **"Plugin"** → **"PostgreSQL"** (or use an existing one).
2. Alternatively, configure `WA_SESSION_DIR` to use a Postgres table (advanced).
3. For MVP, accept that redeployments may require QR re-login. Production deployments should use a custom Dockerfile that mounts a persistent volume:

```dockerfile
# apps/api/Dockerfile (advanced production version)
VOLUME ["/app/.wa-sessions"]
```

Then in Railway, attach a volume at `/app/.wa-sessions` in the service settings.

---

## Step 2: Deploy NestJS API to Railway

### 2.1 Connect GitHub Repository to Railway

1. In your Railway project, click **"Add Service"** → **"GitHub Repo"**.
2. Click **"Configure GitHub App"** if prompted.
3. Select your repository (e.g., `AI-WhatsApp-CS-Sales-Multi-Account`).
4. Railway will auto-detect the monorepo structure.

### 2.2 Configure Dockerfile Build

1. In the new service settings, go to the **"Settings"** tab.
2. Under **"Build"**, set:
   - **Root Directory**: `.` (or leave empty for repo root)
   - **Dockerfile**: `apps/api/Dockerfile`
   - **Build Command**: Leave empty (Dockerfile handles it)
3. Under **"Deploy"**, set:
   - **Start Command**: `node apps/api/dist/main.js`
   - **Port**: `3001`

### 2.3 Set Environment Variables in Railway

1. Go to the **"Variables"** tab for the API service.
2. Click **"Add Variable"** and fill in each:

```bash
# ── Core ─────────────────────────────────
NODE_ENV=production
API_PORT=3001

# ── Database & Queue ─────────────────────
DATABASE_URL=<paste PostgreSQL URL from Step 1.2>
REDIS_URL=<paste Redis URL from Step 1.3>

# ── Security ─────────────────────────────
# Generate with: openssl rand -base64 32
JWT_SECRET=<generate-a-strong-random-value>
JWT_EXPIRES_IN=7d

# ── Rate Limiting ────────────────────────
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_PER_IP=300
RATE_LIMIT_PER_USER=600

# ── AI Provider (OpenAI-compatible) ──────
# Examples: https://inference-api.nousresearch.com/v1 (Nous)
# or https://api.openai.com/v1 (OpenAI)
AI_BASE_URL=<your-ai-endpoint-url>
AI_API_KEY=<your-ai-api-key>
AI_MODEL=<model-name>

# ── WhatsApp Gateway ─────────────────────
WA_SESSION_DIR=/tmp/.wa-sessions

# ── Seed (Initial Owner Account) ────────
SEED_OWNER_EMAIL=owner@hermes.local
SEED_OWNER_PASSWORD=changeme123

# ── Optional: Notifications (Hermes Agent) ──
# HERMES_NOTIFY_TARGET=telegram
# HERMES_BIN=hermes
```

**Important**: 
- Replace placeholder values with your actual configuration.
- For `JWT_SECRET`, generate a secure random string:
  ```bash
  openssl rand -base64 32
  ```
- For `AI_BASE_URL` and `AI_API_KEY`, use your chosen provider. Nous Research Hermes models via [inference-api.nousresearch.com/v1](https://inference-api.nousresearch.com/v1) are recommended.

### 2.4 Deploy

1. Click the **"Deploy"** button in the top-right.
2. Railway will build the Docker image and start the container.
3. Check the **"Deployments"** tab to see build progress.
4. Once deployed, click the service name to view the **public URL** (e.g., `https://ai-whatsapp-api-prod.railway.app`).
5. **Save the public API URL** — you'll need it for Vercel.

### 2.5 Verify API is Running

```bash
curl https://ai-whatsapp-api-prod.railway.app/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-06-09T10:00:00Z"
}
```

---

## Step 3: Deploy Next.js Web to Vercel

### 3.1 Push Code to GitHub

Ensure your repository is pushed to GitHub (public or private):

```bash
git add .
git commit -m "Deploy to Vercel + Railway"
git push origin main
```

### 3.2 Import Project in Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard).
2. Click **"Add New"** → **"Project"**.
3. Select **"Import Git Repository"**.
4. Find and select your repository (e.g., `AI-WhatsApp-CS-Sales-Multi-Account`).
5. Click **"Import"**.

### 3.3 Configure Build Settings

Vercel should auto-detect Next.js. Ensure these settings:

| Setting | Value |
|---------|-------|
| **Framework** | Next.js |
| **Root Directory** | `./apps/web` |
| **Build Command** | `npm run build --workspace=@hermes/web` |
| **Output Directory** | `.next` |
| **Install Command** | `npm ci` |

### 3.4 Set Environment Variables

1. In Vercel project settings, go to **"Environment Variables"**.
2. Add the following:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://ai-whatsapp-api-prod.railway.app/api/v1` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://ai-whatsapp-api-prod.railway.app/events` |

Replace `ai-whatsapp-api-prod.railway.app` with your actual Railway API URL from Step 2.4.

**Important**: 
- Both must start with `NEXT_PUBLIC_` so they're available in the browser.
- Update these if your Railway API URL changes.

### 3.5 Deploy

1. Click **"Deploy"**.
2. Vercel will build the Next.js app and deploy it.
3. Once complete, you'll get a **public URL** (e.g., `https://hermes-control.vercel.app`).
4. Click the URL to verify the web app loads.

---

## Step 4: Post-Deployment Configuration

### 4.1 Verify Both Services are Connected

1. Open your Vercel URL in a browser (e.g., `https://hermes-control.vercel.app`).
2. You should see the login page.
3. Check browser **DevTools → Network** tab and verify API calls go to your Railway URL (`ai-whatsapp-api-prod.railway.app`).

### 4.2 Seed the Database

The initial owner account must be created. You have two options:

#### Option A: Via Railway One-Off Job (Recommended)

1. In Railway, go to your API service.
2. Click **"Deploy"** → **"Run Command"**.
3. Enter:
   ```bash
   npm run db:migrate --workspace=@hermes/database && npm run db:seed --workspace=@hermes/database
   ```
4. Click **"Run"** and wait for completion.
5. Check the logs to confirm: `Seeded owner user: owner@hermes.local`.

#### Option B: SSH into Railway Container

1. In Railway, click your API service.
2. Go to **"Settings"** → **"SSH"** and connect:
   ```bash
   railway connect
   ```
3. Inside the container:
   ```bash
   npm run db:migrate --workspace=@hermes/database
   npm run db:seed --workspace=@hermes/database
   ```

### 4.3 Test Login

1. Go to your Vercel URL.
2. Log in with:
   - **Email**: `owner@hermes.local` (or your `SEED_OWNER_EMAIL`)
   - **Password**: `changeme123` (or your `SEED_OWNER_PASSWORD`)
3. Change the password immediately in the web UI.

### 4.4 Test Core Features

Before handing off to users, verify:

1. **Login** — access the dashboard.
2. **Add WhatsApp Account** — scan QR code (may require `/tmp/.wa-sessions` persistence; see Step 1.4).
3. **Receive Message** — send a test WhatsApp message to the bot account.
4. **Send Reply** — manually reply to a customer.
5. **AI Draft** — toggle AI mode to `draft` and generate a draft reply.
6. **Check API Logs** — open Railway API service → **"Logs"** tab and verify requests are logged.

---

## Step 5: Custom Domain Setup (Optional)

### 5.1 Add Domain to Vercel

1. In Vercel project settings, go to **"Domains"**.
2. Enter your custom domain (e.g., `hermes.yourcompany.com`).
3. Choose **"Using Nameservers"** or **"Using CNAME"** based on your DNS provider.
4. Follow Vercel's instructions to update DNS.

### 5.2 Railway API (Internal)

The Railway API URL can remain on `*.railway.app` since users don't visit it directly. If you want to mask it with a custom domain:

1. Set up a reverse proxy or API gateway (Advanced; optional for MVP).
2. For now, keep the Railway API on its default subdomain.

### 5.3 Update Environment Variables

If you added a custom domain, update `NEXT_PUBLIC_API_URL` in Vercel:

```bash
NEXT_PUBLIC_API_URL=https://hermes.yourcompany.com/api/v1
```

(Assuming your web and API live under the same domain with an API gateway routing to Railway.)

---

## Monitoring & Logs

### Vercel Logs

1. Dashboard → Select your project → **"Deployments"** tab.
2. Click the most recent deployment → **"Logs"**.
3. See all build and runtime errors here.

### Railway Logs

1. Railway project → Select API service.
2. **"Logs"** tab shows all NestJS output.
3. **"Metrics"** tab shows CPU, memory, and bandwidth usage.

### Health Check Endpoints

Call these from your monitoring tool:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/health` | Liveness check (API is running) |
| `GET /api/v1/health/ready` | Readiness check (DB + Redis are up) |
| `GET /api/v1/health/config` | Config summary (non-secrets) |

Example:
```bash
curl https://ai-whatsapp-api-prod.railway.app/api/v1/health/ready
```

---

## Troubleshooting

### "DATABASE_URL not found" Error

**Symptom**: Railway logs show `Error: DATABASE_URL is required`.

**Fix**:
1. Go to Railway API service → **"Variables"** tab.
2. Confirm `DATABASE_URL` is set and not empty.
3. Copy it directly from the PostgreSQL service **Variables** tab (don't retype).
4. Click **"Redeploy"** to pick up the new variable.

### "REDIS_URL not found" Error

**Symptom**: Railway logs show `Error: REDIS_URL is required`.

**Fix**:
1. Ensure Redis service is running in Railway.
2. Copy `REDIS_URL` from the Redis service **Variables** tab.
3. Paste it into the API service **Variables**.
4. Redeploy.

### API Returns 502 Bad Gateway

**Symptom**: Vercel web loads but API calls fail with 502.

**Fix**:
1. Check Railway API service **Logs** for crashes or errors.
2. Verify `NEXT_PUBLIC_API_URL` in Vercel points to the correct Railway URL.
3. Check if Railway API has run out of memory:
   - Go to **"Metrics"** tab.
   - If memory usage is at 100%, increase Railway plan or optimize code.
4. Check if the API is running: `curl https://ai-whatsapp-api-prod.railway.app/api/v1/health`.

### Web Login Fails (401 Unauthorized)

**Symptom**: Login page appears, but credentials are rejected.

**Fix**:
1. Verify the seed ran successfully:
   ```bash
   # SSH into Railway container
   railway connect
   # Inside container:
   npx prisma studio
   # Check if `users` table has the owner account
   ```
2. If not, re-run the seed:
   ```bash
   npm run db:seed --workspace=@hermes/database
   ```
3. Ensure `JWT_SECRET` is set and the same across deployments.
4. Clear browser cookies and try again.

### Build Fails: "monorepo root not found"

**Symptom**: Vercel build fails with `workspace not found`.

**Fix**:
1. Verify `package.json` at repo root has `"workspaces"` defined.
2. Ensure Vercel **Root Directory** is set to `./apps/web` (not the monorepo root).
3. Verify **Build Command** is `npm run build --workspace=@hermes/web`.

### WhatsApp Sessions Lost After Redeploy

**Symptom**: After redeploying Railway, all WhatsApp accounts require QR re-login.

**Fix**:
1. Sessions are stored in `/tmp/.wa-sessions`, which is ephemeral in Railway.
2. For production, attach a persistent volume:
   - In Railway API service → **"Settings"** → **"Volumes"**.
   - Add volume: Mount path `/app/.wa-sessions`, size 10GB.
3. Update `WA_SESSION_DIR=/app/.wa-sessions` in Environment Variables.
4. Redeploy.

---

## Costs & Scaling

### Vercel Pricing

| Plan | Cost | Includes |
|------|------|----------|
| **Pro** (recommended) | $20/month | Unlimited projects, 100GB bandwidth, edge functions, support |
| **Hobby** | Free | Smaller limits, suitable for MVP |

- **Bandwidth**: 100GB/month included; $0.50/GB overage.
- **Build minutes**: Unlimited (standard builders).
- **Deployments**: Unlimited.

### Railway Pricing

Railway uses a **pay-as-you-go** model:

| Service | Estimated Cost (Production) | Notes |
|---------|---------------------------|-------|
| **PostgreSQL** | $10–15/month | Based on storage (10GB base) + backup |
| **Redis** | $5–7/month | Based on memory (1GB base) |
| **NestJS API** | $5–10/month | Based on vCPU + memory usage (1 vCPU, 2GB RAM) |
| **Free Credit** | -$5/month | Monthly free tier (used toward above) |
| **Total (MVP)** | ~$15–30/month | (After $5 credit) |

**Scaling**:
- If API hits CPU/memory limits, Railway auto-scales.
- For higher traffic, consider multiple API replicas + load balancer (advanced).
- Database connection pool tuning: See `.env.example` `connection_limit` and `pool_timeout` in `DATABASE_URL`.

### Estimated Monthly Costs (Full Stack)

```
Vercel Pro:              $20
Railway (after credit):  $15–30
AI Provider (e.g., Nous):varies (pay-per-token)
────────────────────────
Total:                   ~$50–60/month
```

To reduce:
- Keep Vercel on **Hobby** for MVP (free).
- Use Railway's **$5/month free credit**.
- Negotiate AI provider bulk discounts if high volume.

---

## Next Steps

1. **Update `.env.example`** in the repo with your new URLs:
   ```bash
   # Update .env.example
   NEXT_PUBLIC_API_URL=https://ai-whatsapp-api-prod.railway.app/api/v1
   NEXT_PUBLIC_SOCKET_URL=https://ai-whatsapp-api-prod.railway.app/events
   ```
   Commit this so the next deployer has the URLs.

2. **Set up monitoring**:
   - Vercel: Enable **"Analytics"** in project settings.
   - Railway: Set up uptime monitoring via external service (e.g., Uptime Robot).

3. **Test automated deployments**:
   - Push to `main` branch → Vercel auto-deploys.
   - For Railway, enable **"Auto-Deploy"** if using GitHub.

4. **Backup plan**:
   - Enable PostgreSQL automated backups in Railway.
   - Regularly export customer data (CSV) for safekeeping.

5. **Iterate with users**:
   - Gather feedback on WhatsApp session persistence, QR login flow, and UI.
   - Plan follow-up deployments for feature releases.

---

## Appendix: Quick Reference

### Common Commands

```bash
# Local testing before deployment
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm run dev:api &
npm run dev:web

# After deployment, check API health
curl https://ai-whatsapp-api-prod.railway.app/api/v1/health
curl https://ai-whatsapp-api-prod.railway.app/api/v1/health/ready

# SSH into Railway container (one-off tasks)
railway connect

# Generate strong JWT_SECRET
openssl rand -base64 32
```

### Environment Variable Checklist

Before deploying, ensure these are configured:

- [ ] `DATABASE_URL` (from Railway Postgres)
- [ ] `REDIS_URL` (from Railway Redis)
- [ ] `JWT_SECRET` (generated)
- [ ] `AI_BASE_URL` (e.g., https://inference-api.nousresearch.com/v1)
- [ ] `AI_API_KEY` (your provider key)
- [ ] `AI_MODEL` (e.g., Hermes-4-70B)
- [ ] `NEXT_PUBLIC_API_URL` (Railway API public URL)
- [ ] `NEXT_PUBLIC_SOCKET_URL` (same as above + /events)
- [ ] `SEED_OWNER_EMAIL` (initial admin email)
- [ ] `SEED_OWNER_PASSWORD` (change after first login)

### File Locations

| File | Purpose |
|------|---------|
| `apps/api/Dockerfile` | NestJS Docker build (Railway uses this) |
| `apps/web/Dockerfile` | Next.js Docker build (for reference; Vercel doesn't use) |
| `.env.example` | Template for environment variables |
| `package.json` | Monorepo workspace definition |
| `docs/deployment.md` | General deployment checklist |

---

## Support & Further Reading

- **Vercel Docs**: https://vercel.com/docs
- **Railway Docs**: https://railway.app/docs
- **Hermes Project CLAUDE.md**: See `CLAUDE.md` in repo root for architecture notes.
- **Prisma Guide**: https://www.prisma.io/docs/getting-started

---

**Last updated**: 2026-06-09  
**Tested with**: Node.js 20.x, NestJS 10.x, Next.js 15.x

# VPS Self-Hosted Deployment Guide

Deploy the full Hermes AI WhatsApp platform on a single $5-6/month VPS using Docker Compose.

---

## Cost Estimate

| Item | Cost |
|---|---|
| VPS — 1 vCPU / 1 GB RAM / 25 GB SSD | ~$5-6/month |
| Domain name (optional) | ~$10/year |
| **Total** | **~$5-6/month** |

### Free-credit VPS options

| Provider | Credit | Link |
|---|---|---|
| DigitalOcean | $200 for 60 days | digitalocean.com/try |
| Vultr | $100 credit | vultr.com/promo |
| Linode / Akamai | $100 credit | linode.com/lp/refer |
| Hetzner (EU) | Best price, CX22 = €3.79/mo | hetzner.com |

---

## Section 1 — Prepare the VPS

### 1.1 Create a VPS

1. Sign up at [Vultr](https://vultr.com) or [DigitalOcean](https://digitalocean.com).
2. Create a new server / droplet:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: 1 vCPU, 1 GB RAM, 25 GB SSD (~$6/month)
   - **Region**: closest to your customers
3. Copy the server IP address.

### 1.2 SSH into the VPS

```bash
ssh root@YOUR_SERVER_IP
```

### 1.3 Basic security setup

```bash
# Update packages
apt update && apt upgrade -y

# Create a non-root user
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy   # grants Docker access (run after Docker install)

# Copy SSH key to new user
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Setup UFW firewall
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP  (Nginx)
ufw allow 443/tcp   # HTTPS (Nginx + SSL)
ufw allow 3000/tcp  # Next.js (direct, for testing — can block after Nginx is up)
ufw allow 3001/tcp  # NestJS API (direct, for testing — can block after Nginx is up)
ufw enable

# Install fail2ban to block brute-force SSH attempts
apt install -y fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# (Optional) Disable root SSH login
sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl reload sshd
# From now on log in as: ssh deploy@YOUR_SERVER_IP
```

---

## Section 2 — Install Docker + Docker Compose

```bash
# Install Docker (official one-liner)
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose plugin
apt-get install -y docker-compose-plugin

# Add current user to docker group (if not root)
usermod -aG docker $USER
newgrp docker

# Verify
docker --version          # Docker version 26.x.x
docker compose version    # Docker Compose version v2.x.x
```

---

## Section 3 — Clone the repo and configure .env

```bash
# Switch to deploy user (if you created one)
su - deploy

# Clone the repository
git clone https://github.com/YOUR_USERNAME/AI-WhatsApp-CS-Sales-Multi-Account.git
cd AI-WhatsApp-CS-Sales-Multi-Account

# Copy the example env file
cp .env.example .env

# Edit the .env file — fill in ALL variables
nano .env
```

### Critical variables to set in `.env`

```dotenv
# ── Runtime ────────────────────────────────────────────────────
NODE_ENV=production
API_PORT=3001

# Public URLs — replace YOUR_SERVER_IP with your actual IP or domain
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP/api/v1
NEXT_PUBLIC_SOCKET_URL=http://YOUR_SERVER_IP

# ── Security ───────────────────────────────────────────────────
# Generate strong secrets:
#   openssl rand -base64 48
JWT_SECRET=REPLACE_WITH_STRONG_SECRET
REDIS_PASSWORD=REPLACE_WITH_REDIS_PASSWORD

# ── Database ───────────────────────────────────────────────────
DATABASE_URL=postgresql://hermes:hermes@postgres:5432/hermes?schema=public&connection_limit=10&pool_timeout=20
REDIS_URL=redis://:REPLACE_WITH_REDIS_PASSWORD@redis:6379

# ── AI Provider ────────────────────────────────────────────────
AI_BASE_URL=https://inference-api.nousresearch.com/v1
AI_API_KEY=your_nous_or_openai_key
AI_MODEL=Hermes-4-70B

# ── WhatsApp ───────────────────────────────────────────────────
WA_SESSION_DIR=/app/wa-sessions
```

> **Note**: `postgres` and `redis` in the URLs refer to Docker Compose service names, not `localhost`. Docker's internal DNS resolves them automatically.

---

## Section 4 — Production docker-compose override

The repo ships `docker-compose.prod.yml` which adds:
- `restart: always` on every service
- Redis password protection
- Unexposed Postgres/Redis ports (no direct host access)
- Nginx reverse proxy on ports 80 and 443

Before starting, update the `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` in your `.env`:

```bash
# Confirm these are set correctly in .env
grep NEXT_PUBLIC .env
```

They should point to your server IP (or domain once DNS is set up):

```
NEXT_PUBLIC_API_URL=http://YOUR_SERVER_IP/api/v1
NEXT_PUBLIC_SOCKET_URL=http://YOUR_SERVER_IP
```

---

## Section 5 — Build and start all services

```bash
# Build all Docker images (first build takes 5-15 minutes)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start everything in the background
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check that all containers are running
docker compose ps

# Expected output — all services should show "Up" or "healthy":
# hermes-postgres   Up (healthy)
# hermes-redis      Up (healthy)
# hermes-api        Up (healthy)
# hermes-web        Up
# hermes-nginx      Up

# Follow logs in real time
docker compose logs -f api
docker compose logs -f web
docker compose logs -f nginx

# Press Ctrl+C to stop following logs (containers keep running)
```

If a container exits immediately, inspect it:

```bash
docker compose logs api --tail=50
```

---

## Section 6 — Database migration and seed

Run these once after the first start (and after any schema update):

```bash
# Apply all Prisma migrations
docker compose exec api npx prisma migrate deploy \
  --schema=packages/database/prisma/schema.prisma

# Seed the initial owner account (owner@hermes.local / changeme123)
docker compose exec api sh -c \
  "cd /app && npm run db:seed --workspace=@hermes/database"
```

If the seed command fails, try the direct path:

```bash
docker compose exec api sh -c \
  "cd /app/packages/database && npx ts-node prisma/seed.ts"
```

---

## Section 7 — Access the application

Once all containers are healthy, open your browser:

| URL | What you get |
|---|---|
| `http://YOUR_SERVER_IP` | Web dashboard (login page) |
| `http://YOUR_SERVER_IP/api/v1` | NestJS API root |
| `http://YOUR_SERVER_IP/api/docs` | Swagger / OpenAPI docs |

**Default login credentials** (change immediately after first login):

- Email: `owner@hermes.local`
- Password: `changeme123`

After logging in, go to **Admin → Users** and change the password.

---

## Section 8 — Free SSL with Let's Encrypt (recommended)

You need a domain name pointed to your server IP before running this.

### 8.1 Point your domain to the VPS

In your DNS provider, create an A record:

```
Type: A
Name: @  (or yourdomain.com)
Value: YOUR_SERVER_IP
TTL: 300
```

Wait 1-5 minutes for DNS to propagate, then verify:

```bash
ping yourdomain.com   # should show YOUR_SERVER_IP
```

### 8.2 Update .env with your domain

```bash
nano .env
# Change:
NEXT_PUBLIC_API_URL=https://yourdomain.com/api/v1
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com
```

### 8.3 Get the SSL certificate

```bash
# Install certbot
apt install -y certbot python3-certbot-nginx

# Stop Nginx temporarily so certbot can use port 80
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop nginx

# Get certificate
certbot certonly --standalone -d yourdomain.com

# Certificates are saved to /etc/letsencrypt/live/yourdomain.com/
```

### 8.4 Update nginx.conf for HTTPS

Replace the contents of `nginx.conf` in the repo root with:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://web:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    location /events/ {
        proxy_pass http://api:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    location /api {
        proxy_pass http://api:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 50m;
    }
}
```

Mount the certs into Nginx. Edit `docker-compose.prod.yml` nginx volumes section to point to host certs:

```yaml
  nginx:
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
```

Then restart:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx

# Rebuild web with new env (HTTPS URLs)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build web
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps web
```

### 8.5 Auto-renewal

```bash
# Test renewal (dry run)
certbot renew --dry-run

# Certbot installs a cron/systemd timer automatically.
# Check it with:
systemctl list-timers | grep certbot
```

Add a post-renewal hook to reload Nginx:

```bash
nano /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh
```

```bash
#!/bin/bash
cd /home/deploy/AI-WhatsApp-CS-Sales-Multi-Account
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
```

```bash
chmod +x /etc/letsencrypt/renewal-hooks/post/reload-nginx.sh
```

---

## Section 9 — Maintenance commands

### Update the app (pull new code + rebuild)

```bash
git pull origin main

# Rebuild only the changed services (api and/or web)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build api web

# Rolling restart — zero-downtime for the other services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-deps api web

# Apply any new migrations
docker compose exec api npx prisma migrate deploy \
  --schema=packages/database/prisma/schema.prisma
```

### Backup the database

```bash
# Dump to a SQL file with today's date
docker compose exec postgres \
  pg_dump -U hermes hermes > backup_$(date +%Y%m%d_%H%M%S).sql

# Compress it
gzip backup_*.sql
```

### Restore the database

```bash
gunzip backup_20240101_120000.sql.gz
cat backup_20240101_120000.sql | \
  docker compose exec -T postgres psql -U hermes hermes
```

### Automate daily backups

```bash
crontab -e
# Add this line (runs at 2 AM every day):
0 2 * * * cd /home/deploy/AI-WhatsApp-CS-Sales-Multi-Account && docker compose exec postgres pg_dump -U hermes hermes | gzip > /home/deploy/backups/hermes_$(date +\%Y\%m\%d).sql.gz
```

```bash
mkdir -p /home/deploy/backups
```

### Resource monitoring

```bash
# Live container CPU / memory usage
docker stats

# Disk usage
df -h
docker system df

# Prune unused images and stopped containers
docker image prune -f
docker container prune -f
```

### Restart individual services

```bash
docker compose restart api
docker compose restart web
docker compose restart nginx
```

### Full stop / start

```bash
# Stop everything (data volumes are preserved)
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# Start again
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### View WhatsApp session files

```bash
# Sessions are stored inside the api container at /app/wa-sessions
docker compose exec api ls /app/wa-sessions/
```

---

## Section 10 — Troubleshooting

### Container keeps restarting

```bash
docker compose logs api --tail=100
docker compose logs web --tail=100
```

Common causes:
- `DATABASE_URL` uses `localhost` instead of `postgres` (the service name)
- `REDIS_URL` uses `localhost` instead of `redis`
- Missing `JWT_SECRET` in `.env`
- Port conflicts — check `sudo lsof -i :3001`

### Cannot connect to the app from browser

```bash
# Confirm Nginx is running and listening
docker compose ps nginx
curl -I http://localhost   # from the VPS itself
```

Check UFW:

```bash
ufw status verbose
```

### Prisma migration errors

```bash
# Check the current migration status
docker compose exec api npx prisma migrate status \
  --schema=packages/database/prisma/schema.prisma
```

### Out of disk space

```bash
docker system prune -a --volumes   # WARNING: removes ALL unused data
```

---

## Quick-start recap

```bash
# 1. SSH into VPS, install Docker
curl -fsSL https://get.docker.com | sh && apt-get install -y docker-compose-plugin

# 2. Clone and configure
git clone https://github.com/YOUR_USERNAME/AI-WhatsApp-CS-Sales-Multi-Account.git
cd AI-WhatsApp-CS-Sales-Multi-Account
cp .env.example .env && nano .env   # set DATABASE_URL, REDIS_URL, JWT_SECRET, AI_API_KEY, NEXT_PUBLIC_API_URL

# 3. Build and start
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 4. Migrate and seed
docker compose exec api npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
docker compose exec api sh -c "cd /app && npm run db:seed --workspace=@hermes/database"

# 5. Open http://YOUR_SERVER_IP — login with owner@hermes.local / changeme123
```

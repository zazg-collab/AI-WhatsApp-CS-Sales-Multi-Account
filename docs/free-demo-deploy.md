# Free-Tier Demo Deployment

For demoing the product only — not a production setup. Every service below
has a genuinely free tier (no credit card, no trial expiry). Verified July
2026 pricing pages; re-check before relying on this long-term, free tiers
change often.

| Component | Service | Free tier | Caveat |
|---|---|---|---|
| `apps/web` (Next.js) | **Vercel** (Hobby) | Unlimited demos, 100GB bandwidth | none for this use case |
| `apps/api` (NestJS + Baileys) | **Render** (Free web service) | 750 instance-hours/month | Sleeps after 15 min idle (~1 min cold start); **no persistent disk**, so a WhatsApp session may need re-scanning after the service sleeps/redeploys |
| PostgreSQL | **Neon** | 100 CU-hours/mo, 0.5GB storage | fine for demo data volume |
| Redis | **Upstash** | 256MB, 500K commands/mo | fine for BullMQ queue + cache at demo scale |

Render's own free Postgres/Redis addons expire after 30 days — use Neon +
Upstash instead so the demo doesn't quietly break a month in.

## Steps

1. **Neon** → create project → copy the pooled `DATABASE_URL`.
2. **Upstash** → create Redis database → copy the `REDIS_URL` (rediss:// TLS
   URL, use as-is).
3. **Render** → New → Blueprint → point at this repo → it reads
   [`render.yaml`](../render.yaml) at the repo root and creates the
   `hermes-api` web service. Fill in `DATABASE_URL`, `REDIS_URL`,
   `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` in the service's Environment tab
   (left blank in the blueprint on purpose — they're per-deploy secrets).
   `JWT_SECRET` and `SEED_OWNER_PASSWORD` are auto-generated.
4. Once the API is live, run the seed once from Render's Shell tab:
   ```bash
   npm run db:migrate --workspace=@hermes/database
   npm run db:seed --workspace=@hermes/database
   ```
5. **Vercel** → Import repo → Root Directory `apps/web` → set
   `NEXT_PUBLIC_API_URL=https://<your-render-app>.onrender.com/api/v1` and
   `NEXT_PUBLIC_SOCKET_URL=https://<your-render-app>.onrender.com/events`.
6. Open the Vercel URL, log in with `SEED_OWNER_EMAIL` / the generated
   `SEED_OWNER_PASSWORD` from Render's env vars, change the password.

## Living with the free tier

- First request after idle takes ~30-60s (Render cold start) — fine for a
  demo, just don't be surprised by it live.
- If a WhatsApp account's QR session drops after a sleep/redeploy, re-scan —
  acceptable for a demo, not for real customer traffic. For that, follow
  [`vercel-railway-setup.md`](./vercel-railway-setup.md) or
  [`vps-deploy.md`](./vps-deploy.md) instead, both of which keep
  `.wa-sessions/` on a persistent disk.

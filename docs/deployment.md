# Deployment Readiness Guide

This guide covers the minimum steps to run Hermes AI Sales & CS Control Center outside local development.

## 1. Required services

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Persistent storage for `WA_SESSION_DIR`
- An OpenAI-compatible AI endpoint

For local infrastructure only:

```bash
docker compose up -d postgres redis
```

## 2. Environment

Start from the checked-in template:

```bash
cp .env.example .env
```

Mandatory production changes:

- Replace `JWT_SECRET` with a strong random value.
- Point `DATABASE_URL` and `REDIS_URL` at managed/persistent services. Tune Prisma with `connection_limit` and `pool_timeout` in the Postgres URL.
- Set `WA_SESSION_DIR` to a persistent mounted path.
- Set `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` for your provider.
- Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` to public API endpoints.

Never commit real `.env` files or provider secrets.

## 3. Database migration and seed

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run db:seed
```

The seed creates the owner account from `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD`.
Change the seeded password immediately after first login.

## 4. Build and start

```bash
npm run build
npm run start:prod --workspace=@hermes/api
npm run start --workspace=@hermes/web
```

Recommended process model:

- Run API and web as separate processes/containers.
- Keep API close to Redis/Postgres to reduce queue and DB latency.
- Mount `WA_SESSION_DIR` into the API container only.

## 5. Health checks

The API exposes:

- `GET /api/v1/health` — liveness.
- `GET /api/v1/health/ready` — database, WhatsApp session directory, and required config readiness.
- `GET /api/v1/health/config` — non-secret configuration summary.

Expected readiness response has `status: "ok"`. A `degraded` response should block deployment promotion.

## 6. Production hardening defaults

The API enables these cross-cutting protections by default:

- Global DTO validation with `whitelist` and `forbidNonWhitelisted`.
- Recursive input sanitization for body/query/params to reduce stored XSS risk.
- In-memory rate limiting by IP/token with `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_PER_IP`, and `RATE_LIMIT_PER_USER`.
- Consistent JSON error responses with request IDs.
- Request/response logging with status, duration, IP, and user context when available.
- Graceful shutdown hooks so Prisma/BullMQ providers can close on process signals.
- Security headers (`x-content-type-options`, `x-frame-options`, `referrer-policy`, `permissions-policy`) on every API response.

For multi-instance deployments, replace in-memory rate limiting with a Redis-backed limiter at the gateway or application layer.

### Tunable safety limits

All defaults are conservative; override via env only with a clear reason:

| Env | Default | Controls |
|---|---|---|
| `LOGIN_MAX_ATTEMPTS` | `10` | failed logins per IP+email before lockout |
| `LOGIN_LOCKOUT_WINDOW_MS` | `900000` (15 min) | lockout / attempt-counting window |
| `AI_TIMEOUT_MS` | `30000` | upper bound on every AI provider / sidecar HTTP call |
| `CAMPAIGN_MAX_RECIPIENTS` | `1000` | max targets per campaign |
| `CAMPAIGN_MAX_DAILY_SENDS` | `500` | campaign sends per WhatsApp account per 24h (ban mitigation) |
| `SLA_RESPONSE_MINUTES` | `15` | minutes a customer message may go unanswered before the chat is flagged |
| `SLA_SCAN_INTERVAL_MS` | `60000` (1 min) | how often the SLA scanner runs |

## 7. Operational checks before pilot

Run these commands before handing the app to operators:

```bash
npm test
npm run db:generate
npm run build
```

Then verify manually:

1. Login as owner.
2. Add a WhatsApp account and scan QR.
3. Receive an inbound customer message.
4. Send a manual reply.
5. Toggle AI mode and generate a draft.
6. Create a customer bulk action and confirm audit logs.
7. Create a campaign draft, preview recipients, submit, approve, and start with a low rate limit.
8. Open `/monitoring` and confirm response, AI quality, and campaign metrics load.

## 8. Backup procedures

### What to back up

| Asset | Why | Loss impact |
|---|---|---|
| PostgreSQL database | all CRM/chat/campaign data | total data loss |
| `WA_SESSION_DIR` | Baileys auth state | every account must re-scan QR |
| `WA_MEDIA_DIR` | inbound chat media files | media bubbles show "file tidak tersedia" |
| Redis AOF (`hermes_redisdata` volume) | queued campaign/follow-up jobs | queued sends lost (DB rows remain `queued`) |
| `.env` (stored in a secrets manager, not in the repo) | JWT secret, DB creds, AI keys | sessions invalidated, manual reconfiguration |
| Hermes Agent config | outbound notification credentials | alerts silently disabled |

### Database

Nightly dump with 14-day retention (run from cron or a scheduler container):

```bash
pg_dump "$DATABASE_URL" --format=custom \
  --file="/backups/hermes-$(date +%F).dump"
find /backups -name 'hermes-*.dump' -mtime +14 -delete
```

Restore:

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" /backups/hermes-YYYY-MM-DD.dump
```

### WhatsApp sessions

`WA_SESSION_DIR` contains live credential files that change on every
connection. Back it up with the API **stopped** (or accept a small risk of a
torn copy — Baileys usually recovers):

```bash
tar czf "/backups/wa-sessions-$(date +%F).tgz" -C "$WA_SESSION_DIR" .
```

A stale session backup may be rejected by WhatsApp; treat QR re-scan as the
recovery of last resort and keep account phone numbers documented.

### Verify restores

A backup that has never been restored is not a backup. Quarterly (and before
any schema migration in production):

1. Restore the latest dump into a scratch database.
2. Run `npx prisma migrate deploy` against it — it must apply cleanly.
3. Spot-check row counts for `customers`, `conversations`, `messages`.

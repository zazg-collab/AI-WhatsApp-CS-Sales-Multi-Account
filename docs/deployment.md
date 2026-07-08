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
- Set `WA_SESSION_DIR` to a persistent mounted path. Keep `WA_SYNC_FULL_HISTORY=true` when operators need phone/native WhatsApp chats mirrored into the dashboard.
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

For multi-instance deployments, replace in-memory rate limiting with a Redis-backed limiter at the gateway or application layer. The **login lockout** (`LoginThrottleGuard`) is also in-memory, so with multiple replicas an attacker gets `LOGIN_MAX_ATTEMPTS × replicas` tries — front it with a shared limiter for HA setups.

### Access-model decisions (by design)

- **Admin access is flat across WhatsApp accounts (DR2).** Every `admin` can read and operate every account's conversations/customers via the REST API; Socket.IO room scoping only constrains *live event delivery* to assigned accounts. This fits a single-team deployment. Revisit (add per-account filters for the `admin` role across conversations/customers endpoints) before any multi-tenant or franchise rollout.
- **Media URLs are unauthenticated capability URLs.** `/media/<uuid>.<ext>` can be fetched without a JWT because `<img>`/`<audio>` tags cannot attach one; the random UUID is the secret. Don't log or share these URLs externally.
- **JWT lives in browser localStorage.** Standard SPA tradeoff (XSS-readable); mitigated by React escaping, input sanitization, and no `dangerouslySetInnerHTML` on any dynamic content (the only use is a static inline theme script in the root layout). A `Content-Security-Policy` for the web app is on the hardening backlog (needs Next.js nonce wiring).

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
| `AUTO_ASSIGN_STRATEGY` | `off` | new-chat routing: `off` / `round_robin` / `least_busy` |
| `AUTO_AWAY_COOLDOWN_MS` | `43200000` (12h) | min gap between auto-away messages to the same customer |
| `CSAT_ENABLED` | `false` | send a 1–5 rating request when a chat is resolved |
| `CSAT_WINDOW_HOURS` | `24` | how long after the request a numeric reply counts as the rating |

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
4. Send a message from the linked phone/native WhatsApp and confirm it appears in `/dashboard` as an admin-side bubble.
5. Send a manual reply.
6. Toggle AI mode and generate a draft.
7. Create a customer bulk action and confirm audit logs.
8. Create a campaign draft, preview recipients, submit, approve, and start with a low rate limit.
9. Open `/monitoring` and confirm response, AI quality, and campaign metrics load.

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

## 9. Rollback

Releases are reversible at two layers — **application** and **database** —
and they roll back independently. Always do the app rollback first; only touch
the database if a migration is the problem.

### Pre-deploy safety net (automatic)

The deploy workflow runs `scripts/backup-db.sh` **before** migrations, producing
a timestamped `pg_dump` under `./backups/` (last 14 kept). The API entrypoint
runs `prisma migrate deploy` and, when `NODE_ENV=production`, **aborts the boot
if a migration fails** — so a bad migration fails the rollout instead of serving
a broken schema.

### A. Roll back the application (no schema change)

Every image is tagged with its commit SHA, so redeploy the previous one:

```sh
# On the server, from the repo root:
export PREV_SHA=<last-known-good-commit-sha>
git checkout "$PREV_SHA"
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This is safe whenever the schema did **not** change between the two versions,
or when the migration was written backward-compatibly (expand/contract).

### B. Roll back a bad migration (schema change)

Prisma migrations are forward-only — there is no `migrate down`. To recover:

1. Stop the API so nothing writes mid-restore:
   `docker compose -f docker-compose.yml -f docker-compose.prod.yml stop api`
2. Restore the pre-deploy dump:
   ```sh
   gzip -dc backups/hermes-<STAMP>.sql.gz | \
     docker compose -f docker-compose.yml -f docker-compose.prod.yml \
     exec -T postgres psql -U "$POSTGRES_USER" "$POSTGRES_DB"
   ```
3. Check out the previous good SHA (so the image matches the restored schema)
   and `up -d` as in **A**.
4. Investigate; reissue the migration as a backward-compatible expand/contract
   change before redeploying.

### Avoiding step B: write reversible migrations

Prefer expand/contract so the previous app version always tolerates the new
schema and an app-only rollback (**A**) is enough:

- **Expand** (release N): add nullable columns / new tables; backfill; keep old
  columns. Deploy app that writes both.
- **Contract** (release N+1, after N is proven): drop the old columns.

Never combine an additive and a destructive change in the same migration.

## 10. Observability & monitoring

### Logs

Structured **JSON, one object per line** to stdout/stderr — ship them with any
log agent (Loki, CloudWatch, Datadog). Every line carries `ts, level, context,
message` and, for anything inside a request, the `requestId` and `userId`
(propagated via AsyncLocalStorage). Set `LOG_LEVEL` to control verbosity;
`LOG_PRETTY=true` for human-readable local dev.

The same `requestId` is returned in the `x-request-id` response header and in
error response bodies — quote it in a bug report to find the exact log lines.

### Metrics (Prometheus)

`GET /api/v1/metrics` exposes Prometheus text format. Protect it with
`METRICS_TOKEN` (scraper sends `Authorization: Bearer <token>`) or keep it on an
internal network. Key series:

- `http_request_duration_seconds` / `http_requests_total` — latency p95 + error rate (labels: method, route, status).
- `wa_session_state{state}` — **accounts by WhatsApp session status** (the #1 outage signal).
- `bullmq_jobs{queue,state}` — campaign/health queue backlog and failures.
- `ai_requests_total{outcome}`, `hermes_reviews_total{decision}`, `wa_events_total{event}` — AI/supervisor/gateway counters.
- `hermes_*` default Node process metrics (event-loop lag, heap, CPU).

### Health endpoints (point an external monitor at these)

| Endpoint | Auth | Use |
|---|---|---|
| `GET /api/v1/health` | none | liveness (container healthcheck) |
| `GET /api/v1/health/ready` | none | readiness: DB + Redis + session dir + config |
| `GET /api/v1/health/whatsapp` | none | aggregate session counts; `status: degraded` when any account is down/banned |
| `GET /api/v1/health/config` | owner/supervisor | non-secret config summary |

A Docker healthcheck only restarts the container — it does **not** tell you the
system is down. Poll `/health/ready` and `/health/whatsapp` from an **external**
monitor (UptimeRobot / BetterStack / self-hosted Uptime Kuma) every 30–60s and
alert on two consecutive failures or `status != ok`.

### Errors

Server errors (5xx) and process-level `unhandledRejection`/`uncaughtException`
are sent to the central reporter: always written as a structured `error` log
line, and additionally POSTed to `ERROR_WEBHOOK_URL` (Sentry-store / Slack / any
JSON sink) when configured. No message bodies or phone numbers are forwarded —
only ids and stack traces.

### Suggested alert rules

| Alert | Condition | Severity |
|---|---|---|
| WhatsApp account down | `/health/whatsapp` `down > 0` for >2 min | Critical |
| API error spike | 5xx rate >2% over 5 min | Critical |
| Queue backlog | `bullmq_jobs{state="waiting"}` over threshold, or `failed` rising 10 min | High |
| Not ready | `/health/ready` non-ok ×2 | Critical |
| Latency SLO burn | http p95 breaches PRD target sustained | High |

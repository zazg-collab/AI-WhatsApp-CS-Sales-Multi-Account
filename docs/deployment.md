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

For multi-instance deployments, replace in-memory rate limiting with a Redis-backed limiter at the gateway or application layer.

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

## 8. Backup notes

Back up at least:

- PostgreSQL database.
- `WA_SESSION_DIR` directory.
- Hermes Agent config if outbound notifications are enabled.

Redis is used for queues; persistent Redis storage is recommended for campaign/follow-up delivery reliability.

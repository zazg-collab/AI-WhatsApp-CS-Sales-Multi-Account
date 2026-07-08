# Local Development Troubleshooting

Generic fixes for the first-run/local-dev problems every new developer hits.
For platform-specific deploy issues, see the "Troubleshooting" sections in
[docs/vps-deploy.md](./vps-deploy.md) and
[docs/vercel-railway-setup.md](./vercel-railway-setup.md) instead.

## `docker compose up -d` fails: "failed to connect to the docker API"

```
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Docker Desktop isn't running. Start Docker Desktop (Windows/macOS) or the
`docker` daemon (Linux), wait for it to report "running", then retry. There is
no workaround — Postgres and Redis are required services (see
[docs/deployment.md](./deployment.md) §1).

## `npm run db:migrate` fails or hangs

- **Connection refused** — Postgres isn't up yet. Confirm with
  `docker compose ps`; if the `postgres` container isn't `healthy`, check
  `docker compose logs postgres`.
- **Migration history drift** ("database schema is not in sync" /
  "migration ... was modified after it was applied") — someone edited an
  already-applied migration file, or the local DB was migrated by an older
  branch. Do not run `prisma migrate reset` against a database with real
  data. For a throwaway local DB it's safe: `npx prisma migrate reset
  --workspace=@sentinel/database` then re-run `db:migrate` + `db:seed`.
- **`relation already exists`** — a previous partial migration run left the
  schema half-applied. Same fix as above for a local/throwaway DB; for a
  shared DB, inspect `_prisma_migrations` and fix manually rather than reset.

## API boots but `/health/ready` reports `degraded`

`GET /api/v1/health/ready` checks DB, WhatsApp session directory, and
required config. Check the JSON body — it names which check failed. Common
causes: `DATABASE_URL` unreachable, `WA_SESSION_DIR` not writable, or a
required env var (`JWT_SECRET`) left at its placeholder value.

## WhatsApp QR won't scan / account stuck "connecting"

Baileys session state lives under `WA_SESSION_DIR` (`.wa-sessions` by
default). If a session is corrupted or the linked phone unlinked the device:

1. Stop the API.
2. Delete that account's subfolder under `WA_SESSION_DIR` (don't delete the
   whole directory if other accounts are connected).
3. Restart the API and re-add the account from `/accounts` — it will issue a
   fresh QR.

There is no faster recovery path; a corrupted session always requires a
re-scan.

## Campaign/follow-up/SLA jobs never run

These are BullMQ jobs backed by Redis. If `REDIS_URL` is wrong or Redis isn't
running, jobs queue silently with no error in the API logs (BullMQ retries
the connection in the background). Confirm with `docker compose ps redis`
and check `bullmq_jobs{state="waiting"}` on `GET /api/v1/metrics` — a
growing `waiting` count with `active` stuck at 0 means the worker can't
reach Redis.

## AI replies/drafts always fail or time out

Check `GET /api/v1/ai/config` for the configured `AI_BASE_URL`/model (no
secrets returned). A 401/403 from the provider means `AI_API_KEY` is wrong;
a timeout means the provider is unreachable or slower than `AI_TIMEOUT_MS`
(default 30s) — raise it for slow local providers (Ollama/LM Studio cold
starts) rather than assuming the integration is broken.

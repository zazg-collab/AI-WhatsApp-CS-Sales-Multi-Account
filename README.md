# AI-WhatsApp-CS-Sales-Multi-Account

**Hermes AI Sales & Customer Service Control Center** — a semi-automated system
for managing multiple AI-powered WhatsApp chatbots from a single dashboard, with
**Hermes** as a supervisor layer that reviews answers, scores risk/confidence,
and controls quality across all bots.

See [CLAUDE.md](./CLAUDE.md) for architecture and the PRD for full product spec.

## Monorepo layout

```
apps/
  api/                 NestJS backend (REST API, /api/v1)
  web/                 Next.js dashboard (WhatsApp-style 3-panel UI)
packages/
  database/            Prisma schema + client (shared)
docker-compose.yml     Postgres + Redis for local dev
```

## Getting started

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env      # fill in secrets

# 3. Start infra
docker compose up -d      # Postgres + Redis

# 4. Database
npm run db:migrate        # create schema
npm run db:seed           # create initial owner user

# 5. Run
npm run dev:api           # http://localhost:3001/api/v1
npm run dev:web           # http://localhost:3000
```

## Status

- **Iteration 1 — foundation**: monorepo, full Prisma data model, JWT auth with
  role guard (owner/supervisor/admin/viewer), stubbed controllers.
- **Iteration 2 — WhatsApp gateway (Baileys)**: multi-account sessions with QR
  scan, auto-reconnect, inbound messages persisted to the CRM, manual reply,
  human takeover, and AI-mode toggle. Live updates over Socket.IO (`/events`).
  Add a number at `/accounts` and scan the QR to connect.

AI engine and Hermes supervisor land in subsequent iterations.

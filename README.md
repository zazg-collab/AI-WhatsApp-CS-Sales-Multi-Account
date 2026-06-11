# Hermes AI — WhatsApp CS & Sales Control Center

A semi-automated, multi-account WhatsApp CRM and AI chatbot platform. Manage
all your WhatsApp bots from one dashboard with **Hermes** as an AI supervisor
layer that reviews, scores, and controls quality across every bot.

---

## Features

### Core Platform
- **Multi-account WhatsApp** — connect unlimited numbers via Baileys, QR scan, session persistence
- **3-panel Chat UI** — WhatsApp Web–style: conversation list / message center / customer panel
- **AI Modes per conversation** — `AI_ON`, `AI_OFF`, `AI_DRAFT`, `AI_SUPERVISED`, `AI_PAUSED`
- **Human takeover & return-to-AI** — one click to take over, one click to hand back
- **Live updates** — Socket.IO (`/events`) pushes every new message, status change, and QR event
- **Role-based access** — `owner`, `supervisor`, `admin`, `viewer`

### AI Engine (provider-agnostic)
- Works with any **OpenAI-compatible** endpoint: OpenAI, OpenRouter, Ollama, LM Studio, vLLM, Nous Research, etc.
- Configure via `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` — no code change needed
- Auto-reply, draft generation, chat summarisation, lead scoring (0–100 → cold/warm/hot/very-hot)
- **Context window management** — capped at 20 messages + 12 k character token budget with oldest-first trimming
- **Sentiment analysis** — per-conversation customer sentiment endpoint
- **Response cache** — in-memory LRU (10-min TTL, 500 entries) with hit/miss stats

### Hermes Supervisor
- **Rules engine** — keyword triggers: refund → takeover, legal/threat → pause AI, complaint → draft
- **LLM review gate** — confidence + risk scoring, decision: `approve / draft / block / pause_ai / takeover_required`
- **Pre-send gate** for `AI_SUPERVISED`, **post-send audit** for `AI_ON`
- **Daily reports**, **bot performance** metrics, **knowledge-gap** detection
- **"Tanya Hermes"** chat box — answer admin questions grounded in live snapshot data
- **Per-bot deep-dive** — 7-day insight with concrete fix recommendations
- **Proactive alerts** via [Hermes Agent](https://hermes-agent.nousresearch.com/) (`hermes send`) for multi-platform notifications

### Campaigns
- Controlled outbound: draft → submit → **owner/supervisor approval** → start
- **Scheduled auto-start** — set a future date/time, campaigns start automatically
- **Personalization tokens** — `{{name}}` and `{{phone}}` replaced per recipient
- **Opt-out / blacklist** — keyword auto-detect (STOP, BERHENTI, UNSUBSCRIBE) + manual opt-in/out
- Per-account rate limiting + randomized human delay
- Campaign duplication, recipient preview, retry failed, pause/cancel
- Idempotency guard — no duplicate sends; separation of duties — creator cannot approve own campaign

### WhatsApp Stability & Anti-ban (Iteration 16)
- **Exponential backoff reconnect** — 10 attempts max, 2 s–60 s with ±20 % jitter
- **Typing delay** proportional to message length (50 ms/char, clamped 800 ms–6 s)
- **Per-account send throttle** — max 20 messages/minute
- **Periodic health check** — revives DB-connected accounts that lost their socket

### Customer CRM
- Customer list with filters, bulk actions (stage, tag, admin assignment, notes)
- Internal notes, unified conversation timeline
- Lead stage: `cold` / `warm` / `hot` / `very_hot`
- Opt-out tracking (`optedOut`, `optedOutAt`)

### Productivity
- **Quick replies** — templated responses for common questions
- **Auto-assignment** — round-robin or least-busy strategy
- **SLA alerts** — stale-chat notifications when response time exceeds threshold
- **Business hours** — auto-away outside configured hours
- **CSAT** — customer satisfaction score captured via reply after resolution
- **Follow-up scheduler** — queue a message to be sent at a future time
- **Knowledge base** — CRUD items that feed the AI system prompt in real time
- **Bot / Persona editor** — manage Soul.md persona per account
- **Audit log** — every sensitive action recorded with actor + timestamp
- **CSV export** — analytics, customer list, audit log
- **Media handling** — send/receive images, video, audio, documents; local or S3 storage

### Developer / Ops
- **Swagger UI** at `/api/docs`
- **Health endpoint** `GET /api/v1/health/ready`
- **Config health** `GET /api/v1/health/config`
- Production hardening: strict validation, sanitisation, rate limiting, request IDs, security headers, graceful shutdown
- Docker Compose full stack (Postgres + Redis + API + Web + Nginx)

---

## Monorepo Layout

```
apps/
  api/                  NestJS backend — REST API at /api/v1
  web/                  Next.js dashboard (App Router + Tailwind)
packages/
  database/             Prisma schema + shared client (@hermes/database)
docs/
  vps-deploy.md         Self-hosted VPS guide (Docker Compose, ~$5/mo)
  vercel-railway-setup.md  Vercel + Railway hybrid guide
  deployment.md         Deployment checklist
docker-compose.yml      Local dev infra (Postgres + Redis)
docker-compose.prod.yml Production stack (API + Web + Nginx + Postgres + Redis)
nginx.conf              Reverse proxy config
```

---

## Quick Start

```bash
# 1. Install all workspaces
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set: DATABASE_URL, JWT_SECRET, AI_BASE_URL, AI_API_KEY, AI_MODEL

# 3. Start Postgres + Redis
docker compose up -d

# 4. Set up database
npm run db:migrate        # apply schema migrations
npm run db:seed           # create initial owner user

# 5. Run in development
npm run dev:api           # → http://localhost:3001/api/v1
npm run dev:web           # → http://localhost:3000
```

Default login: `owner@hermes.local` / `changeme123` (set by `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD`).

---

## All Commands

| Command | Description |
|---|---|
| `npm install` | Install all workspace dependencies |
| `npm run dev:api` | NestJS dev server (hot reload) |
| `npm run dev:web` | Next.js dev server (hot reload) |
| `npm run build` | Build all workspaces |
| `npm run db:generate` | Regenerate Prisma client after schema changes |
| `npm run db:migrate` | Create & apply migrations |
| `npm run db:seed` | Seed initial owner user |
| `npm run lint` | Lint all workspaces |
| `npm run test --workspace=@hermes/api` | API unit + e2e tests |
| `npm run test --workspace=@hermes/web` | Web component tests |
| `docker compose up -d` | Start local Postgres + Redis |

---

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | Token expiry (e.g. `7d`) |
| `AI_BASE_URL` | OpenAI-compatible base URL |
| `AI_API_KEY` | API key for AI provider |
| `AI_MODEL` | Model name (e.g. `Hermes-4-70B`) |
| `WA_SESSION_DIR` | Directory for Baileys session files |
| `MEDIA_STORAGE_DRIVER` | `local` or `s3` |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | API URL for browser requests |
| `NEXT_PUBLIC_SOCKET_URL` | Socket.IO URL for browser |
| `HERMES_NOTIFY_TARGET` | Hermes Agent notification target |
| `HERMES_SIDECAR_URL` | Optional: Hermes Agent sidecar URL |
| `SEED_OWNER_EMAIL` | Initial owner email |
| `SEED_OWNER_PASSWORD` | Initial owner password |
| `AUTO_ASSIGN_STRATEGY` | `off`, `round_robin`, or `least_busy` |
| `CSAT_ENABLED` | `true` to enable satisfaction scoring |
| `SLA_RESPONSE_MINUTES` | Minutes before stale-chat alert fires |

See `.env.example` for the full list including S3, rate limit, and campaign settings.

---

## Dashboard Pages

| URL | Description |
|---|---|
| `/` | Login |
| `/dashboard` | 3-panel chat UI with live messages |
| `/accounts` | Add WhatsApp account, QR scan |
| `/bots` | Bot + Persona editor |
| `/customers` | Customer CRM, bulk actions |
| `/campaigns` | Campaign management (draft → approve → start) |
| `/knowledge` | Knowledge base editor |
| `/hermes` | Supervisor dashboard + "Tanya Hermes" chat |
| `/monitoring` | Response-time, AI quality, campaign delivery |
| `/analytics` | Sales analytics, lead funnel, message volume |
| `/audit` | Audit log with filters |
| `/templates` | Quick reply templates |
| `/settings/ai` | AI provider config + model list |
| `/admin/users` | User management (owner only) |

---

## API Modules

| Module | Prefix | Description |
|---|---|---|
| auth | `/auth` | Login, logout, token refresh |
| wa | `/wa/accounts` | WhatsApp account management, QR, health |
| conversations | `/conversations` | Messages, search, takeover, AI mode |
| ai | `/ai` | Reply, draft, summarise, sentiment, cache stats |
| hermes | `/hermes` | Supervisor alerts, reports, insight, ask |
| knowledge | `/knowledge-bases` | Knowledge base + items CRUD |
| customers | `/customers` | CRM, bulk actions, opt-in/out |
| campaigns | `/campaigns` | Full campaign lifecycle + opt-out management |
| bots | `/bots` | Bot + Persona management |
| users | `/users` | User CRUD, role management |
| dashboard | `/dashboard` | Summary, lead funnel, message volume |
| followups | `/follow-ups` | Follow-up scheduler |
| audit | `/audit` | Audit log query |
| sla | `/sla` | SLA alerts + admin workload report |
| quick-replies | `/quick-replies` | Quick reply templates |
| media | `/media` | File upload, media retrieval |

Full interactive documentation: `GET /api/docs` (Swagger UI).

---

## Database Schema

**Tables:** User, WhatsappAccount, Bot, Persona, KnowledgeBase, KnowledgeItem,
Customer, Conversation, Message, HermesReview, FollowUp, Campaign,
CampaignRecipient, QuickReply, AuditLog

**Key enums:**
- `AiMode` — ai_on, ai_off, ai_draft, ai_supervised, ai_paused
- `HermesDecision` — approve, draft, block, pause_ai, takeover_required
- `LeadStage` — cold, warm, hot, very_hot
- `CampaignStatus` — draft, pending_approval, approved, scheduled, running, paused, completed, cancelled
- `Role` — owner, supervisor, admin, viewer

---

## Deployment

### Self-hosted VPS (recommended, ~$5/month)

```bash
git clone <repo> && cd <repo>
cp .env.example .env   # fill in secrets
docker compose -f docker-compose.prod.yml up -d
docker compose exec api npx prisma migrate deploy
docker compose exec api npx ts-node prisma/seed.ts
```

See [docs/vps-deploy.md](./docs/vps-deploy.md) for full guide including SSL, backups, and maintenance.

### Vercel + Railway (cloud)

See [docs/vercel-railway-setup.md](./docs/vercel-railway-setup.md) for deploying the web app on Vercel (free) and the API on Railway (~$5/month).

---

## Testing

```bash
npm run test --workspace=@hermes/api   # Jest: 316 tests (unit + e2e)
npm run test --workspace=@hermes/web   # Vitest: component tests
```

CI runs lint, TypeScript check, unit tests, e2e tests, and Docker image builds on every push.

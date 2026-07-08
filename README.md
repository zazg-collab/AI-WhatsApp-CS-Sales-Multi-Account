# Hermes AI — WhatsApp Sales & Customer Service Control Center

A semi-automated system for managing **multiple AI-powered WhatsApp chatbots**
from a single dashboard, with **Hermes** as a supervisor layer that reviews
answers, scores risk/confidence, and controls quality across every bot.

Human-in-the-loop by design: the AI drafts and replies, Hermes supervises, and
your team stays in control with takeover, draft approval, and per-conversation
AI modes.

> **Deployment model:** single-tenant, internal team tool — **not** a public
> multi-tenant SaaS. There is no self-service signup; the seeded **owner**
> creates all staff accounts. One company = one instance.

See [CLAUDE.md](./CLAUDE.md) for deep architecture notes and the PRD for the
full product spec.

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Monorepo layout](#monorepo-layout)
- [Roles & access model](#roles--access-model)
- [AI provider & models](#ai-provider--models)
- [Hermes Agent integration](#hermes-agent-integration)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Commands](#commands)
- [API surface](#api-surface)
- [Data model](#data-model)
- [Testing & QA](#testing--qa)
- [Deployment](#deployment)
- [Security & hardening](#security--hardening)
- [Documentation](#documentation)

---

## Features

**WhatsApp gateway (Baileys)**
- Multi-account sessions with QR scan / pairing code, session persistence, and
  exponential-backoff auto-reconnect with a retry cap.
- Inbound messages persisted to the CRM and pushed live to the dashboard over
  Socket.IO (`/events`). Manual reply, media send/ingest, human takeover, and
  return-to-AI.
- Anti-ban: randomized human send delays, typing indicators, per-account send
  throttle, periodic session health checks, and a per-account health endpoint.

**AI engine (provider-agnostic)**
- Any OpenAI-compatible endpoint via `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`
  (OpenAI, OpenRouter, Ollama, LM Studio, vLLM, Nous Portal…).
- Reply/draft generation, chat summary, lead scoring (auto stage + score),
  customer sentiment, bounded context window with token-budget trimming, and a
  conservative response cache.
- Per-conversation AI modes: `AI_ON`, `AI_OFF`, `AI_DRAFT`, `AI_SUPERVISED`,
  `AI_PAUSED`.

**Hermes supervisor**
- Deterministic rules engine (refund→takeover, legal/threat→pause, complaint→
  draft) merged with an LLM judgement → `{decision, confidence, risk}`.
- Pre-send gate for `AI_SUPERVISED`, post-send audit for `AI_ON`.
- Alerts, daily report, bot performance, knowledge-gap detection, live cross-bot
  snapshot, "Tanya Hermes" Q&A, and per-bot deep-dive insight.
- **Separately configurable supervisor model** (`HERMES_MODEL`) — run a stronger
  judge over a cheaper CS-bot model.

**CRM & knowledge**
- Customer list/filter/update, internal notes, tags, lead stages, unified
  timeline, and safe bulk actions (stage/tag/admin/note) with server-side limits.
- Knowledge bases & items CRUD whose active items feed the AI prompt. Optional
  **RAG**: pgvector embeddings + hybrid keyword/semantic rerank.
- Product & stock catalog with external product sources; media library.

**Outbound campaigns (controlled)**
- Draft → recipient preview → approval → queued sends with per-account rate
  limits, randomized delay, opt-out/blacklist exclusion, idempotency, scheduled
  auto-start, duplication, and `{{name}}`/`{{phone}}` personalization.

**Analytics & monitoring**
- Response-time metrics (first-response per customer burst), AI quality/fallback
  stats, message volume, CSAT, campaign delivery, admin workload, and **deep
  closing analytics** (funnel conversion, bot/persona attribution, win/loss).

**Platform**
- Role-aware UI/nav, conversation search, audit log, CSV exports, Swagger docs,
  AI self-learning proposals, and a one-place system-health indicator
  (API + realtime + WhatsApp account status).

---

## Architecture

```
[Customer WhatsApp]
      ↓  Baileys gateway (per-account sessions)
[Message ingest]  → upsert customer + conversation + message
      ↓
[AI engine]  ← Soul.md persona + active knowledge (+RAG) + customer memory
      ↓
[Hermes supervisor]  ← rules engine + risk/confidence checker
      ↓
[Send service]  → anti-ban delay/throttle → [Customer WhatsApp]

[Next.js dashboard]  ⇆  Socket.IO  ⇆  [NestJS API]  ⇆  PostgreSQL + Redis
                                            ⇅
                              [Hermes Agent gateway]  (notifications + CRM report pull)
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS, Socket.IO client |
| Backend | Node.js ≥20, NestJS, Socket.IO, BullMQ |
| Database | PostgreSQL (Prisma ORM), Redis (queues/cache) |
| WhatsApp | Baileys (multi-account) |
| AI | Any OpenAI-compatible provider; pgvector for embeddings |
| Notifications | Hermes Agent CLI (`hermes send`) → Telegram/Slack/Discord/… |

---

## Monorepo layout

```
apps/
  api/                 NestJS backend — global prefix /api/v1
    src/
      auth/            JWT login, role guard
      common/          guards (api-key, rate-limit), filters, middleware, utils
      realtime/        Socket.IO hub (EventsGateway, /events)
      notifications/   NotificationsService → Hermes Agent gateway
      modules/
        wa/            Baileys gateway, sessions, message ingest
        conversations/ chat ops, messages, search
        ai/            provider, prompt-builder, embeddings, knowledge index
        hermes/        supervisor: rules engine, review, ask, insight, agent client
        agent/         read-only CRM report API for the Hermes Agent gateway
        knowledge/     knowledge bases & items (feed the AI prompt)
        customers/     CRM list/filter/update, bulk actions, notes
        bots/ + personas
        campaigns/     controlled outbound broadcasts
        dashboard/     summary, performance, closing analytics
        learning/      AI self-learning proposals
        products/ assets/ followups/ quick-replies/ templates
        settings/ audit/ users/ sla/ media
  web/                 Next.js dashboard
    src/app/           login (/) , overview, inbox, accounts, customers,
                       wa-contacts, hermes, campaigns, knowledge, products,
                       assets, learning, analytics, monitoring, bots, templates,
                       audit, admin/users, settings
    src/features/      feature modules (inbox, …) with components/hooks/types
    src/components/    shared UI (AppLayout, Sidebar, ui/* primitives)
    src/lib/           api client (JWT), socket, i18n, hooks
packages/
  database/            Prisma schema + shared client (@sentinel/database)
services/
  hermes-sidecar/      optional FastAPI wrapper around hermes-agent AIAgent
  hermes-agent-skills/ skill definition for the agent to pull CRM reports
docker-compose.yml         local Postgres + Redis (+ full stack)
docker-compose.prod.yml    production stack
```

---

## Roles & access model

Hierarchy: `owner` (4) > `supervisor` (3) > `admin` (2) > `viewer` (1).
Protected via `@UseGuards(JwtAuthGuard)` + `RolesGuard` / `@Roles(...)`.

| Capability | owner | supervisor | admin (CS) | viewer |
|---|:--:|:--:|:--:|:--:|
| Inbox / chat / takeover / send | ✅ | ✅ | ✅ | 👁️ read |
| Accounts, Contacts, Knowledge, Products, Media, Bots, Settings | ✅ | ✅ | ✅ | 👁️ |
| Campaigns | ✅ | ✅ | ✅ | ❌ |
| Monitoring, AI Learning, Audit Log, Team (view) | ✅ | ✅ | ❌ | ❌ |
| Create / delete users | ✅ | ❌ | ❌ | ❌ |

- **No public signup.** Only `owner` creates users (`POST /users`). The first
  owner is created by `npm run db:seed`.

---

## AI provider & models

Two independently configurable models:

- **CS chatbots** → `AI_MODEL` (the customer-facing bots).
- **Hermes supervisor** → `HERMES_MODEL` (review / ask / insight). Empty = reuse
  `AI_MODEL`. Set a stronger model here for better judgement.

Both share `AI_BASE_URL` / `AI_API_KEY` and are editable at runtime in
**Settings → AI** (no redeploy). `GET /ai/models` lists models live from the
provider. Recommended default: Nous Research Hermes models via Nous Portal.

**RAG (optional):** set `AI_EMBED_MODEL` to enable pgvector embeddings on
knowledge items + hybrid keyword/semantic rerank in the prompt builder. Backfill
existing items with `npm run kb:reindex` (requires the `vector` extension).

---

## Hermes Agent integration

The open-source **Hermes Agent** (NousResearch CLI) is layered with this app in
three directions — never as the chatbot brain:

| Direction | Mechanism | Notes |
|---|---|---|
| app → agent (outbound alerts) | `hermes send --to $HERMES_NOTIFY_TARGET` | one integration → Telegram/Slack/Discord/WhatsApp/Signal/SMS/Matrix |
| app → agent (supervisor brain) | sidecar `POST /ask` (`HERMES_SIDECAR_URL`) | `HermesService.ask()`/`botInsight()` use the agent's model+memory; falls back to the plain model |
| **agent → app (pull CRM reports)** | **`GET /agent/crm-report`** + `x-api-key` | read-only, supervisor-scoped; see `services/hermes-agent-skills/crm-report.md` |

The CRM report API is **read-only**: summary, performance, lead funnel, pending
follow-ups, hot leads, knowledge gaps, and alerts. It never mutates data, sends
messages, or touches users/settings. Disabled (returns 503) when `AGENT_API_KEY`
is unset.

---

## Getting started

```bash
# 1. Install all workspaces
npm install

# 2. Configure env
cp .env.example .env        # fill in secrets (DB, AI, JWT, …)

# 3. Start infra (Postgres + Redis)
docker compose up -d

# 4. Database
npm run db:generate         # generate Prisma client
npm run db:migrate          # create/apply schema
npm run db:seed             # create the initial owner user

# 5. Run (two terminals)
npm run dev:api             # http://localhost:3001/api/v1  (Swagger: /api/docs)
npm run dev:web             # http://localhost:3000
```

Then open `http://localhost:3000`, log in as the seeded owner, go to
**/accounts**, add a number, and scan the QR to connect WhatsApp.

---

## Environment variables

Full list in [`.env.example`](./.env.example). Highlights:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis (BullMQ queues, cache) |
| `JWT_SECRET` | Auth token signing |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | CS chatbot provider + model |
| `HERMES_MODEL` | Supervisor model (empty = reuse `AI_MODEL`) |
| `AI_EMBED_MODEL` | Enables RAG embeddings (optional) |
| `WA_SESSION_DIR` / `WA_MEDIA_DIR` | Baileys session + media storage |
| `SECRET_ENCRYPTION_KEY` | Encrypts external product-source credentials at rest |
| `HERMES_NOTIFY_TARGET` / `HERMES_BIN` | Outbound notifications via Hermes Agent |
| `HERMES_SIDECAR_URL` / `HERMES_SIDECAR_TOKEN` | Optional agentic supervision sidecar |
| `AGENT_API_KEY` | Enables the read-only `/agent/crm-report` API |

---

## Commands

```bash
npm install              # install all workspaces
npm run dev:api          # NestJS dev server → /api/v1
npm run dev:web          # Next.js dev server
npm run build            # build all workspaces
npm run lint             # lint all workspaces
npm run test             # source-level QA checks (scripts/qa-check.mjs)

npm run db:generate      # regenerate Prisma client (after schema edits)
npm run db:migrate       # create/apply migrations (needs DATABASE_URL)
npm run db:seed          # seed the initial owner user
npm run kb:reindex       # backfill knowledge-item embeddings (RAG)

docker compose up -d     # local Postgres + Redis
```

Build/test a single workspace: `npm run build --workspace=@sentinel/api`,
`npm run test --workspace=@sentinel/api`, `npm run test --workspace=@sentinel/web`.

---

## API surface

Base prefix `/api/v1`. Swagger/OpenAPI at `/api/docs`.

| Group | Prefix | Notes |
|---|---|---|
| Auth | `/auth` | login, logout, me (JWT) |
| Health | `/health`, `/health/ready` | liveness + readiness |
| WhatsApp accounts | `/wa/accounts` | QR/pairing, restart, health, contacts |
| Conversations | `/conversations` | list, messages, chat ops, search |
| AI engine | `/ai` | reply/draft, summarize, lead-score, models, config |
| Hermes | `/hermes` | alerts, reports, snapshot, ask, bot insight, gaps |
| Knowledge | `/knowledge-bases` | bases + items (feed the prompt) |
| Customers | `/customers` | list/filter/update, bulk actions, export |
| Campaigns | `/campaigns` | draft, preview, approve, monitor |
| Dashboard | `/dashboard` | summary, performance, closing analytics |
| Products / Assets | `/products`, `/assets` | catalog + media library |
| Follow-ups / Quick replies / Templates | `/follow-ups`, … | |
| Learning | `/learning` | AI self-learning proposals |
| Settings / Users / Audit / SLA | `/settings`, `/users`, `/audit` | |
| Agent (machine, read-only) | `/agent` | `x-api-key`; CRM report for Hermes Agent |

---

## Data model

Prisma models (`packages/database/prisma/schema.prisma`): `User`,
`WhatsappAccount`, `Bot`, `Persona`, `KnowledgeBase`, `KnowledgeItem`,
`Customer`, `WhatsappContact`, `Conversation`, `Message`, `HermesReview`,
`FollowUp`, `Campaign`, `CampaignRecipient`, `QuickReply`, `AuditLog`,
`AppSetting`, `LearningProposal`, `Asset`, `Product`, `ProductSource`.

All tables use snake_case in the DB (`@map`/`@@map`) and camelCase in code.

---

## Testing & QA

- Backend unit tests (Jest): `npm run test --workspace=@sentinel/api`
- Frontend tests (Vitest): `npm run test --workspace=@sentinel/web`
- Repo-level source QA: `npm run test` (`scripts/qa-check.mjs`)

---

## Deployment

- Copy `.env.example` → `.env` and replace **all** production secrets.
- Gate promotion on `GET /api/v1/health/ready`.
- Full stack via Docker: `docker compose -f docker-compose.prod.yml up -d`
  (api + web + Postgres + Redis, optional nginx profile).
- Guides: [docs/deployment.md](./docs/deployment.md),
  [docs/vps-deploy.md](./docs/vps-deploy.md),
  [docs/vercel-railway-setup.md](./docs/vercel-railway-setup.md).

---

## Security & hardening

Enabled by default: strict DTO validation, input sanitization, rate limiting,
request IDs + structured logging, security headers, graceful shutdown, and
structured error responses. Secrets for external product sources are encrypted
at rest (`SECRET_ENCRYPTION_KEY`). The machine CRM-report API uses a
constant-time API-key check and fails closed when unconfigured.

---

## Documentation

- [CLAUDE.md](./CLAUDE.md) — architecture & contributor guidance (canonical;
  `AGENTS.md` just points here)
- [docs/OPERATOR_GUIDE.md](./docs/OPERATOR_GUIDE.md) — day-to-day operation
- [docs/deployment.md](./docs/deployment.md) — deploy, migrate, backup, pilot,
  observability, rollback
- [docs/observability.md](./docs/observability.md) — log retention, SLOs,
  alert severity ladder, incident response
- [docs/troubleshooting.md](./docs/troubleshooting.md) — generic local-dev
  fixes (Docker not running, migration drift, QR/session reset, stuck queues)
- [docs/vps-deploy.md](./docs/vps-deploy.md) — bare-VPS deployment walkthrough
- [docs/vercel-railway-setup.md](./docs/vercel-railway-setup.md) — Vercel +
  Railway managed deployment walkthrough
- [PENDING_UI.md](./PENDING_UI.md) — backend endpoints implemented without a
  frontend yet (live backlog)
- [services/hermes-agent-skills/crm-report.md](./services/hermes-agent-skills/crm-report.md) — Hermes Agent CRM report skill

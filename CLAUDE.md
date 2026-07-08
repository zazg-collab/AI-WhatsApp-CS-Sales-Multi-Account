# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hermes AI Sales & Customer Service Control Center** — a semi-automated system for managing multiple WhatsApp chatbots from a single dashboard, with Hermes as an AI supervisor layer sitting above all bots.

The PRD is the source of truth for product scope. Status:
- **Iteration 1 (foundation)** ✅ — monorepo, full Prisma data model, JWT auth, stubbed controllers.
- **Iteration 2 (WhatsApp gateway)** ✅ — Baileys multi-account sessions, QR, receive→persist→live-push, manual reply, takeover, AI-mode toggle.
- **Iteration 3 (AI engine)** ✅ — provider-agnostic, OpenAI-compatible. reply/draft, summarize, lead-score, model listing, and AI_ON auto-reply through Baileys.
- **Iteration 4 (Hermes supervisor)** ✅ — rules engine + LLM review, confidence/risk decision, pre-send gate (supervised) and post-send audit (ai_on), alerts/daily-report/bot-performance/knowledge-gaps.
- **Iteration 5 (Knowledge base + Customer CRM)** ✅ — knowledge-base/items CRUD (feeds the AI prompt), customer list/filter/update, internal notes, unified timeline.
- **Iteration 6 (Chat UI + bot/persona editor)** ✅ — 3-panel dashboard chat UI, draft controls, bot/persona management pages.
- **Iteration 7 (Follow-ups + analytics + nav)** ✅ — follow-up scheduler, sales analytics, and global sidebar navigation.
- **Iteration 8 (Media + audit + CSV)** ✅ — media send/ingest metadata, audit log page, CSV exports.
- **Iteration 9 (User roles + search)** ✅ — user CRUD/password endpoints, role-aware user page/sidebar, conversation search.
- **Iteration 10 (Customer bulk actions)** ✅ — bulk customer stage/tag/admin/note actions with server-side limits and audit logging.
- **Iteration 11 (Controlled campaigns)** ✅ — campaign drafts, recipient preview, approval flow, queued sends, rate limiting, idempotency, and campaign monitoring UI.
- **Iteration 12 (Performance monitoring)** ✅ — response-time metrics, AI quality/fallback stats, campaign delivery rates, and monitoring dashboard.
- **Iteration 13 (Stabilization + QA hardening)** ✅ — campaign duplicate-job guardrails, validated monitoring ranges/status filters, and automated source-level QA checks.
- **Iteration 14 (Deployment readiness)** ✅ — env template, deployment guide, readiness/config health checks, Redis persistence/healthcheck, and pilot checklist.
- **Iteration 15 (API docs + production Docker)** ✅ — Swagger/OpenAPI at /api/docs, production Dockerfiles for api+web, docker-compose full stack, GitHub Actions deploy workflow.
- **Iteration 15b (Production hardening)** ✅ — sanitization, strict validation, rate limiting, structured error responses, request IDs/logging, security headers, graceful shutdown, error boundaries, and DB pool tuning guidance.
- **Iteration 16 (WhatsApp stability + anti-ban)** ✅ — exponential-backoff reconnect with retry cap + alerts, typing-delay + per-account send throttle, periodic session health check, and a per-account health endpoint.
- **Iteration 17 (AI quality)** ✅ — bounded context window with token-budget trimming, customer sentiment analysis, conservative response cache with hit/miss stats, and sentiment/cache-stats endpoints.
- **Iteration 18 (Advanced campaigns)** ✅ — scheduled auto-start, opt-out/blacklist (keyword auto-detect + manual opt-in/out + target exclusion), campaign duplication, and {{name}}/{{phone}} personalization tokens.
- **All PRD section-14 endpoints are now implemented** (no more 501 stubs).
- **RAG / Semantic retrieval** ✅ — pgvector embeddings on knowledge items; hybrid keyword+vector rerank in PromptBuilder; `AI_EMBED_MODEL` env activates; `npm run kb:reindex` for backfill.
- **Deep closing analytics** ✅ — `ClosingAnalyticsService` (modules/dashboard): funnel conversion rates, bot/persona attribution (hot leads, resolution rate, CSAT), win/loss breakdown with daily trend. Stage transitions logged to audit_log by AiService. Frontend: `ClosingAnalytics` component in analytics page.

## Hermes Supervisor

The review gate lives in `modules/hermes`:
- `rules.engine.ts` — deterministic keyword rules (PRD §16: refund→takeover,
  legal/threat→pause_ai, complaint→draft) + confidence gates. "Most
  restrictive decision wins" via `mostRestrictive`/`highestRisk`.
- `HermesService.review()` — merges the rules pass with an LLM judgement
  (`HERMES_SYSTEM` prompt, PRD §15.2), persists a `HermesReview`, and emits a
  `hermes:alert` socket event when the outcome is actionable.
- Integration point is `WaService.maybeAutoReply`:
  - `ai_draft` → store unsent draft (`message:draft`).
  - `ai_supervised` → Hermes reviews **before** send; approve→send,
    draft→hold as draft, block/pause/takeover→pause AI + waiting_admin.
  - `ai_on` → send immediately, then Hermes **post-send** audit links the
    review to the message.
- Dashboards: `/hermes/alerts`, `/hermes/reports/daily`,
  `/hermes/bot-performance`, `/hermes/knowledge-gaps` (detects the AI fallback
  phrase). Web page at `/hermes`.
- **Supervisor assistant** (PRD §8.7): `GET /hermes/snapshot` builds a live
  cross-bot performance snapshot; `POST /hermes/ask {question}` answers admin
  questions grounded in that snapshot (no fabricated numbers). The `/hermes`
  page has a "Tanya Hermes" chat box. This is the conversational supervisor —
  the AI chatbots themselves stay on the custom AI engine.
- **Per-bot deep-dive**: `GET /hermes/bot/:botId/insight` aggregates a bot's
  last 7 days of reviews + knowledge gaps and returns metrics + an LLM analysis
  with concrete fixes (PRD §8.3).
- **Proactive alerts** (`notifications/`, global `NotificationsService`):
  Hermes pushes on pause_ai/takeover/critical reviews; WaService on WhatsApp
  banned/disconnected; AiService on hot/very-hot leads. All fire-and-forget —
  no-op if unconfigured. **Delivery goes through the Hermes Agent gateway**
  (see below), not a hardcoded Telegram call.

## Where Hermes Agent (NousResearch) fits

This repo builds a multi-account CS/Sales platform; **Hermes Agent** is the Nous
Research personal-agent CLI. They are layered, not merged:

| Layer | Owner | Notes |
|---|---|---|
| Chatbot agents (reply to customers) | **custom AI engine** + Baileys | provider-agnostic, unchanged |
| Hermes supervisor (review, scoring, insight, ask) | in-app `modules/hermes` | the PRD's quality/monitoring layer |
| Outbound notifications to many platforms | **Hermes Agent** (`hermes send`) | one integration → Telegram/Discord/Slack/WhatsApp/Signal/SMS/Matrix |

`NotificationsService` shells out to `hermes send --to $HERMES_NOTIFY_TARGET`
(stdin = message body). `hermes send` calls each platform's REST endpoint
directly — no running gateway process needed — and per-platform credentials
live in the Hermes Agent config (`hermes gateway setup`), not in this app.

Why not run the Hermes Agent CLI as the chatbot brain: it is single-user /
personal-assistant shaped (one SOUL.md, one memory, "grows with *you*"), whereas
this app is multi-account, multi-admin, human-in-the-loop CRM. We reuse Hermes
Agent for what it's strong at here — multi-platform outbound messaging — and
keep the custom engine for the bots.

### Agentic supervision sidecar (optional)

`services/hermes-sidecar/` is a FastAPI service wrapping hermes-agent's
`AIAgent` (`from run_agent import AIAgent`). When `HERMES_SIDECAR_URL` is set,
`HermesService.ask()` and `botInsight()` route through it (`POST /ask`) so the
*supervisor* uses Hermes Agent's model + memory + skills. `HermesAgentClient`
returns null on any failure, so the backend transparently falls back to the
plain `AiProviderService`. The customer chatbots never use the sidecar.
Run it in the same Python env that has hermes-agent installed; see the
sidecar README.

## AI Provider (provider-agnostic)

The AI engine targets any **OpenAI-compatible** endpoint, selected purely by env:
`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Works with OpenAI, OpenRouter, Ollama,
LM Studio, vLLM, etc. `GET /ai/models` lists models from `{AI_BASE_URL}/models`;
`GET /ai/config` returns the base URL + default model (no secrets).

**Default brain: Nous Research Hermes models** via Nous Portal
(`https://inference-api.nousresearch.com/v1`, models `Hermes-4-70B` /
`Hermes-4.3-36B` / `Hermes-4-405B`). Because the engine is OpenAI-compatible,
this is pure config — no code change. The local Nous subscription proxy
(`http://127.0.0.1:8645/v1`) also works.

> Naming note: the in-app **"Hermes supervisor"** module (`modules/hermes`) is
> the PRD's review/quality layer — distinct from **Hermes Agent** (the Nous
> Research CLI). We use Hermes *models* as the brain, not the Hermes Agent CLI
> runtime. The Soul.md / provider-agnostic concepts in this repo are inspired
> by Hermes Agent; running its CLI as the orchestrator was rejected because it
> is single-user/personal-assistant shaped, whereas this app is a multi-account
> multi-admin CRM platform.
- `AiProviderService` — low-level HTTP (`chat`, `listModels`) via native fetch.
- `PromptBuilderService` — assembles the PRD §15.1 system prompt (Soul.md +
  active knowledge items + customer memory) followed by mapped chat history.
  Knowledge retrieval is **hybrid**: when `AI_EMBED_MODEL` is set, top-K items
  are chosen by combining semantic similarity (pgvector) with keyword overlap;
  otherwise it falls back to keyword-only scoring (no behaviour change).
- `EmbeddingService` / `KnowledgeIndexService` (`modules/ai`) — RAG layer.
  `EmbeddingService` calls the OpenAI-compatible `/embeddings` endpoint;
  `KnowledgeIndexService` writes item vectors (best-effort, on KB create/update,
  hash-skipped) and runs cosine top-K search. Both no-op when `AI_EMBED_MODEL`
  is empty. Backfill existing items with `npm run kb:reindex`; pgvector schema
  ships in migration `20_knowledge_embeddings` (requires the `vector` extension).
- `AiService` — `generateReply`, `summarizeChat`, `leadScore` (persists score
  + stage to the customer). Lead-score parsing tolerates fenced/prose JSON.
- Auto-reply lives in `WaService.maybeAutoReply`: fires only when conversation
  `aiMode === ai_on` and not under admin takeover. Draft/supervised modes are
  not auto-sent (reserved for the Hermes gate).

## Commands

```bash
npm install              # install all workspaces
npm run db:generate      # regenerate Prisma client (after schema edits)
npm run db:migrate       # create/apply migrations (needs DATABASE_URL + running Postgres)
npm run db:seed          # seed initial owner user
npm run dev:api          # NestJS dev server → http://localhost:3001/api/v1
npm run dev:web          # Next.js dev server → http://localhost:3000
npm run build            # build all workspaces
docker compose up -d     # local Postgres + Redis
```

Build a single workspace: `npm run build --workspace=@sentinel/api` (or `@sentinel/web`).

## Repository Layout

```
apps/api/        NestJS backend. Global prefix /api/v1. Each feature lives in
                 modules/<name>/ with its own *.module.ts, *.controller.ts,
                 *.service.ts, dto/, and co-located *.spec.ts. Modules:
                   agent, ai, assets, audit, bots, campaigns, conversations,
                   customers, dashboard, followups, hermes, knowledge,
                   learning, media, products, quick-replies, settings, sla,
                   users, wa.
                 Cross-cutting at src root: auth/, common/, notifications/,
                 prisma/, realtime/, i18n/, scripts/, health.controller.ts.
  realtime/        Socket.IO hub (EventsGateway), namespace /events. Emits
                   wa:status, wa:qr, message:new.
  modules/wa/      WaService manages one Baileys connection per account
                   (sessions Map, auth persisted to WA_SESSION_DIR, auto-
                   reconnect). Decomposed into focused sub-services:
                   wa-send, wa-inbound, wa-mirror, message-ingest,
                   contact-sync, auto-assign. wa.util has jid/phone helpers +
                   humanDelay (anti-ban). See wa/BACKEND_REFACTORING.md.
apps/web/        Next.js (App Router) + Tailwind. Routes under src/app/*.
                 src/lib/api.ts (JWT), src/lib/socket.ts (live).
packages/database/  Prisma schema (all PRD tables) + shared client. Import
                 from '@sentinel/database'.
```

### Conventions
- Auth: `@UseGuards(JwtAuthGuard)` for any protected route; add `RolesGuard` + `@Roles('owner', ...)` for role restrictions. Get the caller via `@CurrentUser()`.
- **Authorization scope (deliberate):** access control is **role-based, not object-ownership-based** — most mutations authorize by role, not by "does this user own this account/conversation". This is intentional for the **single-instance, single-tenant** deployment (one org per instance), where every authenticated admin is trusted across all accounts. **If this ever goes multi-tenant, this becomes a Critical gap**: every account-scoped route would need an ownership/tenant check. Treat that boundary as a conscious decision, not an oversight.
- The active knowledge items of a bot's knowledge base are injected into the AI prompt by `PromptBuilderService` (only `status: active` and within `validUntil`). Editing knowledge immediately changes AI answers.
- All Prisma tables use `@map`/`@@map` snake_case in DB but camelCase in code.

### Frontend Conventions (React/Next.js)
> **Migration status (partial):** the target architecture below is fully
> realized only in `features/inbox` and `features/landing`. Most other routes
> are still fat `app/<route>/page.tsx` files that fetch + manage state inline
> (some with a co-located `use<Feature>.ts`). When you touch one of those
> screens, migrate it toward the pattern below rather than extending the old
> shape. Do not assume a `features/` module exists for a given screen — check.
- **Feature modules**: `apps/web/src/features/[feature]/` contain `components/`, `hooks/`, `[feature].types.ts`. Each feature is self-contained and exports a public API via `index.ts`.
- **Shared data-fetching**: Use `useApiQuery<T>(path)` from `lib/hooks/useApiQuery.ts` to fetch and cache data (returns `{ data, loading, error, refetch }`). Do not directly call `api()` with inline state management.
- **Pages** (`app/*/page.tsx`) are thin shells: they route-param lookup, render a feature component, and nothing else. No page should exceed 400 lines.
- **Types**: Domain types live in `[feature].types.ts` alongside components. Shared types → `lib/types.ts`.
- **Socket.IO**: Use `getSocket()` from `lib/socket.ts` for live updates; emit/listen inside feature hooks, not inside components.

## Planned Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, Tailwind CSS, Socket.IO Client |
| Backend | Node.js, NestJS, Socket.IO, BullMQ |
| Database | PostgreSQL (via Supabase), Redis |
| WhatsApp Gateway | Baileys (preferred for MVP), GOWA |
| AI Provider | Claude API (primary), OpenAI API (fallback) |
| Vector/Embeddings | pgvector / Supabase Vector |
| Storage | Supabase Storage |
| Notifications | Telegram Bot, WhatsApp internal group |

## Architecture

```
[Customer WhatsApp]
      ↓
[WhatsApp Gateway: Baileys]
      ↓
[Message Receiver Service]
      ↓
[Database + Chat History]
      ↓
[AI Chatbot Engine]  ←── Soul.md (persona) + Product Knowledge + Customer Memory
      ↓
[Hermes Supervisor Engine]  ←── Rules Engine + Risk Checker
      ↓
[Send Message Service]
      ↓
[Customer WhatsApp]

[Admin Dashboard (Next.js)]
      ↕ WebSocket (Socket.IO)
[Backend API (NestJS)]
      ↕
[PostgreSQL + Redis]
      ↕
[Hermes Monitoring Dashboard]
```

### Key Concepts

**AI Modes (per conversation/account):**
- `AI_ON` — bot replies automatically
- `AI_OFF` — all replies are manual
- `AI_DRAFT` — bot generates draft, admin sends
- `AI_SUPERVISED` — Hermes reviews before sending
- `AI_PAUSED` — bot stopped due to detected risk

**Hermes Decision Output (always JSON):**
```json
{
  "decision": "approve|draft|block|pause_ai|takeover_required",
  "confidence_score": 0-100,
  "risk_score": 0-100,
  "risk_level": "low|medium|high|critical",
  "reason": "...",
  "recommendation": "..."
}
```
- `confidence >= 90` → auto-send
- `confidence 70–89` → light supervision
- `confidence 50–69` → draft only
- `confidence < 50` → block, admin required

**Hermes operates in two modes:**
1. **Pre-Send Supervisor** — checks before message is sent (for sensitive chats)
2. **Post-Send Auditor** — scores quality after sending (for routine chats)

**Lead Scoring:**
- 0–30 Cold, 31–60 Warm, 61–80 Hot, 81–100 Very Hot
- Triggers: price inquiry, stock check, payment method ask, sending personal data, booking/DP request

## Core Data Models

Key tables: `users`, `whatsapp_accounts`, `bots`, `personas`, `knowledge_bases`, `knowledge_items`, `customers`, `conversations`, `messages`, `hermes_reviews`, `follow_ups`, `audit_logs`.

`messages.sender_type`: `customer | admin | ai | system | hermes`

`hermes_reviews.decision`: `approve | draft | block | pause_ai | takeover_required`

## API Structure

Base prefix: `/api/v1`

| Group | Prefix |
|---|---|
| Auth | `/auth` |
| WhatsApp Accounts | `/wa/accounts` |
| Conversations | `/conversations` |
| AI Engine | `/ai` |
| Hermes | `/hermes` |
| Knowledge Base | `/knowledge-bases` |
| Customers | `/customers` |

## System Prompt Templates

**Bot prompt** uses these injected variables: `{{SOUL_MD}}`, `{{PRODUCT_KNOWLEDGE}}`, `{{MARKETING_FLOW}}`, `{{CUSTOMER_MEMORY}}`, `{{CHAT_HISTORY}}`.

**Hermes prompt** receives: draft answer, chat history, product knowledge, persona, SOP, customer memory — and must output the JSON schema above.

Bot rule: if knowledge doesn't cover a question, respond with: *"Untuk info tersebut saya bantu konfirmasi dulu ke admin ya kak."* — never fabricate data.

## MVP Scope

Phase 1 (build first):
1. Auth + role system (owner, supervisor, admin, viewer)
2. Multi WhatsApp account management (Baileys, QR scan, session persistence)
3. Chat UI (WhatsApp Web-style: left list / center chat / right customer panel)
4. Manual send/receive + media handling
5. AI ON/OFF toggle per customer
6. AI Draft mode
7. Human takeover + return-to-AI
8. Product knowledge editor (simple CRUD)
9. Soul/persona editor
10. Hermes basic review (confidence + risk score)
11. Lead scoring + auto-tagging
12. Customer notes + internal notes
13. Basic sales dashboard

**Not in MVP:** voice note AI, deep closing analytics, AI self-learning, mobile native app, OCR payment proof, omnichannel beyond WhatsApp.

## WhatsApp Gateway Notes

- Use Baileys for MVP (flexible, low cost)
- Always apply human-like send delays to avoid bans
- Rate-limit outbound messages; avoid broadcast-style sends
- Customer bulk actions are safe CRM mutations only. For campaign/broadcast work,
  build a controlled queue first: owner/supervisor approval, per-account rate
  limits, randomized human delay, opt-out/blocked-customer exclusion, idempotency,
  and audit logging.
- Implement auto-reconnect and QR refresh handling
- Never send duplicate messages (idempotency check required)

## Performance Targets

- Incoming message → dashboard display: < 2s
- AI draft generation: < 10s
- Auto-reply sent: < 15s
- Dashboard initial load: < 5s

## Audit skills

Local audit skills live under `.agents/skills/` (registered in `skills-lock.json`):

- **`fullstack-ai-slop-audit`** — backend + frontend + AI layer + security +
  database + production readiness.
- **`frontend-uiux-ai-slop-audit`** — frontend/UI-UX only: dashboards, landing
  pages, forms, tables/lists, chat UI, microcopy, responsive behavior,
  accessibility, and component-system quality. Use this before merging changes
  that affect page layout, admin dashboards, chat/conversation UI, forms,
  tables/lists, component systems, responsive behavior, accessibility, or microcopy.
- **`hermes-salesops-enterprise-uiux`** — Hermes-specific enterprise UI/UX
  audit skill for WhatsApp/Baileys account health, QR/reconnect/session states,
  chat/inbox, right intelligence panels, analytics, settings, responsive
  behavior, overlays/dropdowns, and anti-AI-slop SalesOps presentation.
- **`hermes-fullstack-contract-audit`** — Hermes-specific frontend/backend
  contract audit skill. Use it to verify that every frontend feature, button,
  chart, setting, AI/Hermes control, campaign workflow, and Baileys/WhatsApp
  operation is backed by real backend APIs, DTO validation, auth/roles,
  persistence, realtime events, and tests rather than stubs, mocks, TODOs, fake
  data, or frontend-only state.
- **`workflow-uiux-optimization-audit`** — workflow practicality skill (distinct
  from visual-design and contract audits). It audits the *sequence and effort* of
  a task and finds simpler paths: manual entry of data the system already knows
  (auto-fill candidates), form-before-action ordering that should be action-first,
  manual lookups that could be smart defaults/suggestions, redundant/premature
  steps, and invisible save/progress state. The reference win is account-add:
  scan first → name + number auto-fill from device metadata instead of typing them
  up front. Optimizations must be wired to real reachable data and always keep an
  editable, clearly-labeled override; destructive/outbound confirms stay (the
  improvement there is showing impact, not removing the gate).

Claude Code install mirrors live under `.claude/skills/`. Use:
- `/hermes-uiux-audit` for a full no-edit audit report.
- `/hermes-uiux-implement` when the user explicitly wants P0/P1 UI fixes applied.
- `/hermes-contract-audit` for a no-edit frontend/backend contract audit.
- `/hermes-contract-implement` when the user explicitly wants P0/P1 contract
  fixes applied.
- `/workflow-uiux-audit` for a no-edit workflow-friction audit (before/after step
  counts + prioritized practical optimizations).
- `/workflow-uiux-implement` when the user explicitly wants P0/P1 workflow
  optimizations applied (action-first flows, auto-fill, smart defaults, feedback).

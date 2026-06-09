# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hermes AI Sales & Customer Service Control Center** — a semi-automated system for managing multiple WhatsApp chatbots from a single dashboard, with Hermes as an AI supervisor layer sitting above all bots.

The PRD is the source of truth for product scope. Status:
- **Iteration 1 (foundation)** ✅ — monorepo, full Prisma data model, JWT auth, stubbed controllers.
- **Iteration 2 (WhatsApp gateway)** ✅ — Baileys multi-account sessions, QR, receive→persist→live-push, manual reply, takeover, AI-mode toggle.
- **Iteration 3 (AI engine)** ✅ — provider-agnostic, OpenAI-compatible. reply/draft, summarize, lead-score, model listing, and AI_ON auto-reply through Baileys.
- **Iteration 4 (Hermes supervisor)** ✅ — rules engine + LLM review, confidence/risk decision, pre-send gate (supervised) and post-send audit (ai_on), alerts/daily-report/bot-performance/knowledge-gaps.
- **Not yet implemented**: knowledge base CRUD (`/knowledge*`), customers CRM endpoints (`/customers/*`) — still stubbed (501).

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

## AI Provider (provider-agnostic)

The AI engine targets any **OpenAI-compatible** endpoint, selected purely by env:
`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`. Works with OpenAI, OpenRouter, Ollama,
LM Studio, vLLM, etc. `GET /ai/models` lists models from `{AI_BASE_URL}/models`;
`GET /ai/config` returns the base URL + default model (no secrets).
- `AiProviderService` — low-level HTTP (`chat`, `listModels`) via native fetch.
- `PromptBuilderService` — assembles the PRD §15.1 system prompt (Soul.md +
  active knowledge items + customer memory) followed by mapped chat history.
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

Build a single workspace: `npm run build --workspace=@hermes/api` (or `@hermes/web`).

## Repository Layout

```
apps/api/        NestJS backend. Global prefix /api/v1. Real: auth, wa
                 (Baileys gateway), conversations. Stubbed (501) via
                 common/not-implemented.ts: ai, hermes, knowledge, customers.
  realtime/        Socket.IO hub (EventsGateway), namespace /events. Emits
                   wa:status, wa:qr, message:new.
  modules/wa/      WaService manages one Baileys connection per account
                   (sessions Map, auth persisted to WA_SESSION_DIR, auto-
                   reconnect). MessageIngestService upserts customer +
                   conversation + message on inbound. wa.util has jid/phone
                   helpers + humanDelay (anti-ban).
apps/web/        Next.js (App Router) + Tailwind. Pages: / (login),
                 /accounts (add account + live QR scan), /dashboard (3-panel
                 placeholder). src/lib/api.ts (JWT), src/lib/socket.ts (live).
packages/database/  Prisma schema (all 12 PRD tables) + shared client. Import
                 from '@hermes/database'.
```

### Conventions
- Stubbed endpoints throw `NotImplemented('operation')` (501), not silent empties — so "stubbed" is distinguishable from "broken". Replace these as features land.
- Auth: `@UseGuards(JwtAuthGuard)` for any protected route; add `RolesGuard` + `@Roles('owner', ...)` for role restrictions. Get the caller via `@CurrentUser()`.
- All Prisma tables use `@map`/`@@map` snake_case in DB but camelCase in code.

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
- Implement auto-reconnect and QR refresh handling
- Never send duplicate messages (idempotency check required)

## Performance Targets

- Incoming message → dashboard display: < 2s
- AI draft generation: < 10s
- Auto-reply sent: < 15s
- Dashboard initial load: < 5s

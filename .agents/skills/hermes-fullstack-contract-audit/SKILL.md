---
name: hermes-fullstack-contract-audit
description: Audit Hermes frontend features against real backend implementation to eliminate AI slop, fake UI, stubs, mocks, 501/TODO endpoints, incomplete controllers, missing DTO validation, missing persistence, and frontend/backend contract drift. Use when checking whether UI/UX pages, buttons, states, analytics, Baileys/WhatsApp controls, campaigns, Hermes AI review, settings, and admin workflows are actually backed by implemented APIs and database logic.
---

# Hermes Fullstack Contract Audit

Use this skill to verify that every Hermes frontend feature is backed by real backend behavior, not a pretty UI over stubs, fake data, TODOs, or incomplete APIs.

The audit must connect UI/UX, API contract, backend service logic, database persistence, auth/role rules, async jobs, realtime events, and error states. A feature is not complete until the frontend action maps to a real backend endpoint that validates input, enforces permissions, persists or performs the intended action, handles failures, and returns a response the UI can truthfully represent.

For a full reusable prompt, read `references/full-contract-audit-prompt.md`.

## Core Rule

Do not approve a frontend feature because it appears in the UI.

Approve only when this chain is real:

```text
UI route/component -> API client function -> backend route/controller -> DTO validation -> service/use-case -> database/external provider/job -> response shape -> UI states -> tests or verification
```

If any link is missing, mark the feature as one of:

- `implemented`
- `partial`
- `frontend-only`
- `backend-stub`
- `contract-mismatch`
- `unsafe`
- `unknown`

## Audit Workflow

1. Inventory frontend routes, pages, forms, buttons, tables, cards, charts, settings, chat controls, and action menus under `apps/web`.
2. Inventory API client calls, fetch wrappers, socket events, and hardcoded paths under the frontend.
3. Inventory backend controllers, routes, DTOs, services, queues, events, guards, Prisma calls, and tests under `apps/api` and `packages/database`.
4. Build a feature contract matrix that maps each frontend feature to its backend implementation.
5. Search explicitly for stubs, mocks, TODOs, placeholders, fake data, and dead UI.
6. Check backend completeness: validation, auth/roles, object-level access, persistence, errors, idempotency, audit logs, realtime updates, and tests.
7. Check UI honesty: if backend is missing or partial, the UI must show disabled/read-only/backlog/unavailable states instead of pretending the feature works.
8. Prioritize fixes where users can send messages, approve campaigns, change AI modes, edit customers, modify settings, or trigger risky operations.

## Required Searches

Use `rg` or equivalent searches before judging completeness:

```text
501|NotImplemented|not implemented|TODO|FIXME|stub|mock|fake|placeholder|coming soon|return \[\]|return null|Promise.resolve|setTimeout|sample|dummy|hardcoded
```

Also search for frontend-only data and optimistic illusions:

```text
mockData|sampleData|const .* = \[|localStorage|sessionStorage|TODO API|fakeApi|demo
```

For NestJS backend, inspect:

- `*.controller.ts`
- `*.service.ts`
- `dto/*.ts`
- guards and roles decorators
- queue/job processors
- gateway/socket events
- Prisma schema and migrations
- tests and QA scripts

For Next.js frontend, inspect:

- `app/**/page.tsx`
- shared layouts/navigation
- `src/lib/api.ts`
- hooks and feature clients
- forms, modals, tables, charts, chat components
- loading/error/empty states

## Feature Contract Matrix

Every audit must include a matrix like:

```text
Feature:
Frontend location:
User action:
API client call:
Backend endpoint:
Controller/service:
DTO/validation:
Auth/role guard:
Database/external side effect:
Realtime/socket event:
Error states exposed to UI:
Tests/verification:
Status: implemented / partial / frontend-only / backend-stub / contract-mismatch / unsafe / unknown
Fix:
```

## Stub And Slop Signals

Flag backend slop when:

- route exists but returns static data.
- route returns `501`, placeholder text, empty arrays, or fake success.
- controller exists without real service logic.
- service method returns mock objects or no-ops.
- DTOs are missing or too loose.
- backend trusts frontend validation.
- status changes are only local UI state.
- database schema has no place to persist the displayed state.
- action has no audit log despite being important.
- send/approve/update action has no idempotency or duplicate guard.
- external provider errors are swallowed.
- role guard is missing on protected or admin routes.
- frontend calls an endpoint that does not exist.
- backend response shape differs from frontend assumptions.
- UI shows settings toggles that are not persisted or read by backend.
- analytics chart uses fake/client-only numbers.

Flag frontend/backend contract drift when:

- endpoint method/path differs from API client.
- request body field names do not match DTOs.
- enums differ between UI and backend.
- backend status lifecycle is richer than UI shows.
- UI expects fields backend never returns.
- UI hides role restrictions but backend still allows the action.
- backend forbids an action but UI gives no disabled reason.
- realtime event payload differs from UI listener expectations.

## Hermes-Specific Critical Flows

Audit these as P0/P1 first:

- WhatsApp/Baileys account connect, QR refresh, reconnect, health, session, banned/logged-out/disconnected state.
- Message send, media send, failed send retry, manual reply, AI auto-reply, AI draft, supervised send, AI pause, takeover, return-to-AI.
- Conversation search, conversation status, unread/waiting state, socket updates.
- Customer CRUD, stage/tag/admin/note update, bulk actions, opt-in/out.
- Campaign draft, recipient preview, exclusions, approval, duplicate, queue, scheduled start, rate limit, idempotency, monitoring.
- Hermes review, alerts, daily report, bot performance, knowledge gaps, snapshot, ask, bot insight.
- Knowledge base CRUD and active/expired filtering in prompts.
- Bot/persona editor and how changes affect AI prompt behavior.
- Monitoring analytics, response time, AI quality, fallback stats, campaign delivery.
- Admin user CRUD, password change, role restrictions.
- Audit logs and CSV exports.
- Settings/configuration surfaces, especially AI provider, Hermes thresholds, WhatsApp gateway, notifications, campaign safety, and security.

## UI/UX Alignment Rules

If backend is not implemented:

- do not present the control as working.
- show a disabled state with a clear reason.
- mark as read-only health/config if backend can only report state.
- add a backlog/requires-backend note in audit output.
- avoid fake success toasts.

If backend is partial:

- expose only the working subset.
- show missing states honestly.
- do not let users trigger irreversible actions through partial endpoints.
- add clear recovery paths for API errors.

If backend is implemented:

- ensure the UI shows loading, success, error, empty, permission-denied, retry, failed, disconnected, and stale states where relevant.
- ensure response fields are typed and not guessed.
- ensure destructive/risky actions have confirmation and audit trails.

## Backend Completeness Checklist

For each endpoint or service, verify:

- method/path matches frontend.
- request DTO validates required fields, enums, lengths, numbers, dates, IDs, and nested data.
- response shape is consistent and typed.
- errors are structured.
- auth guard exists.
- role guard exists for owner/supervisor/admin/viewer restrictions.
- object-level access is enforced where needed.
- Prisma/database persistence is real.
- external provider side effects are bounded by timeout/retry.
- send/campaign actions are idempotent.
- audit log exists for high-impact actions.
- realtime/socket event is emitted when UI depends on live updates.
- tests or QA checks exist for critical behavior.

## AI No-Slop Backend Checklist

For AI/Hermes flows, verify:

- prompt inputs come from real DB state, active knowledge, customer memory, and chat history.
- inactive/expired knowledge is excluded.
- AI fallback phrase is enforced when knowledge is missing.
- AI response parsing is robust against fenced/prose JSON.
- hallucination-prone actions go to draft/review, not silent auto-send.
- Hermes decision affects behavior, not just display.
- post-send audit links to the sent message.
- prompt injection from customer messages cannot override system rules.
- provider failures result in safe UI/backend states.
- AI config endpoints never leak secrets.

## Analytics And Settings Contract

Analytics is valid only if metrics are computed from real backend/database data or clearly marked unavailable.

Check:

- chart data endpoints exist.
- filters match backend query params.
- date ranges are validated.
- status filters match backend enums.
- loading/error/empty states are truthful.
- no fake numbers remain in frontend.

Settings are valid only if controls are persisted or wired to real config. If not, render them as read-only status or recommended backlog, not working toggles.

## Output Format

Use this format:

```text
Hermes Fullstack Contract / AI No-Slop Audit

Overall Verdict: approve / revise / block / not-production-ready
Overall Contract Risk: Low / Medium / High / Critical

Executive Summary:
- ...

P0 Contract Breaks:
1. ...

P1 Backend/UI Mismatches:
1. ...

Stub / Fake / Placeholder Findings:
- ...

Feature Contract Matrix:
- Feature:
  Frontend:
  Backend:
  Persistence:
  Auth/Role:
  UI states:
  Status:
  Fix:

Backend Completeness:
- ...

Frontend Honesty / UI Alignment:
- ...

AI/Hermes No-Slop Findings:
- ...

Baileys/WhatsApp Contract Findings:
- ...

Analytics Contract Findings:
- ...

Settings Contract Findings:
- ...

Tests / Verification Gaps:
- ...

Implementation Plan:
1. P0:
2. P1:
3. P2:

Final Verdict:
```

Block the feature if the UI can make users believe a risky action works while the backend is missing, stubbed, unauthenticated, unvalidated, or not persisted.

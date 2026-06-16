---
name: hermes-salesops-enterprise-uiux
description: Audit and redesign the Hermes AI Sales & Customer Service Control Center UI/UX into premium enterprise SalesOps quality. Use for WhatsApp/Baileys account pages, QR/reconnect/session health, chat/inbox, right intelligence panels, Hermes review, campaigns, analytics, settings, responsive layouts, accessibility, micro-interactions, and anti-AI-slop frontend reviews.
---

# Hermes SalesOps Enterprise UI/UX

Use this skill to audit, redesign, or implement the Hermes web UI so it feels like a paid enterprise WhatsApp SalesOps control center, not a generic AI dashboard.

The target product feel is: calm enterprise workspace, dark navy navigation, white operational surfaces, teal primary actions, risk-aware status colors, WhatsApp-familiar chat, decision-first analytics, and precise Indonesian/English microcopy.

For a complete reusable user prompt, read `references/full-audit-prompt.md`.

## Workflow

1. Inspect the current frontend routes, components, shared UI primitives, API client, and page-level state handling before judging the UI.
2. Map every page to a user job: owner, supervisor, admin, viewer, CS, sales, or operator.
3. Audit product fit, hierarchy, responsive behavior, state completeness, accessibility, and implementation maintainability.
4. Treat Baileys/WhatsApp operational states as first-class UX, not backend noise.
5. Propose or implement fixes page by page, prioritizing workflows where admins can miss risk, mis-send messages, mis-approve campaigns, or lose account connectivity.
6. Verify visually across breakpoints whenever a local app can be run.

## Enterprise Standard

Do not approve UI because it looks modern. Approve only when it helps the user decide what to do next.

Every screen must answer:

- What needs attention now?
- What changed recently?
- What is blocked, risky, failed, or pending?
- What should the admin do next?
- What can go wrong if the user misunderstands this screen?

Reject these AI-slop patterns:

- generic SaaS copy, vague AI hype, decorative gradients, glassmorphism, random cards, vanity metrics, hidden risk states, happy-path-only pages, inaccessible controls, tables squeezed onto mobile, and dropdowns/popovers that get stuck.

## Visual System

Use this direction unless the existing design system has stronger local conventions:

- Background `#F8FAFC`, surface `#FFFFFF`, soft surface `#F1F5F9`, border `#E2E8F0`.
- Sidebar `#0F172A`, sidebar hover `#1E293B`, active/accent `#14B8A6`.
- Text primary `#111827`, secondary `#475569`, muted `#94A3B8`.
- Primary action `#0F766E`, hover `#115E59`, soft `#CCFBF1`.
- Info blue for neutral AI/review information.
- Green for healthy/connected/success.
- Amber for pending/review/caution.
- Red for failed/blocked/danger.
- Dark red for critical/takeover/banned/legal/refund risk.

Typography should stay operational: page title 24-28px, section title 16-18px, card title 14-16px, body 14px, meta 12-13px. Avoid oversized marketing type inside dashboards.

## Required Domain Components

Prefer reusable domain components over one-off cards:

- `WhatsAppAccountStatus`
- `ReconnectAccountBanner`
- `QrPairingPanel`
- `SessionHealthIndicator`
- `SendThrottleBadge`
- `ConversationHealthIndicator`
- `LeadPriorityBadge`
- `RiskBadge`
- `AIReviewCard`
- `NextBestActionCard`
- `CustomerIntentTag`
- `FollowUpReminder`
- `FailedSendBanner`
- `CampaignApprovalCard`
- `KnowledgeGapAlert`
- `CustomerContextPanel`
- `SalesIntelligencePanel`
- `ReviewQueueItem`

Generic UI primitives still matter: `Button`, `Input`, `Card`, `Table`, `Modal`, `Tabs`, `Dropdown`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `Toast`, `Badge`.

## Baileys And WhatsApp UX Audit

Audit Baileys features by how clearly they explain account health to operators.

Account pages should expose:

- connected, connecting, QR required, QR expired, reconnecting, disconnected, logged out, banned/suspected banned, rate-limited, degraded, and healthy states.
- last inbound message, last outbound message, last successful send, last reconnect attempt, retry count, and current queue state when available.
- QR scan panel with expiry, refresh guidance, loading, expired, copied, scanned, pairing success, and failure states.
- reconnect action with progress, disabled reason, retry guidance, and non-technical explanation.
- per-account health summary: session, socket, message send, receive ingest, media ingest, queue, and alert status.
- anti-ban controls/status: typing delay, send throttle, campaign rate limit, cooldown, randomized delay, and blocked duplicate send warnings.
- failed send recovery: retry, copy message, view reason, switch account when allowed, or escalate to admin.

Do not leak raw technical detail as the primary copy. Translate it into operator language, with expandable technical details for debugging.

Good copy:

- `Akun perlu scan ulang. QR sebelumnya sudah kedaluwarsa.`
- `Pengiriman ditahan 42 detik untuk menjaga rate limit akun.`
- `3 pesan gagal terkirim. Coba ulang setelah koneksi akun stabil.`
- `Akun terputus 4 menit lalu. Reconnect otomatis sedang berjalan.`

## Page Blueprint

Use this as the expected shape of each major page.

### Login

Make trust and product purpose obvious. CTA should be `Masuk ke Dashboard`, not generic `Submit`. Show protected workflows: multi-account WhatsApp, controlled campaign approval, AI review, human takeover, audit log.

### Dashboard

Lead with `Needs Attention`, not vanity numbers. First viewport should prioritize waiting replies, hot leads, risky AI replies, disconnected accounts, failed sends, pending campaign approvals, knowledge gaps, and follow-ups due.

### Inbox / Chat

Desktop uses three panels:

- left: inbox list, account filter, priority, unread/waiting status.
- center: WhatsApp-like thread, message states, composer, draft/review/send controls.
- right: sales intelligence, risk, AI review, customer context, knowledge source, notes, follow-up.

Make these states unmistakable: AI mode, takeover, paused AI, supervised, draft, failed send, internal note, customer message, admin message, AI sent, media attachment, retryable send.

### Accounts / Baileys

Use an account health operations page, not a flat list. Each account needs status, phone/name, connected bot, last activity, queue/send throttle, QR/reconnect action, session warning, and recent incidents.

### Customers / CRM

Prioritize lead stage, last intent, waiting time, owner/admin, tags, opt-out status, follow-up due, and safe bulk actions. Mobile should become scannable customer cards.

### Campaigns

Show campaign lifecycle clearly: draft, preview recipients, exclusions, approval, queued, sending, completed, failed, paused. Show opt-out exclusions, duplicate guards, rate limiting, idempotency, and per-account delivery.

### Hermes

Separate urgent review work from reporting. Alerts and review queue should show risk, decision, reason, recommendation, related conversation, and next action. Knowledge gaps should point to missing source content.

### Knowledge Base And Persona

Show which knowledge items are active, expired, draft, and used by bots. Editing knowledge should feel operational: source, validity, bot coverage, confidence impact, and preview of how answers change.

### Analytics / Monitoring

Analytics is acceptable only when decision-first. It should include:

- operational SLA: waiting replies, response time, first response, unresolved conversations.
- WhatsApp reliability: reconnects, disconnected time, failed sends, throttled sends, queue backlog.
- AI quality: draft acceptance, review decisions, risk rate, fallback phrase rate, sentiment, cache hit/miss, hallucination-risk signals if available.
- sales: hot leads, stage movement, follow-up completion, campaign conversion signals.
- campaign delivery: sent, delivered/read if available, failed, opt-out, excluded, duplicate prevented, per-account rate.

Each chart needs interpretation and a next action. Filters should include date range, account, bot, campaign, channel/status, and owner where relevant.

### Admin Users

Roles and permissions must be clear. Dangerous changes need confirmation. Viewer/admin/supervisor/owner limits should be visible in disabled states and permission-denied screens.

### Audit Logs

Make logs searchable and reviewable. Show actor, action, target, time, result, risk level, IP/device if available, and filters for destructive or high-risk actions.

### Settings

Settings should not be a junk drawer. Recommended sections:

- Organization: business profile, timezone, language, working hours.
- WhatsApp Gateway: Baileys session path/status, reconnect policy, QR refresh, send throttle, typing delay, media limits.
- AI Provider: base URL, model, test connection, timeout, fallback behavior, no exposed secrets.
- Hermes Supervisor: thresholds, risky keywords, confidence gates, review modes, pause/takeover policy.
- Notifications: Hermes Agent target, alert channels, alert severity.
- Campaign Safety: approval rules, opt-out keywords, rate limits, cooldown, duplicate protection.
- Security: roles, sessions, password policy, audit retention.
- Data/Exports: CSV export policy, retention, backup/readiness health.

## Responsive Rules

Check at 375, 430, 768, 1024, 1280, and 1440px+.

Desktop:

- use full app shell with sidebar.
- chat can use 3 panels.
- right panel width should be stable, usually 360-420px.

Tablet:

- preserve chat as primary.
- collapse left inbox into a drawer or narrower list.
- convert right intelligence panel into tabs, drawer, or split details panel.
- never squeeze three desktop panels equally.

Mobile:

- use a route-like flow: inbox list -> conversation -> details/review.
- right panel becomes bottom sheet, full-screen drawer, or tabs such as `Info`, `Review`, `Customer`, `Activity`.
- keep AI mode, risk, and customer status visible in compact header.
- composer must not cover the latest message.
- tables become cards or deliberately scrollable areas with clear affordance.

## Interaction And Overlay Rules

Audit every dropdown, popover, modal, tooltip, context menu, date picker, select, drawer, toast, and chat bubble action menu.

Dropdown/popover rules:

- close on outside click.
- close on Escape.
- close after action selection.
- close previous dropdown when another opens.
- trigger click may toggle, but must not be the only close path.
- do not close before an inside action is registered.
- flip or shift near viewport edges.
- use correct z-index above chat bubbles, tables, sticky headers, and side panels.
- remain usable on mobile with comfortable tap targets.
- support keyboard focus and appropriate aria labels/roles.
- close when conversation/page changes, item disappears, list refreshes, or realtime update invalidates the target.
- do not drift during scroll.

Chat bubble menu rules:

- actions must match message type.
- AI draft actions differ from sent message actions.
- internal notes must never look sendable to customers.
- failed messages need retry/reason actions.
- dangerous actions need confirmation.

## State Completeness

Every important screen must include:

- default, loading, empty, error, success, disabled, validation error, permission denied, offline/disconnected, stale data, partial data, pending approval, failed action, retry, and realtime update states when relevant.

Stress test with:

- very long customer names.
- very long WhatsApp messages.
- many campaign recipients.
- many table rows.
- missing customer data.
- API errors.
- disconnected account.
- QR expired.
- campaign pending approval.
- AI paused/takeover.
- failed send.
- viewer permission denied.

## Output Format

When auditing, use this structure:

```text
Hermes SalesOps Enterprise UI/UX Audit

Overall Verdict: approve / revise / redesign / block
Overall Slop Risk: Low / Medium / High / Critical

Executive Summary:
- ...

Top P0/P1 Problems:
1. ...
2. ...
3. ...

Baileys / WhatsApp UX:
- Problem:
- Why it matters:
- Fix:

Per-Page Audit:
- Page:
- User job:
- Primary action:
- Current issue:
- Hierarchy risk:
- Responsive risk:
- Missing states:
- Required fix:
- Priority:

Right Panel Responsive Plan:
- Desktop:
- Tablet:
- Mobile:

Analytics Assessment:
- What is useful:
- What is vanity:
- Missing decision metrics:
- Required filters:

Settings Assessment:
- Current coverage:
- Missing settings:
- Safety settings:
- UX fixes:

Interaction / Overlay Findings:
- ...

Implementation Plan:
1. ...
2. ...
3. ...

Verification:
- Breakpoints checked:
- Browser/screenshots checked:
- Remaining risk:
```

Block the UI if a critical workflow can mislead an admin, hide risk, cause wrong sends/approvals, or trap users in broken overlays.

# Observability: SLOs, Alerting, Retention, Incident Response

This complements the always-current code references in [CLAUDE.md](../CLAUDE.md);
this doc captures the *operational* decisions that aren't visible by reading
source — targets, ownership, and what to do when something pages.

## 1. Audit log retention policy

`audit_log` (Prisma model `AuditLog`, served via `AuditService`/`AuditController`
at `GET /api/v1/audit-logs`) is the system of record for who-did-what:
account/bot/customer/campaign/knowledge mutations, role changes, and
authentication failures (`login_failed`).

- **Append-only by API design.** `AuditController` exposes only `list()` — no
  update or delete endpoint exists anywhere in the app. The only way rows
  disappear is direct DB access or a `prisma.auditLog.deleteMany` run
  out-of-band (there is currently no such job in this codebase).
- **No automatic expiry today.** There is no TTL, partition-drop, or cron job
  pruning old rows. Treat this as a known gap, not a feature: if storage
  growth becomes a problem, add an explicit archival job (e.g. monthly export
  to cold storage + delete past N months) rather than letting it grow
  unbounded — do not delete ad hoc.
- **Recommended retention window: 12 months hot (queryable via the API), then
  archive.** This matches typical compliance/dispute-resolution windows for a
  CS/sales platform without over-committing to a number the business hasn't
  actually set. If the business has a specific compliance requirement
  (consult whoever owns data-retention policy for the deployment), use that
  instead.
- **PII handling:** audit rows store ids (`userId`, `entityId`) and short
  action strings, not message bodies — consistent with `ErrorReporterService`'s
  same convention. Don't extend `logAudit()` calls to include raw customer
  content.
- **Failure mode:** `logAudit()` never throws into the caller (see
  `apps/api/src/common/audit.util.ts`) — a DB outage degrades to a structured
  `Logger.error` line + an `ErrorReporterService.capture()` call instead of
  blocking the mutation it's auditing. This is an intentional availability vs.
  completeness trade-off: a write that audits a sensitive action will still go
  through even if the audit insert fails, and the failure itself is now
  reported (not silent) after the dedup/reporting hardening landed.

## 2. SLOs (derived from the PRD's stated performance targets)

These are *targets to alert on*, not measured guarantees — there is no
historical baseline yet. Revisit thresholds after the first 2–4 weeks of real
`message_ingest_duration_seconds` / `ai_request_duration_seconds` data once
Prometheus has been scraping in production.

| SLI | Target (PRD) | Metric | Alert rule |
|---|---|---|---|
| Inbound message → dashboard display | < 2s | `message_ingest_duration_seconds` | not yet alerted — add once a baseline exists (see §4) |
| AI draft generation | < 10s | `ai_request_duration_seconds` | not yet alerted — same caveat |
| Auto-reply sent | < 15s | (composite of the above + send latency; not separately instrumented) | — |
| API availability | best-effort, no formal SLA | `up{job="hermes-api"}` | `HermesApiUnreachable` (dead-man's switch, `monitoring/alerts.yml`) |
| HTTP error rate | < 5% 5xx over 5m | `http_requests_total` | `HttpErrorRateHigh` |
| AI fallback rate | flagged if high (quality signal, not a hard SLO) | `ai_requests_total{outcome="fallback"}` | `AiFallbackRateHigh` |

**This is intentionally not a customer-facing SLA.** There's no paying-customer
contract in this codebase backing uptime/latency numbers — these are internal
reliability targets for the team running the deployment.

## 3. Alert severity ladder

Defined in `monitoring/alerts.yml` and routed in `monitoring/alertmanager.yml`:

- **critical** (`HermesApiUnreachable`, `WhatsAppAccountDown`,
  `HermesReviewBlockSpike`) — routes to the `critical` receiver,
  `repeat_interval: 15m`. Page immediately; these mean customers can't be
  served or a risky message may have gone out.
- **warning** (`AiFallbackRateHigh`, `HttpErrorRateHigh`, `QueueBacklog*`,
  `ApiLatencyP95High`, `NotificationChannelFailing`) — routes to the
  `default` receiver. Triage same business day; these degrade quality or
  signal a building problem, not an active outage.

## 4. Minimal runbook per critical alert

| Alert | First check | Likely fix |
|---|---|---|
| `HermesApiUnreachable` | Is the API process up? (`docker compose ps` / `pm2 status` / process manager) | Restart the API; check `apps/api` logs for the crash reason before restarting blind |
| `WhatsAppAccountDown` | `GET /wa/accounts/:id/health` — check `connectionState` and last reconnect attempt | Usually a session needing re-QR (logged out) or a stuck reconnect loop — check `WaService` reconnect backoff hasn't hit its cap |
| `HermesReviewBlockSpike` | `GET /hermes/alerts` for the affected bot — read the `reason` field on recent `block`/`pause_ai` decisions | If it's a real risk pattern (e.g. a prompt-injection attempt), that's working as intended — escalate to a human. If it's false positives, the rules engine or knowledge base needs a fix, not a restart |
| `NotificationChannelFailing` | `hermes_notification_send_total{outcome="error"}` rate; run `hermes send` manually from the API host | Usually a Hermes Agent gateway credential/config issue (`hermes gateway setup`) — this alert existing at all means the *primary* paging channel may be down, so also check email/secondary contact |

## 5. Incident response notes

- **Ownership:** not yet assigned in this repo — whoever operates the
  deployment should name an on-call owner before relying on these alerts for
  anything time-sensitive. Until then, treat all alerts as routed to whoever
  configured `HERMES_NOTIFY_TARGET`.
- **Triage order:** critical alerts first (customer-facing breakage or a risky
  auto-send), then warnings. `HermesReviewBlockSpike` and
  `WhatsAppAccountDown` take priority over `AiFallbackRateHigh` even though
  both are reachable from the same dashboard — one is "bot is silent/risky
  right now," the other is "bot quality is degrading."
- **Postmortem:** none formalized yet. At minimum, after a critical incident,
  capture: what `audit_log` shows happened, what the relevant Prometheus
  graphs looked like (screenshot before metrics roll off), and the runbook
  step that should be added/corrected here.

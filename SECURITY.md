# Security Policy

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

> **Note**: This project is pre-1.0. Breaking changes may occur. Pin to a specific version in production.

## Reporting a Vulnerability

**Do not open a public issue** for security vulnerabilities.

Instead, report them privately via:

- **Email**: security@filmdown526-ux.github.io
- **GitHub Security Advisory**: Use the "Report a vulnerability" tab in the Security section of this repository

### What to Include

Please provide:

1. **Description** of the vulnerability
2. **Steps to reproduce** (if applicable)
3. **Impact** assessment (what an attacker could achieve)
4. **Affected components** (API, Web, Database, WhatsApp gateway, etc.)
5. **Suggested fix** (if you have one)
6. **Your contact info** for follow-up

### Response Timeline

| Phase | Target |
|-------|--------|
| Initial acknowledgment | 48 hours |
| Triage & severity assessment | 5 business days |
| Fix development | 14-30 days (depending on severity) |
| Patch release | Within 7 days of fix completion |
| Public disclosure | After patch released (coordinated) |

## Security Architecture

### Authentication & Authorization
- JWT-based auth with `JWT_SECRET` (rotate in production)
- Role-based access control: `owner` > `supervisor` > `admin` > `viewer`
- No public signup — only `owner` creates users
- API key auth for machine-to-machine (`AGENT_API_KEY`, `METRICS_TOKEN`, `ALERTMANAGER_WEBHOOK_TOKEN`)

### Data Protection
- **Encryption at rest**: External credentials (DB connections, service account keys) encrypted with `SECRET_ENCRYPTION_KEY` (AES-256-GCM)
- **In transit**: TLS enforced for all external connections (DB, Redis, AI provider, S3)
- **Media URLs**: Capability URLs with random UUIDs (no auth required for `<img>`/`<audio>` tags)
- **Secrets**: Never logged; masked in UI/API responses

### Input Validation & Sanitization
- Global DTO validation (`class-validator`, `whitelist: true`, `forbidNonWhitelisted: true`)
- Recursive input sanitization on body/query/params (reduces stored XSS risk)
- Rate limiting: per-IP, per-user, per-login (in-memory; Redis-backed recommended for HA)

### WhatsApp Gateway (Baileys)
- Session auth state persisted to `WA_SESSION_DIR` (back up!)
- Anti-ban: randomized send delays, typing indicators, per-account throttle
- Session health checks + exponential backoff reconnect
- No WhatsApp credentials stored in database

### AI Provider
- Any OpenAI-compatible endpoint via `AI_BASE_URL` / `AI_API_KEY`
- Request timeout enforced (`AI_TIMEOUT_MS`, default 30s)
- Conservative response cache
- Optional RAG with pgvector (embeddings stored in DB)

### Observability
- Structured JSON logs with `requestId` correlation
- Prometheus metrics at `/api/v1/metrics` (token-protected via `METRICS_TOKEN`)
- Error webhook (`ERROR_WEBHOOK_URL`) — no PII forwarded
- Readiness endpoint (`/health/ready`) checks DB, Redis, session dir, config

## Secure Deployment Checklist

- [ ] `JWT_SECRET` = strong random (`openssl rand -base64 48`)
- [ ] `SECRET_ENCRYPTION_KEY` = strong random (`openssl rand -base64 48`)
- [ ] `DATABASE_URL` = managed Postgres with TLS, connection pooling tuned
- [ ] `REDIS_URL` = managed Redis with AUTH, TLS
- [ ] `WA_SESSION_DIR` = persistent mounted volume
- [ ] `MEDIA_STORAGE_DRIVER=s3` for multi-replica (Supabase/MinIO/S3)
- [ ] `CORS_ORIGINS` = your production web origin(s) only
- [ ] `METRICS_TOKEN` set; metrics endpoint on internal network only
- [ ] `ERROR_WEBHOOK_URL` configured for error alerting
- [ ] External monitor polling `/health/ready` + `/health/whatsapp`
- [ ] Automated DB backups with verified restores
- [ ] Dependency scanning enabled (Dependabot/GitHub Advisory)

## Known Security Considerations

| Area | Risk | Mitigation |
|------|------|------------|
| In-memory rate limiting | Bypassable in multi-replica | Add Redis/API gateway limiter for HA |
| JWT in localStorage | XSS-readable | CSP on backlog; input sanitization; no `dangerouslySetInnerHTML` |
| Media capability URLs | Guessable if UUID leaked | Random UUID v4; don't log/share |
| Login lockout | In-memory per replica | Shared Redis limiter for HA |
| Baileys session files | QR re-scan if lost | Back up `WA_SESSION_DIR` |

## Disclosure Policy

We follow **coordinated disclosure**:

1. Vulnerability reported privately
2. Fix developed and tested
3. Patch released (tagged version)
4. Public advisory published (GitHub Security Advisory)
5. Credit given to reporter (unless anonymous requested)

## Security Contacts

- **Primary**: filmdown526-ux (repository owner)
- **Email**: security@filmdown526-ux.github.io
- **PGP**: Available on request

---

*This policy is adapted from best practices for open-source security management.*
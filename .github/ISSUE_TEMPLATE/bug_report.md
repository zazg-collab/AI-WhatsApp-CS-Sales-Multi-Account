---
name: Bug Report
about: Report a reproducible bug
title: "[Bug] "
labels: ["bug"]
---

## Description

A clear and concise description of what the bug is.

## Steps to Reproduce

1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

## Expected Behavior

A clear and concise description of what you expected to happen.

## Actual Behavior

What actually happened (error message, stack trace, screenshot, etc.).

## Environment

- **OS**: [e.g. Ubuntu 22.04, macOS 14, Windows 11]
- **Node.js**: [e.g. 20.11.0]
- **Package Manager**: [npm / pnpm / yarn]
- **Docker**: [version or N/A]
- **Database**: [PostgreSQL version]
- **Redis**: [version]

## Deployment

- [ ] Local development (`docker compose up -d`)
- [ ] Production (`docker-compose.prod.yml`)
- [ ] Other: _______

## Affected Components

- [ ] API (NestJS) — `apps/api`
- [ ] Web (Next.js) — `apps/web`
- [ ] Database (Prisma) — `packages/database`
- [ ] WhatsApp Gateway (Baileys)
- [ ] AI Engine / Hermes Supervisor
- [ ] Campaigns / Outbound
- [ ] Other: _______

## Logs / Stack Traces

```text
Paste relevant logs here (API logs, browser console, Docker logs)
```

## Additional Context

Any other information, configuration, or data that might help resolve the issue.

## Checklist

- [ ] I have searched existing issues and this is not a duplicate
- [ ] I have tested on the latest `main` branch
- [ ] I have provided sufficient information to reproduce
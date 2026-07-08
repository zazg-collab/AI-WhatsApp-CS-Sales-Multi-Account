## What & why

<!-- What does this change do, and why is it needed? -->

## Type of change

- [ ] Feature
- [ ] Fix
- [ ] Refactor / chore
- [ ] CI / DevOps
- [ ] DB migration (schema change)

## Checklist

- [ ] `npm run lint` and `npx tsc --noEmit` pass (api + web)
- [ ] Tests added/updated; `npm run test --workspace=@hermes/api` green
- [ ] No secrets committed (`.env` stays ignored)
- [ ] If schema changed: migration generated **and** `prisma migrate diff` shows no drift

## Migration & rollback (fill in if this touches the DB)

- [ ] Migration is backward-compatible (expand/contract) — the previous app
      version still runs against the new schema
- [ ] Destructive change? Backup + rollback steps noted below

<!-- Rollback notes / risk: -->

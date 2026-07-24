# Contributing to Hermes AI

Thank you for your interest in contributing! This project is a **single-tenant, internal team tool** for managing multiple AI-powered WhatsApp chatbots with a supervisor layer (Hermes). It is **not** a public multi-tenant SaaS.

## Quick Start for Contributors

```bash
# 1. Fork and clone
git clone https://github.com/YOUR-USERNAME/AI-WhatsApp-CS-Sales-Multi-Account.git
cd AI-WhatsApp-CS-Sales-Multi-Account

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your local values (see Environment Variables below)

# 4. Start infrastructure
docker compose up -d postgres redis

# 5. Database setup
npm run db:generate
npm run db:migrate
npm run db:seed

# 6. Run dev servers (two terminals)
npm run dev:api   # http://localhost:3001/api/v1
npm run dev:web   # http://localhost:3000
```

## Architecture Overview

```
apps/
  api/     NestJS backend — global prefix /api/v1
           - WhatsApp gateway (Baileys, multi-account)
           - AI engine (provider-agnostic, OpenAI-compatible)
           - Hermes supervisor (rules + LLM judgement)
           - CRM, campaigns, knowledge, analytics
  web/     Next.js 14 (App Router) dashboard
           - Feature modules in src/features/
           - Shared UI in src/components/ui/

packages/
  database/  Prisma schema + shared client (@sentinel/database)
```

See [CLAUDE.md](./CLAUDE.md) for deep architecture notes.

## Development Workflow

### Branch Naming

| Type | Prefix | Example |
|------|--------|---------|
| Feature | `feat/` | `feat/campaign-scheduling` |
| Fix | `fix/` | `fix/wa-reconnect-loop` |
| Refactor | `refactor/` | `refactor/ai-prompt-builder` |
| Chore | `chore/` | `chore/update-deps` |
| Docs | `docs/` | `docs/update-deployment-guide` |
| Perf | `perf/` | `perf/db-index-optimization` |

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[scope]: <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`, `test`, `ci`, `build`

Examples:
```
feat(api): add campaign recipient preview endpoint
fix(web): resolve inbox scroll position on message insert
refactor(ai): extract prompt builder to separate module
chore(deps): update @nestjs packages to 10.4.x
```

### Pull Request Process

1. **Create PR** from your fork/branch against `master`
2. **Fill the PR template** (what, why, type, checklist)
3. **All CI must pass**:
   - Secret scan (gitleaks)
   - Lint & build (API + Web)
   - TypeScript check (API + Web)
   - Tests (unit, e2e, integration)
   - Migration verification (Prisma drift check)
4. **Code review** by `@filmdown526-ux` (required by CODEOWNERS)
5. **Squash & merge** — maintainers will squash on merge

### Pre-commit Checks (run locally)

```bash
npm run lint          # ESLint all workspaces
npx tsc --noEmit      # TypeScript check (run in apps/api and apps/web)
npm run test          # Source-level QA checks (scripts/qa-check.mjs)
npm run test --workspace=@sentinel/api    # API unit tests
npm run test --workspace=@sentinel/web    # Web tests (Vitest)
```

## Code Standards

### TypeScript
- Strict mode enabled
- No `any` — use `unknown` or proper types
- Prefer `type` over `interface` for unions/intersections
- Zod schemas for runtime validation (DTOs)

### NestJS (API)
- Controllers → Services → Repositories (Prisma)
- DTOs with `class-validator` + global validation pipe
- Guards for auth (`JwtAuthGuard`) + roles (`RolesGuard`)
- Swagger decorators on all public endpoints

### Next.js (Web)
- App Router, Server Components by default
- Feature modules in `src/features/{domain}/`
- Shared UI primitives in `src/components/ui/`
- API client in `src/lib/api.ts` (JWT + Socket.IO)

### Database (Prisma)
- Schema in `packages/database/prisma/schema.prisma`
- **Always** generate migration: `npm run db:migrate` (creates `prisma/migrations/...`)
- **Never** edit committed migrations
- Run drift check: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma`

### Testing
| Layer | Tool | Location |
|-------|------|----------|
| API unit | Jest | `apps/api/src/**/*.spec.ts` |
| API e2e | Jest + Supertest | `apps/api/test/` |
| API integration (real DB) | Jest | `apps/api/test/int/` |
| Web unit | Vitest | `apps/web/src/**/*.test.tsx` |

## Environment Variables

Required for local development (copy from `.env.example`):

```bash
# Mandatory
JWT_SECRET=change-this-before-deploying
DATABASE_URL=postgresql://hermes:hermes@localhost:5432/hermes?schema=public&connection_limit=10&pool_timeout=20
REDIS_URL=redis://localhost:6379
CORS_ORIGINS=http://localhost:3000

# AI Provider (any OpenAI-compatible)
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini

# Optional
HERMES_MODEL=Hermes-4-405B     # Stronger supervisor model
AI_EMBED_MODEL=text-embedding-3-small  # Enable RAG
SECRET_ENCRYPTION_KEY=...      # Encrypt external credentials
WA_SESSION_DIR=.wa-sessions    # Baileys session persistence
```

See `.env.example` for full list with descriptions.

## Database Commands

```bash
npm run db:generate     # Generate Prisma Client (after schema changes)
npm run db:migrate      # Create & apply migration (dev)
npm run db:seed         # Seed initial owner user
npm run db:studio       # Open Prisma Studio
npm run migrate:deploy  # Apply migrations (prod, in packages/database)
```

## Adding a New Feature Module

1. **API** (`apps/api/src/modules/{domain}/`):
   - `{domain}.module.ts`
   - `{domain}.controller.ts` (REST endpoints)
   - `{domain}.service.ts` (business logic)
   - `dto/` (request/response validation)
   - `entities/` (if needed)
   - Register in `AppModule`

2. **Database** (`packages/database/prisma/schema.prisma`):
   - Add models, run `npm run db:migrate`

3. **Web** (`apps/web/src/features/{domain}/`):
   - `components/` (React components)
   - `hooks/` (React Query, Socket.IO)
   - `types.ts` (shared types)
   - `api.ts` (API client calls)
   - Add route in `src/app/{domain}/`

4. **Tests**: Unit + integration for API; component tests for Web

## Release Process

1. Version bump in `package.json` (root + workspaces)
2. Changelog entry (manual or auto-generated)
3. Tag: `git tag v0.x.x && git push --tags`
4. CI builds & pushes Docker images to GHCR
5. Deploy workflow (manual trigger or push to master)

## Getting Help

- **Questions**: [Discussion](https://github.com/filmdown526-ux/AI-WhatsApp-CS-Sales-Multi-Account/discussions) or [Question issue template](.github/ISSUE_TEMPLATE/question.md)
- **Bugs**: [Bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
- **Features**: [Feature request template](.github/ISSUE_TEMPLATE/feature_request.md)
- **Security**: See [SECURITY.md](SECURITY.md) — **do not** open public issues

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

*This project is maintained by [@filmdown526-ux](https://github.com/filmdown526-ux).*
# Merge conflict resolution notes

This branch uses a conflict-safe strategy for files GitHub reported as conflicting with `main`.

## Resolution principle

Do not drop production features that already exist on `main`. For every conflict batch, branch-side edits in the reported files are reset to the local main baseline when that file existed in the baseline, or removed from this branch when the file did not exist in the local merge base.

This makes `main` the source of truth for the conflicted files during merge resolution, including:

- conversation, WhatsApp, and audit behavior from the current main branch;
- page implementations and tests for monitoring, templates, settings, home, AppLayout, Sidebar, and ThemeToggle;
- dependency lockfile and Prisma schema changes already present on main.

## UI/UX scope retained in this branch

Hermes UI polish that is not in the reported conflict set remains in non-conflicting files. Page-level UI work that conflicted with `main` was intentionally removed from this branch so the current main implementation can be preserved and redesigned incrementally after the merge is clean.

## Files checked manually

The latest conflict batch handled here included:

- `apps/web/src/app/monitoring/page.test.tsx`
- `apps/web/src/app/monitoring/page.tsx`
- `apps/web/src/app/page.test.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/settings/ai/page.test.tsx`
- `apps/web/src/app/settings/ai/page.tsx`
- `apps/web/src/app/templates/page.test.tsx`
- `apps/web/src/app/templates/page.tsx`
- `apps/web/src/components/AppLayout.test.tsx`
- `apps/web/src/components/AppLayout.tsx`
- `apps/web/src/components/Sidebar.test.tsx`
- `apps/web/src/components/Sidebar.tsx`
- `apps/web/src/components/ThemeToggle.tsx`
- `apps/web/tailwind.config.ts`
- `package-lock.json`
- `packages/database/prisma/schema.prisma`
- `scripts/qa-check.mjs`

No conflict markers should remain in the working tree. After a real remote `main` is available locally, run the final merge/rebase and keep `main` content for these files unless a new non-conflicting integration is needed.

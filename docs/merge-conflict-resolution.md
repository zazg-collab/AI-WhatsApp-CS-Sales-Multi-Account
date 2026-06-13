# Merge conflict resolution notes

This branch uses a conflict-safe strategy for files GitHub reported as conflicting with `main`.

## Resolution principle

Do not drop production features that already exist on `main`. For every conflict batch, branch-side edits in the reported files are reset to the local main baseline when that file existed in the baseline, or removed from this branch when the file did not exist in the local merge base.

This makes `main` the source of truth for the conflicted files during merge resolution, including:

- conversation, WhatsApp, and audit behavior from the current main branch;
- page implementations and tests from the current main branch;
- dependency manifest, dependency lockfile and Prisma schema changes already present on main.

## Latest conflict batch

The final batch reported by GitHub was:

- `package-lock.json`
- `package.json`
- `packages/database/prisma/schema.prisma`

All three files were reset out of this branch so the merge can keep `main`'s current dependency and database model state. This avoids losing production schema fields or dependency updates that already exist on `main`.

## Important local validation note

The local workspace does not have a configured `origin/main`, so the exact GitHub `main` tree is not available inside this container. Local API builds can therefore fail if branch API code expects schema fields that only exist on the real remote `main`. The intended final merge resolution is to keep the real `main` versions of the manifest, lockfile, and Prisma schema, then regenerate Prisma and run the full CI matrix.

No conflict markers should remain in the working tree. After a real remote `main` is available locally, run the final merge/rebase and keep `main` content for the files above unless a new non-conflicting integration is needed.

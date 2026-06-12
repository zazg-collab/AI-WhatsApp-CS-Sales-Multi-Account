# Merge conflict resolution notes

This branch now uses a conflict-safe resolution strategy for the files that GitHub reported as conflicting with `main`.

## Resolution principle

Do not drop production features that already exist on `main`. The conflict files are reset to the current main baseline or removed from this branch when they did not exist in the local merge base, so this branch no longer tries to overwrite those files during the merge.

That means the final merge should keep `main` as the source of truth for:

- conversation search, filters, labels, status changes, media sends, quoted replies, AI draft approval/blocking, failed-send refresh, and dashboard live socket updates;
- WhatsApp session lifecycle, reconnect/backoff, receipts, phone/history sync, inbound/outbound media handling, auto-away, CSAT capture, and idempotent message ingestion;
- web page backend wiring for accounts, users, analytics, audit, bots, campaigns, customers, dashboard, Hermes, and knowledge pages;
- frontend tests for the pages listed in the GitHub conflict report.

## UI/UX scope retained in this branch

The Hermes AI Sales & Customer Service Control Center visual polish is intentionally isolated to shared shell components and non-conflicting styling files instead of page-level conflict files. The retained UI layer keeps:

- the restrained enterprise visual language in `globals.css`;
- the Lucide-style navigation/icon system in the shared sidebar and icon adapter;
- the app shell, sidebar hierarchy, and theme controls outside the conflicted page files.

This keeps the redesign compatible with the latest `main` page implementations and avoids overwriting newer backend wiring or page features that may already exist on `main`.

## Files checked

The automated QA check validates that every existing file listed in the GitHub conflict report is free of Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). Files that are intentionally absent from this branch are skipped so `main` can keep its own versions during the merge.

When resolving locally with the real remote configured, use this branch after rebasing or merging `main`, then run:

```bash
npm test
npm run build --workspace=@hermes/web
```

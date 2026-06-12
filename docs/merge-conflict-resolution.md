# Merge conflict resolution notes

This branch was prepared as the conflict-resolution source for the files reported by GitHub as conflicting with `main`.

## Resolution principle

Do not drop production features that already exist on `main`, and do not drop the feature work from this branch. The final resolved files should keep:

- conversation search, filters, labels, status changes, media sends, quoted replies, AI draft approval/blocking, failed-send refresh, and dashboard live socket updates;
- WhatsApp session lifecycle, reconnect/backoff, receipts, phone/history sync, inbound/outbound media handling, auto-away, CSAT capture, and idempotent message ingestion;
- web page backend wiring for accounts, users, analytics, audit, bots, campaigns, customers, dashboard, Hermes, and knowledge pages;
- frontend tests for the pages listed in the GitHub conflict report.

## Files checked

The automated QA check validates that every file listed in the conflict report is free of Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) and that critical backend/frontend integration strings remain present.

When resolving in GitHub UI or locally, use the contents of this branch as the resolved version for those files, then run:

```bash
npm test
npm run build --workspace=@hermes/web
```

If you have a local clone with the real remote configured, the intended command-line flow is:

```bash
git checkout <this-pr-branch>
git fetch origin main
git merge origin/main
# resolve the listed files using this branch's merged contents
git add <resolved-files>
git commit
git push
```

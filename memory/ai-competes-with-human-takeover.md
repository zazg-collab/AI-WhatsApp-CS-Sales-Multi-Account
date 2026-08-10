---
name: ai-competes-with-human-takeover
description: Bug+fix — AI kept auto-replying while a human agent answered from the phone (no takeover detected)
metadata:
  type: project
---

On a shared WhatsApp number, when telesales replied directly from the phone
(not via dashboard), Baileys delivered it as `fromMe`. Ingest stored it as
`admin` but nothing set `takeoverStatus`, while `maybeAutoReply` only pauses on
`admin_takeover` (set solely by the dashboard button). Result: AI talked over
the human with useless "saya konfirmasi dulu ke admin".

**Fix (2026-06-18)** in `apps/api/src/modules/wa/message-ingest.service.ts`: after
the idempotency dedup (so it is NOT an echo of an AI/dashboard send — those are
stored with their externalId first and deduped), a `fromMe` message on an
automated conversation (ai_on/ai_draft/ai_supervised) triggers an implicit
takeover: `takeoverStatus=admin_takeover`, `previousAiMode=<current>`,
`aiMode=ai_off`, audit `auto_takeover_phone_reply`, emit `conversation:updated`.
Resume via the existing return-to-AI flow.

Related prompt-quality fixes: [[bot-language-and-scope-guard]].

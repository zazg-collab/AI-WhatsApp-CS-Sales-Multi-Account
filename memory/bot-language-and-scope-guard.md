---
name: bot-language-and-scope-guard
description: How the customer chatbot must handle language, role/scope confinement, anti-jailbreak, and media — per owner feedback
metadata:
  type: feedback
---

Owner feedback (2026-06-18) after a real chat where the bot drifted off-role,
leaked Chinese ("不过"), and competed with the human telesales:

- **Language must follow the persona/business + the customer**, NOT be hardcoded
  to Indonesian (they serve foreign customers too). The bot must never mix
  multiple languages/scripts in one reply. Implemented in `BASE_RULES` rule 5
  (`apps/api/src/i18n/bot-prompts.ts`).
- **Anti-jailbreak + role/scope confinement must be system-authored**, not left to
  the user-editable persona. Implemented as `SECURITY_DIRECTIVE` injected as the
  FIRST system message in `PromptBuilderService.buildForConversation`. It both
  confines the bot to the business's CS/sales role (decline off-topic) and blocks
  prompt injection.
- **Media (images/docs): never say "can't see it / resend"** — acknowledge and
  forward to admin. `mediaPlaceholder()` injects a placeholder into history;
  `BASE_RULES` rule 9 enforces the behavior.

**Why:** the bot looked like it "didn't understand its position" — see
[[ai-competes-with-human-takeover]] for the related auto-pause fix.

**How to apply:** keep these three concerns system-level and persona-independent;
when editing bot prompts, preserve language-adaptivity and the leading security
block ordering (guard → shared → customer → history).

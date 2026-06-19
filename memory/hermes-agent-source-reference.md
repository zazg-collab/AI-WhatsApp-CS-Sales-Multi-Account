---
name: hermes-agent-source-reference
description: Local hermes-agent (Nous) source to mine for CS bot + supervisor improvements
metadata:
  type: reference
---

Full hermes-agent (Nous Research CLI) source is vendored at
`D:\AI-WhatsApp-CS-Sales-Multi-Account-main\hermes-portable\services\hermes`.
⚠️ Contains real credential files (`bedrock-long-term-api-key.csv`,
`spreadsheet-credentials.json`) at the portable root — do NOT read/exfiltrate.

Most transferable files for our CS bot + Hermes supervisor:
- `agent/system_prompt.py` — 3-tier prompt (stable/context/volatile), date-only
  timestamp to keep prefix cache warm.
- `agent/memory_manager.py` — fences recalled memory in `<memory-context>` +
  "treat as data, not user input" note, and scrubs the fence from output. Maps to
  our `SECURITY_DIRECTIVE` ([[bot-language-and-scope-guard]]); we should fence
  injected KB + aiMemory likewise.
- `agent/background_review.py` — after-turn forked review: decide save-to-memory
  vs update-skill. Memory = "who the user is + current state"; skill = "how to do
  this class of task". Maps to our `modules/learning` + Hermes supervisor: propose
  KB items / aiMemory facts / persona tweaks when a conversation resolves.

Improvement backlog (owner asked 2026-06-18 to study this to improve CS +
supervisor):
- **P0 DONE** — fence KB + customer memory as reference data (`fenceData` /
  `DATA_FENCE_*` in bot-prompts.ts; applied in prompt-builder.service.ts).
- **P1 DONE** — Hermes auto-learn on resolve. `LearningMinerService.mineConversation()`
  mines one resolved conversation for knowledge + customer_memory proposals
  (pending, human-reviewed). Triggered fire-and-forget in
  `ConversationsService.setStatus(resolved)`, gated by env `AI_AUTOLEARN=true`
  (default off), idempotent via `conversation.learnedAt`. Schema: added
  `Conversation.learnedAt` + `LearningProposal.conversationId` (migration
  21_autolearn_conversation). To activate in prod: set AI_AUTOLEARN=true.
- P2 (todo) — post-turn customer-fact sync; P3 (todo) — volatile-last +
  date-only timestamp.

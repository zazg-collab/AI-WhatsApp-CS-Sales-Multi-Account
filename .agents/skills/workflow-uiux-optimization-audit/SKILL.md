---
name: workflow-uiux-optimization-audit
description: Audit Hermes UI/UX workflows for friction and find simpler, more practical paths — eliminate manual steps that the system can auto-fill, infer, or skip. Use when a flow makes the user type, choose, or confirm something the app already knows or can fetch (e.g. "add account" once required typing a name + number, now you just scan and metadata auto-fills). Detects form-before-action ordering, manual data entry that could be auto-populated from available sources, redundant steps, missing smart defaults, and multi-step flows that can collapse. Produces concrete before/after redesigns wired to real backend data.
---

# Workflow UI/UX Optimization Audit

Use this skill to make workflows **more practical**, not just prettier. The goal is to remove every step the user does not actually need to do — every field they type that the system already knows, every choice that has an obvious default, every "fill the form first" that could be "do the action and let it fill itself."

The canonical win: **adding a WhatsApp account used to require typing a name and phone number before scanning. Now you scan first, and the name + number auto-fill from the connected device's metadata.** That is the entire spirit of this skill — find every workflow with that shape and fix it.

This is not a visual-design skill and not a contract audit. It is about the **sequence and effort** of a task: how many steps, how much typing, how much the user must already know, how many of those the system can absorb.

## Core Principle: Action-First, Not Form-First

Most friction comes from one inverted ordering:

```text
Form-first (high friction):   fill fields → submit → wait → see result → maybe fix
Action-first (low friction):  do the action → system fetches/infers → user reviews → confirm
```

When data the form asks for **already exists** somewhere the app can reach — a connected socket, an uploaded file's contents, a pasted URL's page, a prior record, a sensible default — the form should not ask for it up front. It should perform the action, read the data back, pre-fill, and let the user edit only if wrong.

## The Five Friction Patterns

Audit every workflow against these. Each has a fixed "better shape."

### 1. Manual entry of knowable data (auto-fill candidate)
The user types something the system could read from an available source.
- **Tell**: a required text/number field whose value exists in a socket, file, URL, API response, or linked record.
- **Fix**: perform the connecting action first, read metadata, pre-fill the field (editable), mark it "auto-detected."
- **Example**: account name/phone from Baileys `sock.user`; knowledge title from the uploaded document's heading; product name/price from the synced source row; customer name from the WhatsApp contact card.

### 2. Form-before-action ordering
The user must complete a form to unlock the real action, when the action could come first.
- **Tell**: a "details" step gates a "connect/scan/upload/sync" step that actually produces the details.
- **Fix**: reverse the steps. Action → auto-populate → confirm.
- **Example**: name+number → QR (old) becomes QR → name+number prefilled (new).

### 3. Manual lookup of a value the system can suggest
The user must already know or remember a value to pick it.
- **Tell**: a dropdown/search where one option is almost always right, or where the app has signal to rank options.
- **Fix**: smart default pre-selected, or ranked suggestions with a reason, with manual override still available.
- **Example**: assign-admin defaulting to least-busy; bot-switch suggesting the best-fit persona; campaign account defaulting to the only connected one; timezone defaulting to the device/locale.

### 4. Redundant or premature steps
A step exists that adds no decision, or asks for a decision too early.
- **Tell**: a confirm screen with no consequence, a required choice with one viable option, a setting asked at create time that is almost always edited later, two screens that could be one.
- **Fix**: collapse, auto-advance, defer to a sensible default, or make it inline.
- **Example**: a method-picker shown when only QR is available; a separate "create base" step before "add item" when the first item could create the base.

### 5. Invisible state / no feedback on effort
The user does work but cannot tell if it took, so they redo or hesitate.
- **Tell**: inline edits with no save affordance, long actions with no progress, multi-step flows with no "step X of Y," polling with no "waiting…" signal.
- **Fix**: explicit save + saving/saved states, progress for >1s actions, step indicators, live status while waiting.
- **Example**: business-hours toggle that saves silently; metadata polling with no "detecting device…" hint; a 3-step modal with no counter.

## Audit Workflow

1. **Inventory the task flows**, not just pages. For each user goal (add account, create campaign, add knowledge, assign customer, switch bot, sync products, edit persona, schedule follow-up), trace the exact click/type/wait/confirm sequence in `apps/web/src/app/**` and its hooks.
2. For each step, ask the **friction questions** (below). Any "yes" is a finding.
3. For each finding, check whether the data needed to remove the step is **actually reachable** — a real backend field, socket value, file content, or prior record. Optimizations must be wired to real data, never faked. Cross-check `apps/api` for an endpoint/value that supplies it (or specify the small endpoint to add, as was done with `GET /wa/accounts/:id/metadata`).
4. Write a **before/after** for each finding: current steps vs. proposed steps, with the count reduced and the typing/choosing removed.
5. **Prioritize** by frequency × effort removed. A 5-second saving on a daily task beats a 30-second saving on a rare one.

## Friction Questions (run on every step)

- Does the user type a value the system could read from a connected device, uploaded file, pasted URL, API, or existing record?
- Is the user filling a form to unlock an action that would itself produce that form's data?
- Is there an obvious default for this choice that we make the user pick manually?
- Could the app rank these options instead of leaving the user to guess?
- Does this step contain a real decision, or is it ceremony?
- Is this setting asked now but almost always changed later (or never)?
- After the user acts, can they tell it worked? Is progress/step/saved state visible?
- Could two consecutive screens be one? Could this confirm be skipped or made undoable instead?

## Hard Rules

- **Auto-fill must come from real data.** Read the actual source (socket, file, record, API). If the source does not exist yet, specify the minimal backend addition; do not invent values or hardcode.
- **Always keep the override.** Auto-filled and defaulted values must remain editable. Practical ≠ removing user control.
- **Never auto-execute irreversible or outbound actions** (sending messages, deleting, charging) without an explicit confirm. Optimize the *setup*, not the safety gate. For destructive confirms, the improvement is showing impact (counts affected), not removing the confirm.
- **Reduce real steps, not just visual clutter.** Hiding a field that is still required is not an optimization.
- **Respect roles/permissions.** A smart default must still pass the same guard the manual path did.
- **Don't regress honesty.** A pre-filled field must be clearly marked as auto-detected so the user knows to verify.

## Required Output

```text
Hermes Workflow Optimization Audit

Overall Friction Level: Low / Medium / High
Highest-Impact Win: <one-line>

Flow Inventory:
- <goal>: <current step count> steps, <fields typed>, <choices made>

Findings (one per friction point):
1. Flow: <goal>
   Pattern: <1 manual-entry | 2 form-first | 3 manual-lookup | 4 redundant-step | 5 invisible-state>
   Friction: <what the user needlessly does>
   Data source for fix: <real socket/field/file/API, or "ADD: <endpoint>">
   Before: <step list>
   After:  <step list, fewer steps / less typing>
   Impact: <frequency × effort removed>  Priority: P0/P1/P2
   Override preserved: yes/no   Honesty (auto-detected marked): yes/no

Before/After Summary Table:
| Flow | Steps before | Steps after | Typing removed | Priority |

Quick Wins (ship now):
- ...

Needs small backend addition:
- <flow>: ADD <endpoint/field> returning <data>

Risks / Do-Not-Touch:
- <flows where a confirm/step must stay for safety>

Implementation Plan:
1. P0:
2. P1:
3. P2:
```

## Notes for Implementation Mode

When the user asks to implement (not just audit):

- Implement P0/P1 wins where the data source already exists or the backend addition is small and safe.
- Reuse the established pattern: a poll/fetch endpoint that returns auto-populate data, a hook that performs action → fetches → pre-fills, a thin confirm step. (`GET /wa/accounts/:id/metadata` + a setup hook is the reference implementation.)
- Mark auto-filled fields in the UI (placeholder/badge "auto-detected") and keep them editable.
- Add step indicators to any multi-step modal touched.
- Verify with `npx tsc -p apps/web/tsconfig.json --noEmit` (and the API tsconfig if backend changed) before claiming done.
- Report the before/after step counts actually achieved, not intended.

See `references/workflow-friction-catalog.md` for a worked catalog of Hermes flows and their target shapes.

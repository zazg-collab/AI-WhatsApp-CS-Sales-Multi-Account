# Hermes Workflow Friction Catalog

A worked catalog of the main Hermes task flows, the friction in each, and the target ("more practical") shape. Use this as the reference set when auditing — these are the flows users hit most. The account-add flow is the proven reference (already shipped via `GET /wa/accounts/:id/metadata`).

Each entry: **Goal → Current shape → Friction pattern(s) → Target shape → Data source → Priority**.

---

## 1. Add WhatsApp account ✅ reference

- **Current (old)**: type Name → type Phone → create → scan QR → connected.
- **Friction**: Pattern 2 (form-first), Pattern 1 (manual entry of knowable data — the device already knows its own name + number).
- **Target (new)**: choose method → scan QR / pairing code → on connect, poll metadata → Name + Phone pre-filled from `sock.user` → user reviews/edits → confirm.
- **Data source**: `WaService.getMetadata()` → `sock.user.id` (phone via `jidToPhone`), `sock.user.name`. Exposed at `GET /wa/accounts/:id/metadata`.
- **Priority**: P0 (done). This is the template for every other auto-fill.

---

## 2. Add knowledge item

- **Current**: create knowledge base (name) → select base → fill title + content + product → save. File/URL import exists but is secondary.
- **Friction**: Pattern 1 (the uploaded file/URL already contains title + body), Pattern 4 (separate "create base" before first item).
- **Target**: pick file or paste URL **first** → system parses → title pre-filled from the document heading / page `<title>`, content pre-filled from body → user trims and saves. If no base exists, the first save creates one inline with a default name.
- **Data source**: existing upload/from-url parse already returns text + char count; surface the parsed title and a content preview into the form instead of only creating items silently.
- **Priority**: P1.

---

## 3. Create campaign

- **Current**: type name → pick sender account → write message → pick filters → preview → submit → approve → start.
- **Friction**: Pattern 3 (sender account: if only one is connected, it is the obvious default), Pattern 5 (recipient count not visible until a separate preview click), Pattern 4 (rate/delay asked at create but rarely changed).
- **Target**: sender account defaults to the single connected account (or the most-recently-used); a **live recipient count** updates beside the filters as they change (no separate preview round-trip needed for the number); advanced rate/delay collapsed under "Advanced" with safe defaults.
- **Data source**: accounts list (`sessionStatus === 'connected'`); `preview`/`buildTargets` already computes eligible count — call it reactively on filter change (debounced).
- **Priority**: P1. Keep the explicit approve+start gates (outbound safety — do not auto-run).

---

## 4. Assign customer to admin (single + bulk)

- **Current**: open customer / select rows → open admin dropdown → pick admin manually.
- **Friction**: Pattern 3 (manual lookup — the system knows who is least busy).
- **Target**: dropdown pre-ranks admins by open-conversation load with a "least busy" hint on the top option; manual pick still available.
- **Data source**: count of open conversations per admin (already derivable from conversations table; add a light aggregate if not present).
- **Priority**: P2 (suggestion only; never auto-assign silently if the team expects manual routing — gate behind the existing AUTO_ASSIGN_STRATEGY intent).

---

## 5. Switch bot / persona on a conversation

- **Current**: open conversation → open bot dropdown → pick bot manually.
- **Friction**: Pattern 3 (manual lookup — `suggestBot` already computes the best-fit persona from the customer's messages).
- **Target**: show the suggested bot inline with a one-line reason ("formal tone matches Persona X") and a one-click apply; full dropdown still available.
- **Data source**: `LearningMinerService.suggestBot(conversationId)` — already returns `{ botId, botName, personaName, reason }`. It is computed but underused in the UI.
- **Priority**: P1 (the backend already exists — pure UI surfacing).

---

## 6. Add product source / sync

- **Current**: enter source connection details → save → trigger sync → see rows.
- **Friction**: Pattern 2 (form-first), Pattern 5 (no preview that the connection works until a separate sync).
- **Target**: enter the connection → "Test & preview" fetches a sample → show first rows + detected columns (name, price, stock) mapped automatically → confirm to save the source already validated.
- **Data source**: the sync service can do a bounded sample fetch; surface a few rows before committing the source.
- **Priority**: P2.

---

## 7. Edit persona / business hours / settings (inline)

- **Current**: change fields → (sometimes) a save button → unclear confirmation.
- **Friction**: Pattern 5 (invisible save state).
- **Target**: explicit Save with `saving…` → `saved ✓` toast; dirty-state indicator so the user knows there are unsaved changes; no silent-on-blur saves for important config.
- **Data source**: n/a (UI feedback only).
- **Priority**: P1 for anything that affects bot behavior (persona, knowledge, away message); P2 for cosmetic prefs.

---

## 8. Multi-step modals (cross-cutting)

- **Current**: account-add, campaign-create, bot-create span 2–3 steps with no counter.
- **Friction**: Pattern 5 (no "step X of Y").
- **Target**: a shared step indicator in the `Modal` component; titles that say where you are.
- **Data source**: n/a.
- **Priority**: P1 (small, broad win).

---

## Prioritization heuristic

Rank by **frequency × effort removed**:

- Daily, every-account flows (add account, switch bot, assign customer) outrank rare setup flows (add product source).
- Removing **typing** (free-text the user must compose) outranks removing a **click** (picking an obvious default).
- Surfacing data the backend **already computes** (`suggestBot`, recipient count) is the cheapest, highest-trust win — do these first.

## Anti-goals (do not "optimize" these away)

- Outbound send confirmation, campaign approve/start, deletes — these gates stay. The improvement is **showing impact** (how many recipients, conversations, customers affected), not removing the confirm.
- Role/permission checks behind a smart default — the default must still pass the same guard.
- Auto-detected values must stay **editable and labeled**; never silently commit inferred data as if the user entered it.

# Migration Design: Baileys → WAHA Sidecar

**Date:** 2026-06-24  
**Branch:** feat/baileys-to-waha  
**Status:** Approved for implementation

---

## 1. Goal

Replace the in-process Baileys library with a WAHA sidecar (docker container) as the WhatsApp transport layer. All business logic (AI pipeline, Hermes supervisor, CRM ingest, campaigns, analytics) stays untouched. Only the transport layer changes.

---

## 2. Decisions

| Question | Decision |
|---|---|
| Integration mode | Sidecar (WAHA as separate docker container) |
| WhatsApp engine | Configurable via `WAHA_ENGINE` env var (NOWEB default) |
| Inbound events | WebSocket — app connects to WAHA `/ws` as client |
| Session persistence | WAHA manages credentials via docker volume |

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                      Docker Compose                       │
│                                                           │
│  ┌───────────────────────────┐  ┌──────────────────────┐ │
│  │      NestJS App (api)     │  │    WAHA Sidecar      │ │
│  │                           │  │  (waha-core image)   │ │
│  │  WahaClientService ───────┼─→│  REST /api/*         │ │
│  │  (HTTP REST client)       │  │                      │ │
│  │                           │  │  Engine: NOWEB/GOWS/ │ │
│  │  WahaEventService ←───────┼──│  WEBJS/WPP           │ │
│  │  (WebSocket client /ws)   │  │                      │ │
│  │         │                 │  │  Session creds:      │ │
│  │         ↓                 │  │  docker volume       │ │
│  │  ┌──────────────────────┐ │  └──────────────────────┘ │
│  │  │  Existing Services   │ │                            │
│  │  │  (zero changes)      │ │  ┌──────────────────────┐ │
│  │  │  WaInboundService    │ │  │  PostgreSQL + Redis   │ │
│  │  │  WaMirrorService     │ │  └──────────────────────┘ │
│  │  │  ContactSyncService  │ │                            │
│  │  │  MessageIngestService│ │                            │
│  │  │  HermesService       │ │                            │
│  │  │  AiService           │ │                            │
│  │  └──────────────────────┘ │                            │
│  └───────────────────────────┘                            │
└──────────────────────────────────────────────────────────┘
```

**Session ID mapping:** `whatsappAccount.id` (UUID) = WAHA session name. No extra mapping table needed.

---

## 4. New Components (files to create)

### 4.1 `WahaClientService` — `modules/wa/waha-client.service.ts`

HTTP REST client wrapping every WAHA API endpoint the app needs.

**Responsibilities:**
- Session lifecycle: `createSession`, `startSession`, `stopSession`, `restartSession`, `deleteSession`, `getSessionStatus`
- Auth: `getQr`, `requestPairingCode`
- Send: `sendText`, `sendImage`, `sendFile`, `sendVoice`, `sendVideo`, `sendLocation`, `sendPoll`, `sendContact`, `sendSeen`, `startTyping`, `stopTyping`
- Message ops: `setReaction`, `setStar`, `forwardMessage`, `deleteMessage`, `editMessage`
- Chat ops: `setBlocked`, `setMuted`, `setArchived`, `setPinned`, `setDisappearing`
- Contacts: `getContacts`, `checkNumberStatus`, `fetchAvatar`
- Profile: `getMe` (phone number + name after QR scan)

Uses native `fetch` with `WAHA_API_URL` + `WAHA_API_KEY` from config. Throws `BadGatewayException` on WAHA errors so existing error handling in controllers stays valid.

All send methods apply **rate limiting** (20/min per account) via the existing per-account timestamp queue logic (extracted from `WaSendService` into a shared `WaRateLimiter` helper).

**Human delay:** `humanDelay()` + `typingDelay()` from `wa.util.ts` — preserved as-is.

### 4.2 `WahaEventService` — `modules/wa/waha-event.service.ts`

WebSocket client that connects to WAHA `/ws`, subscribes to all sessions (`*` wildcard), and routes incoming events to existing services.

**Responsibilities:**
- Connect to `ws://waha:3000/ws?x-api-key=...` on module init
- Auto-reconnect with exponential backoff on disconnect
- Subscribe to all session events via WAHA's session wildcard
- Route events by type:

| WAHA event | → Target |
|---|---|
| `message` | `WaInboundService.handleIncoming()` |
| `message.reaction` | `WaMirrorService.applyReaction()` |
| `message.revoked` | `WaMirrorService.applyRevoke()` |
| `message.edit` | `WaMirrorService.applyEdit()` |
| `message.ack` | `WaMirrorService.applyReceiptDetail()` |
| `chat.archive` / `chat.unarchive` | `WaMirrorService.applyChatMirrorState()` |
| `contact.upserted` | `ContactSyncService.syncContacts()` |
| `group.join` / `group.leave` / `group.update` | `WaMirrorService.applyGroupMetadata()` |
| `presence.update` | `EventsGateway.emit('wa:presence', ...)` |
| `call` | `WaMirrorService.logCall()` |
| `session.status` | `WaService.setStatus()` + QR/pairing-code handling |

- Normalises WAHA event payload to the same shape `WaInboundService` expects (adapter function per event type).

### 4.3 `WaRateLimiter` — `modules/wa/wa-rate-limiter.ts`

Extracted from current `WaSendService`. Per-account send timestamp queue enforcing 20 sends/60s. Used by `WahaClientService`. No behaviour change.

---

## 5. Modified Components

### 5.1 `WaService` — `modules/wa/wa.service.ts`

**Remove:**
- All Baileys imports (`@whiskeysockets/baileys`)
- `makeWASocket`, `useMultiFileAuthState`, `fetchLatestBaileysVersion`
- `WaSessionStore` (in-memory socket map — not needed, WAHA manages connections)
- `scheduleReconnect` (WAHA manages reconnection)
- `@Interval(60_000) healthCheck()` (replaced by WAHA session status polling via `WahaClientService.getSessionStatus()`)
- All Baileys event registration (`sock.ev.on(...)`)

**Keep:**
- `onModuleInit()` — iterate active accounts, call `WahaClientService.createSession()` + `startSession()` for each
- `startSession(accountId)` → `WahaClientService.createSession() + startSession()`
- `restart(accountId)` → `WahaClientService.restartSession()`
- `removeAccount(accountId)` → `WahaClientService.deleteSession()` + DB delete
- `getQr(accountId)` → `WahaClientService.getQr()`
- `getMetadata(accountId)` → `WahaClientService.getMe()`
- `getHealth(accountId)` → `WahaClientService.getSessionStatus()`
- `setStatus()` — unchanged (updates DB + emits socket event)
- All send facade methods → now delegate to `WahaClientService` instead of `WaSendService`

**Remove dependency on:** `WaSendService`, `WaInboundService`, `WaMirrorService` (these are now wired directly in `WahaEventService`).

### 5.2 `WaController` — `modules/wa/wa.controller.ts`

No route changes. Internal calls replace `waService.send*()` which now delegates to `WahaClientService`. Controller is unaware of the change.

### 5.3 `wa.module.ts`

**Add providers:** `WahaClientService`, `WahaEventService`, `WaRateLimiter`  
**Remove providers:** `WaSessionStore`, `WaSendService` (logic merged into `WahaClientService`)

### 5.4 `docker-compose.yml`

Add WAHA service:

```yaml
waha:
  image: devlikeapro/waha:latest
  environment:
    - WAHA_ENGINE=${WAHA_ENGINE:-NOWEB}
    - WHATSAPP_API_KEY=${WAHA_API_KEY}
    - WAHA_BASE_URL=http://waha:3000
  volumes:
    - waha_sessions:/app/.sessions
  ports:
    - "3002:3000"   # expose for local dev; internal network for prod
  restart: unless-stopped
  networks:
    - hermes_net
```

### 5.5 `.env.example`

Add:
```
WAHA_API_URL=http://waha:3000
WAHA_API_KEY=changeme
WAHA_ENGINE=NOWEB
```

---

## 6. Removed Components (delete after migration)

| File | Reason |
|---|---|
| `wa-send.service.ts` | Logic moved to `WahaClientService` |
| `wa-inbound.service.ts` | Event wiring moved to `WahaEventService` (service itself kept, caller changes) |
| `wa-session.store.ts` | No longer needed — WAHA manages connection state |
| `@whiskeysockets/baileys` | Removed from `package.json` |

> Note: `wa-inbound.service.ts` **business logic is kept**; only the caller changes from `WaService` Baileys event handler to `WahaEventService`.

---

## 7. Event Payload Normalisation

WAHA WebSocket emits events in this envelope:

```json
{
  "event": "message",
  "session": "account-uuid",
  "payload": { ... }
}
```

`WahaEventService` contains one normaliser function per event type that converts the WAHA payload to the exact shape each existing service expects. This keeps existing services untouched.

Example — inbound message normaliser:
```ts
function normaliseMessage(wahaPayload): IncomingMessageShape {
  return {
    key: { remoteJid: wahaPayload.from, fromMe: wahaPayload.fromMe, id: wahaPayload.id },
    message: wahaPayload.body,
    messageTimestamp: wahaPayload.timestamp,
    pushName: wahaPayload.notifyName,
  };
}
```

---

## 8. WAHA Features to Enable (all via env/config, no code change)

| Feature | WAHA config | Notes |
|---|---|---|
| Typing delay simulation | App-side (wa.util.ts humanDelay preserved) | Same behaviour |
| Session auto-reconnect | WAHA built-in | Remove our reconnect logic |
| QR refresh | WAHA built-in | Get via REST |
| Multi-account | WAHA sessions per account | One session per `whatsappAccount.id` |
| Pairing code | `POST /api/:session/auth/request-code` | Same UX |
| Groups | WAHA group events + REST | Full parity |
| Media | WAHA media download + upload | Replace Baileys media download |
| Reactions, star, pin | WAHA REST endpoints | Full parity |
| Labels | WAHA `/api/:session/labels` | New capability vs Baileys |
| Channels (Newsletter) | WAHA `/api/:session/channels` | New capability vs Baileys |
| Calls (auto-reject) | WAHA `call` event | Same behaviour |
| Presence/typing | WAHA presence events | Same behaviour |
| Contact sync | WAHA contact events | Same behaviour |
| LID resolution | WAHA handles internally (NOWEB) | Removed our LID code |

---

## 9. Migration Sequence

1. **Add WAHA to docker-compose** + env vars → verify WAHA starts, `/health` returns OK
2. **Create `WaRateLimiter`** — extract from `WaSendService`, add unit tests
3. **Create `WahaClientService`** — REST wrapper, unit tests with mocked fetch
4. **Create `WahaEventService`** — WS client + event routing, integration test with WAHA running
5. **Refactor `WaService`** — swap Baileys → WAHA calls, keep all public methods
6. **Update `wa.module.ts`** — swap providers
7. **Delete Baileys files** — `wa-send.service.ts`, `wa-session.store.ts`, remove Baileys from package.json
8. **E2E smoke test** — QR scan → message in → AI reply → message out
9. **Enable new WAHA features** — labels, channels (add endpoints if needed)

---

## 10. Out of Scope

- Frontend changes (zero)
- DB schema changes (zero)
- Hermes, AI, campaigns, analytics, CRM (zero)
- WAHA multi-instance / horizontal scaling (future iteration)
- WAHA PLUS features (newsletter, etc. — future iteration)

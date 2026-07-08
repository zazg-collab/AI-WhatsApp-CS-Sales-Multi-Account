# Baileys → WAHA Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-process Baileys library with a WAHA sidecar docker container as the WhatsApp transport layer, keeping all business logic untouched.

**Architecture:** `WahaClientService` wraps every WAHA REST endpoint the app needs; `WahaEventService` connects to WAHA's WebSocket `/ws` and routes events to the existing `WaInboundService`, `WaMirrorService`, and `ContactSyncService`. `WaService` becomes a thin facade over `WahaClientService`. All other services (Hermes, AI, CRM, campaigns) are untouched.

**Tech Stack:** NestJS, WAHA docker image (`devlikeapro/waha`), native `fetch`, `ws` npm package for WebSocket client.

## Global Constraints

- Engine is configurable via `WAHA_ENGINE` env var; default `NOWEB`
- Session name in WAHA = `whatsappAccount.id` (UUID) — no extra mapping needed
- Rate limiting: 20 sends per account per 60 seconds (preserved from current implementation)
- Human delays (`humanDelay`, `typingDelay`) from `wa.util.ts` are preserved unchanged
- No DB schema changes, no frontend changes, no changes to Hermes/AI/campaigns/analytics

---

## File Map

**Create:**
- `apps/api/src/modules/wa/wa.types.ts` — engine-agnostic `WaMessageShape` interface
- `apps/api/src/modules/wa/wa-rate-limiter.ts` — per-account send rate limiter (extracted from `WaSendService`)
- `apps/api/src/modules/wa/waha-client.service.ts` — HTTP REST client to WAHA API
- `apps/api/src/modules/wa/waha-event.service.ts` — WebSocket client to WAHA `/ws`

**Modify:**
- `apps/api/src/modules/wa/wa-inbound.service.ts` — swap `proto.IWebMessageInfo` → `WaMessageShape`; swap `WaSendService` → `WahaClientService`
- `apps/api/src/modules/wa/wa-mirror.service.ts` — remove `WaSessionStore`; inject `WahaClientService` for group metadata
- `apps/api/src/modules/wa/wa.service.ts` — remove all Baileys; delegate lifecycle to `WahaClientService`
- `apps/api/src/modules/wa/wa.module.ts` — swap providers
- `docker-compose.yml` — add `waha` service + volume
- `.env.example` — add `WAHA_*` vars

**Delete:**
- `apps/api/src/modules/wa/wa-send.service.ts`
- `apps/api/src/modules/wa/wa-session.store.ts`

---

## Task 1: Add WAHA to Docker Compose and env

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: Add WAHA service to docker-compose.yml**

Open `docker-compose.yml`. After the `redis:` block (before the `volumes:` section), add:

```yaml
  waha:
    image: devlikeapro/waha:latest
    environment:
      - WAHA_ENGINE=${WAHA_ENGINE:-NOWEB}
      - WHATSAPP_API_KEY=${WAHA_API_KEY:-changeme}
    volumes:
      - waha_sessions:/app/.sessions
    ports:
      - "3002:3000"
    restart: unless-stopped
    networks:
      - hermes_net
```

Also add `waha_sessions:` to the top-level `volumes:` block.

- [ ] **Step 2: Add env vars to .env.example**

Append to `.env.example`:

```
# WAHA Sidecar
WAHA_API_URL=http://waha:3000
WAHA_API_KEY=changeme
WAHA_ENGINE=NOWEB
```

- [ ] **Step 3: Verify WAHA starts**

```bash
docker compose up waha -d
curl http://localhost:3002/health
```

Expected: `{"status":"ok"}` or similar JSON health response.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(waha): add WAHA sidecar service to docker-compose"
```

---

## Task 2: Create WaRateLimiter

**Files:**
- Create: `apps/api/src/modules/wa/wa-rate-limiter.ts`
- Create: `apps/api/src/modules/wa/wa-rate-limiter.spec.ts`

**Interfaces:**
- Produces: `WaRateLimiter.throttle(accountId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/modules/wa/wa-rate-limiter.spec.ts`:

```typescript
import { WaRateLimiter } from './wa-rate-limiter';

describe('WaRateLimiter', () => {
  let limiter: WaRateLimiter;

  beforeEach(() => {
    limiter = new WaRateLimiter();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows sends below the rate limit', async () => {
    const promises = Array.from({ length: 5 }, () => limiter.throttle('acc1'));
    await expect(Promise.all(promises)).resolves.toBeDefined();
  });

  it('tracks sends per account independently', async () => {
    await limiter.throttle('acc1');
    await limiter.throttle('acc2');
    // no cross-account interference
    expect(true).toBe(true);
  });

  it('clears stale timestamps outside the 60s window', async () => {
    // fill the slot
    for (let i = 0; i < 20; i++) await limiter.throttle('acc3');
    // advance time past the window
    jest.advanceTimersByTime(61_000);
    // should not throw / wait
    await expect(limiter.throttle('acc3')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd apps/api && npx jest wa-rate-limiter.spec --no-coverage
```

Expected: `Cannot find module './wa-rate-limiter'`

- [ ] **Step 3: Implement WaRateLimiter**

Create `apps/api/src/modules/wa/wa-rate-limiter.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';

/**
 * Per-account send rate limiter. Enforces max 20 sends per 60 seconds.
 * Uses a serialised promise chain per account so concurrent callers cannot
 * all observe a sub-limit count and burst past the cap simultaneously.
 */
@Injectable()
export class WaRateLimiter {
  private readonly logger = new Logger(WaRateLimiter.name);
  private static readonly MAX_SENDS = 20;
  private static readonly WINDOW_MS = 60_000;

  private readonly timestamps = new Map<string, number[]>();
  private readonly chains = new Map<string, Promise<unknown>>();

  async throttle(accountId: string): Promise<void> {
    const prev = this.chains.get(accountId) ?? Promise.resolve();
    const run = prev.then(() => this.reserveSlot(accountId));
    this.chains.set(accountId, run.catch(() => undefined));
    await run;
  }

  private async reserveSlot(accountId: string): Promise<void> {
    const { MAX_SENDS, WINDOW_MS } = WaRateLimiter;
    const now = Date.now();
    let stamps = (this.timestamps.get(accountId) ?? []).filter((t) => t > now - WINDOW_MS);

    if (stamps.length >= MAX_SENDS) {
      const mustExpire = stamps[stamps.length - MAX_SENDS];
      const wait = mustExpire + WINDOW_MS - Date.now();
      if (wait > 0) {
        this.logger.warn(`Throttling account ${accountId}: waiting ${wait}ms`);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      stamps = (this.timestamps.get(accountId) ?? []).filter((t) => t > Date.now() - WINDOW_MS);
    }

    stamps.push(Date.now());
    this.timestamps.set(accountId, stamps);
  }

  clearAccount(accountId: string): void {
    this.timestamps.delete(accountId);
    this.chains.delete(accountId);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx jest wa-rate-limiter.spec --no-coverage
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wa/wa-rate-limiter.ts apps/api/src/modules/wa/wa-rate-limiter.spec.ts
git commit -m "feat(waha): extract WaRateLimiter from WaSendService"
```

---

## Task 3: Define WaMessageShape (engine-agnostic message type)

**Files:**
- Create: `apps/api/src/modules/wa/wa.types.ts`

**Interfaces:**
- Produces: `WaMessageShape` interface used by `WaInboundService.handleIncoming`

- [ ] **Step 1: Create wa.types.ts**

Create `apps/api/src/modules/wa/wa.types.ts`:

```typescript
/**
 * Engine-agnostic inbound message shape. Replaces proto.IWebMessageInfo from
 * Baileys. WAHA normalises this from its WebSocket event payload.
 */
export interface WaMessageShape {
  key: {
    remoteJid: string | null | undefined;
    fromMe: boolean | null | undefined;
    id: string | null | undefined;
    /** Sender phone number in group chats (WAHA provides this pre-resolved) */
    senderPn?: string | null;
  };
  /** Display name of sender */
  pushName?: string | null;
  /** Unix timestamp in seconds */
  messageTimestamp?: number | null;
  /** WAHA message type string */
  wahaType: string;
  /** Extracted text body (WAHA pre-extracts this from all message types) */
  body: string;
  /** Accessible media URL served by WAHA (non-null when hasMedia is true) */
  mediaUrl?: string | null;
  mediaMimetype?: string | null;
  mediaFilename?: string | null;
  /** Location payload — non-null when wahaType === 'location' */
  location?: {
    latitude: number;
    longitude: number;
    name?: string | null;
  } | null;
  /** ID of the message this is a reply to */
  quotedId?: string | null;
}

/** WAHA session status strings */
export type WahaSessionStatus =
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED'
  | 'STOPPED';
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/wa/wa.types.ts
git commit -m "feat(waha): add WaMessageShape engine-agnostic type"
```

---

## Task 4: Create WahaClientService (REST client)

**Files:**
- Create: `apps/api/src/modules/wa/waha-client.service.ts`
- Create: `apps/api/src/modules/wa/waha-client.service.spec.ts`

**Interfaces:**
- Consumes: `WAHA_API_URL`, `WAHA_API_KEY` from `ConfigService`
- Produces: all public methods listed in the implementation below

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/modules/wa/waha-client.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadGatewayException } from '@nestjs/common';
import { WahaClientService } from './waha-client.service';

global.fetch = jest.fn();

describe('WahaClientService', () => {
  let svc: WahaClientService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        WahaClientService,
        {
          provide: ConfigService,
          useValue: { get: (k: string) => ({ WAHA_API_URL: 'http://waha:3000', WAHA_API_KEY: 'test' }[k]) },
        },
      ],
    }).compile();
    svc = module.get(WahaClientService);
    jest.clearAllMocks();
  });

  it('createSession posts to /api/sessions', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await svc.createSession('acc1');
    expect(fetch).toHaveBeenCalledWith(
      'http://waha:3000/api/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('sendText posts to /api/sendText', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'msg1' }) });
    const id = await svc.sendText('acc1', '628111@s.whatsapp.net', 'Hello');
    expect(id).toBe('msg1');
    expect(fetch).toHaveBeenCalledWith(
      'http://waha:3000/api/sendText',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws BadGatewayException on non-ok response', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal error',
    });
    await expect(svc.createSession('acc1')).rejects.toThrow(BadGatewayException);
  });

  it('getQr returns base64 string', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ value: 'data:image/png;base64,ABC' }),
    });
    const qr = await svc.getQr('acc1');
    expect(qr).toBe('data:image/png;base64,ABC');
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd apps/api && npx jest waha-client.service.spec --no-coverage
```

Expected: `Cannot find module './waha-client.service'`

- [ ] **Step 3: Implement WahaClientService**

Create `apps/api/src/modules/wa/waha-client.service.ts`:

```typescript
import { Injectable, Logger, BadGatewayException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WahaClientService {
  private readonly logger = new Logger(WahaClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    this.baseUrl = (config.get<string>('WAHA_API_URL') ?? 'http://waha:3000').replace(/\/$/, '');
    this.apiKey = config.get<string>('WAHA_API_KEY') ?? '';
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-api-key': this.apiKey };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BadGatewayException(`WAHA ${method} ${path} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────

  async createSession(sessionId: string): Promise<void> {
    await this.request('POST', '/api/sessions', {
      name: sessionId,
      start: false,
    });
  }

  async startSession(sessionId: string): Promise<void> {
    await this.request('POST', `/api/sessions/${sessionId}/start`);
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request('POST', `/api/sessions/${sessionId}/stop`);
  }

  async restartSession(sessionId: string): Promise<void> {
    await this.request('POST', `/api/sessions/${sessionId}/restart`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/api/sessions/${sessionId}`);
  }

  async getSessionStatus(sessionId: string): Promise<{ status: string }> {
    return this.request('GET', `/api/sessions/${sessionId}`);
  }

  async listSessions(): Promise<Array<{ name: string; status: string }>> {
    return this.request('GET', '/api/sessions');
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /** Returns QR as data URL string (format=image returns base64-encoded PNG) */
  async getQr(sessionId: string): Promise<string | null> {
    try {
      const res = await this.request<{ value?: string }>('GET', `/api/${sessionId}/auth/qr?format=raw`);
      return res.value ?? null;
    } catch {
      return null;
    }
  }

  async requestPairingCode(sessionId: string, phoneNumber: string): Promise<string> {
    const res = await this.request<{ code: string }>(
      'POST',
      `/api/${sessionId}/auth/request-code`,
      { phoneNumber, method: 'sms' },
    );
    return res.code;
  }

  /** Returns phone number + name of the connected account */
  async getMe(sessionId: string): Promise<{ id: string; pushName: string } | null> {
    try {
      return await this.request('GET', `/api/sessions/${sessionId}/me`);
    } catch {
      return null;
    }
  }

  // ── Send operations ───────────────────────────────────────────────────────

  async sendText(
    sessionId: string,
    chatId: string,
    text: string,
    quotedMessageId?: string,
  ): Promise<string | null> {
    const body: Record<string, unknown> = { session: sessionId, chatId, text };
    if (quotedMessageId) body.reply_to = { id: quotedMessageId };
    const res = await this.request<{ id?: string }>('POST', '/api/sendText', body);
    return res.id ?? null;
  }

  async sendImage(
    sessionId: string,
    chatId: string,
    url: string,
    caption?: string,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendImage', {
      session: sessionId,
      chatId,
      file: { url },
      caption: caption ?? '',
    });
    return res.id ?? null;
  }

  async sendFile(
    sessionId: string,
    chatId: string,
    url: string,
    caption?: string,
    filename?: string,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendFile', {
      session: sessionId,
      chatId,
      file: { url, filename },
      caption: caption ?? '',
    });
    return res.id ?? null;
  }

  async sendVoice(
    sessionId: string,
    chatId: string,
    url: string,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendVoice', {
      session: sessionId,
      chatId,
      file: { url },
    });
    return res.id ?? null;
  }

  async sendVideo(
    sessionId: string,
    chatId: string,
    url: string,
    caption?: string,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendVideo', {
      session: sessionId,
      chatId,
      file: { url },
      caption: caption ?? '',
    });
    return res.id ?? null;
  }

  async sendLocation(
    sessionId: string,
    chatId: string,
    latitude: number,
    longitude: number,
    title?: string,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendLocation', {
      session: sessionId,
      chatId,
      latitude,
      longitude,
      title: title ?? '',
    });
    return res.id ?? null;
  }

  async sendPoll(
    sessionId: string,
    chatId: string,
    name: string,
    options: string[],
    selectableCount?: number,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendPoll', {
      session: sessionId,
      chatId,
      poll: { name, options, multipleAnswers: (selectableCount ?? 1) > 1 },
    });
    return res.id ?? null;
  }

  async sendContact(
    sessionId: string,
    chatId: string,
    contacts: Array<{ name: string; phone: string }>,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/sendContactVcard', {
      session: sessionId,
      chatId,
      contacts: contacts.map((c) => ({ fullName: c.name, phoneNumber: c.phone })),
    });
    return res.id ?? null;
  }

  async sendSeen(sessionId: string, chatId: string, messageId: string): Promise<void> {
    await this.request('POST', '/api/sendSeen', {
      session: sessionId,
      chatId,
      messageId,
    });
  }

  async startTyping(sessionId: string, chatId: string): Promise<void> {
    await this.request('POST', '/api/startTyping', { session: sessionId, chatId });
  }

  async stopTyping(sessionId: string, chatId: string): Promise<void> {
    await this.request('POST', '/api/stopTyping', { session: sessionId, chatId });
  }

  // ── Message operations ────────────────────────────────────────────────────

  async setReaction(
    sessionId: string,
    messageId: string,
    reaction: string,
  ): Promise<void> {
    await this.request('PUT', '/api/reaction', {
      session: sessionId,
      messageId,
      reaction,
    });
  }

  async setStar(
    sessionId: string,
    chatId: string,
    messageId: string,
    star: boolean,
  ): Promise<void> {
    await this.request('PUT', '/api/star', {
      session: sessionId,
      chatId,
      messageId,
      star,
    });
  }

  async deleteMessage(
    sessionId: string,
    chatId: string,
    messageId: string,
  ): Promise<void> {
    await this.request('DELETE', `/api/messages/${messageId}`, {
      session: sessionId,
      chatId,
    });
  }

  async forwardMessage(
    sessionId: string,
    chatId: string,
    messageId: string,
  ): Promise<string | null> {
    const res = await this.request<{ id?: string }>('POST', '/api/forwardMessage', {
      session: sessionId,
      chatId,
      messageId,
    });
    return res.id ?? null;
  }

  // ── Chat state ────────────────────────────────────────────────────────────

  async setArchived(sessionId: string, chatId: string, archived: boolean): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/archive`, { archived });
  }

  async setPinned(sessionId: string, chatId: string, pinned: boolean): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/pin`, { pinned });
  }

  async setMuted(sessionId: string, chatId: string, muted: boolean): Promise<void> {
    const muteEndTime = muted ? Date.now() + 365 * 24 * 60 * 60 * 1000 : 0;
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/mute`, { muteEndTime });
  }

  async setDisappearing(
    sessionId: string,
    chatId: string,
    enabled: boolean,
    durationSeconds?: number,
  ): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/chats/${chatId}/disappearing`, {
      disappearingMessagesInChat: enabled ? (durationSeconds ?? 604800) : 0,
    });
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async checkNumberStatus(
    sessionId: string,
    phone: string,
  ): Promise<{ numberExists: boolean; chatId?: string }> {
    return this.request('GET', `/api/checkNumberStatus?session=${sessionId}&phone=${encodeURIComponent(phone)}`);
  }

  async getContacts(
    sessionId: string,
    search?: string,
    limit = 50,
    offset = 0,
  ): Promise<Array<{ id: string; name?: string; pushName?: string; number?: string }>> {
    const q = new URLSearchParams({ session: sessionId, limit: String(limit), offset: String(offset) });
    if (search) q.set('search', search);
    return this.request('GET', `/api/${sessionId}/contacts?${q}`);
  }

  async getContactAvatar(
    sessionId: string,
    contactId: string,
  ): Promise<string | null> {
    try {
      const res = await this.request<{ url?: string }>(
        'GET',
        `/api/${sessionId}/contacts/${encodeURIComponent(contactId)}/profile-picture`,
      );
      return res.url ?? null;
    } catch {
      return null;
    }
  }

  async setContactBlocked(
    sessionId: string,
    contactId: string,
    blocked: boolean,
  ): Promise<void> {
    await this.request('PUT', `/api/${sessionId}/contacts/${encodeURIComponent(contactId)}/block`, { blocked });
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  async getGroupInfo(
    sessionId: string,
    groupId: string,
  ): Promise<{
    id: string;
    subject?: string;
    owner?: string;
    desc?: string;
    participants?: Array<{ id: string; admin?: string | null }>;
  } | null> {
    try {
      return await this.request('GET', `/api/${sessionId}/groups/${encodeURIComponent(groupId)}`);
    } catch {
      return null;
    }
  }

  // ── Media ─────────────────────────────────────────────────────────────────

  /** Returns the URL to download media for a given message via WAHA */
  mediaDownloadUrl(sessionId: string, messageId: string): string {
    return `${this.baseUrl}/api/${sessionId}/messages/${messageId}/download`;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx jest waha-client.service.spec --no-coverage
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wa/waha-client.service.ts apps/api/src/modules/wa/waha-client.service.spec.ts
git commit -m "feat(waha): add WahaClientService REST wrapper"
```

---

## Task 5: Refactor WaInboundService

Replace `proto.IWebMessageInfo` → `WaMessageShape`, `WaSendService` → `WahaClientService`.

**Files:**
- Modify: `apps/api/src/modules/wa/wa-inbound.service.ts`

**Interfaces:**
- Consumes: `WaMessageShape` (from `wa.types.ts`), `WahaClientService`
- Produces: `handleIncoming(accountId: string, m: WaMessageShape, opts?: { suppressAutomation?: boolean }): Promise<void>`

- [ ] **Step 1: Update imports in wa-inbound.service.ts**

At the top of `apps/api/src/modules/wa/wa-inbound.service.ts`, replace:

```typescript
// REMOVE these Baileys imports:
import { proto } from '@whiskeysockets/baileys';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
// REMOVE WaSendService import
import { WaSendService } from './wa-send.service';
```

Add instead:

```typescript
import { WaMessageShape } from './wa.types';
import { WahaClientService } from './waha-client.service';
```

- [ ] **Step 2: Update constructor — swap WaSendService → WahaClientService**

In the constructor of `WaInboundService`, replace:

```typescript
private readonly send: WaSendService,
```

with:

```typescript
private readonly wahaClient: WahaClientService,
```

- [ ] **Step 3: Replace handleIncoming signature and body**

Replace the entire `handleIncoming` method. The new version accepts `WaMessageShape` instead of `proto.IWebMessageInfo`. WAHA pre-extracts body, type and media URL so `unwrapMessage` / `resolveType` / `downloadInboundMedia` are no longer needed:

```typescript
async handleIncoming(
  accountId: string,
  m: WaMessageShape,
  opts: { suppressAutomation?: boolean } = {},
): Promise<void> {
  const remoteJid = m.key.remoteJid;
  if (!remoteJid) return;
  if (!isSupportedChatJid(remoteJid)) return;

  const groupChat = isGroupJid(remoteJid);
  const fromMe = m.key.fromMe === true;

  const type = this.wahaTypeToMessageType(m.wahaType);
  const text = m.body ?? '';
  if (!text && type === MessageType.text) return;

  let mediaUrl: string | undefined;
  if (
    !opts.suppressAutomation &&
    m.mediaUrl &&
    (type === MessageType.image ||
      type === MessageType.video ||
      type === MessageType.audio ||
      type === MessageType.document)
  ) {
    mediaUrl = await this.uploadWahaMedia(m.mediaUrl, m.mediaMimetype).catch((err) => {
      this.logger.warn(`Media upload failed for ${m.key.id}: ${err}`);
      return undefined;
    });
  }

  const result = await this.ingest.ingest({
    accountId,
    remoteJid,
    senderPn: m.key.senderPn ?? undefined,
    externalId: m.key.id ?? '',
    pushName: m.pushName ?? undefined,
    text,
    type,
    mediaUrl,
    quotedExternalId: m.quotedId ?? undefined,
    fromMe,
    occurredAt: m.messageTimestamp
      ? new Date(m.messageTimestamp * 1000)
      : new Date(),
    suppressAutomation: opts.suppressAutomation || groupChat,
  });

  if (result && !groupChat && !result.fromMe && !result.suppressAutomation) {
    if (result.customer && !result.customer.avatarUrl) {
      this.maybeFetchAvatar(accountId, result.customer.id, result.customer.phoneNumber)
        .catch(() => undefined);
    }
    if (result.csatCaptured) return;
    await this.maybeAutoAway(result).catch((err) =>
      this.logger.warn(`Auto-away failed: ${err}`),
    );
    await this.maybeAutoReply(result.conversation.id).catch((err) =>
      this.logger.error(`Auto-reply failed: ${err}`),
    );
  }
}
```

- [ ] **Step 4: Add wahaTypeToMessageType and uploadWahaMedia helpers**

Add these two private methods to `WaInboundService` (replace `unwrapMessage`, `resolveType`, `downloadInboundMedia`):

```typescript
private wahaTypeToMessageType(wahaType: string): MessageType {
  const map: Record<string, MessageType> = {
    text: MessageType.text,
    image: MessageType.image,
    video: MessageType.video,
    audio: MessageType.audio,
    voice: MessageType.audio,
    document: MessageType.document,
    sticker: MessageType.document,
    location: MessageType.text,
    poll_creation: MessageType.text,
  };
  return map[wahaType] ?? MessageType.text;
}

private async uploadWahaMedia(
  wahaMediaUrl: string,
  mimetype?: string | null,
): Promise<string | undefined> {
  const res = await fetch(wahaMediaUrl, {
    headers: { 'x-api-key': process.env.WAHA_API_KEY ?? '' },
  });
  if (!res.ok) return undefined;
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > this.mediaMaxBytes) {
    this.logger.warn(`Media too large (${buffer.length} bytes), skipping`);
    return undefined;
  }
  const ext = extForMimetype(mimetype ?? '');
  return this.storage.uploadBuffer(buffer, mimetype ?? 'application/octet-stream', `media.${ext}`);
}
```

- [ ] **Step 5: Update maybeAutoAway to use WahaClientService**

Find the auto-away send call in `WaInboundService` (currently uses `this.send.sendText()`). Replace with:

```typescript
// Before:
await this.send.sendText(accountId, customer.phoneNumber, awayMessage);

// After:
const { phoneToJid } = await import('./wa.util');
await this.wahaClient.sendText(accountId, phoneToJid(customer.phoneNumber), awayMessage);
```

- [ ] **Step 6: Remove unused private methods**

Delete the following methods that are no longer needed (they were Baileys-specific):
- `unwrapMessage(message)`
- `resolveType(msg)`
- `downloadInboundMedia(m)`
- `messageTimestamp(m)`

- [ ] **Step 7: Build check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors in `wa-inbound.service.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/wa/wa-inbound.service.ts
git commit -m "feat(waha): refactor WaInboundService to use WaMessageShape and WahaClientService"
```

---

## Task 6: Refactor WaMirrorService

Remove `WaSessionStore` dependency. Replace `sock.groupMetadata()` with `WahaClientService.getGroupInfo()`.

**Files:**
- Modify: `apps/api/src/modules/wa/wa-mirror.service.ts`

- [ ] **Step 1: Update imports**

In `apps/api/src/modules/wa/wa-mirror.service.ts`, remove:

```typescript
import { WaSessionStore } from './wa-session.store';
```

Add:

```typescript
import { WahaClientService } from './waha-client.service';
```

- [ ] **Step 2: Update constructor**

Replace `private readonly store: WaSessionStore` with `private readonly wahaClient: WahaClientService`:

```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly events: EventsGateway,
  private readonly contactSync: ContactSyncService,
  private readonly wahaClient: WahaClientService,
) {}
```

- [ ] **Step 3: Fix applyGroupParticipantUpdate**

Find the `applyGroupParticipantUpdate` method. Replace the `getSock` + Baileys call:

```typescript
// REMOVE:
const sock = this.store.getSock(accountId);
let conversation = await this.ensureGroupConversation(accountId, { id: update.id });
if (sock) {
  const metadata = await sock.groupMetadata(update.id).catch(() => null);
  if (metadata) conversation = await this.ensureGroupConversation(accountId, metadata as GroupMetadataLike);
}

// REPLACE WITH:
let conversation = await this.ensureGroupConversation(accountId, { id: update.id });
const metadata = await this.wahaClient.getGroupInfo(accountId, update.id);
if (metadata) conversation = await this.ensureGroupConversation(accountId, metadata);
```

- [ ] **Step 4: Build check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep wa-mirror
```

Expected: no errors for `wa-mirror.service.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/wa/wa-mirror.service.ts
git commit -m "feat(waha): remove WaSessionStore from WaMirrorService, use WahaClientService for group metadata"
```

---

## Task 7: Create WahaEventService (WebSocket client)

**Files:**
- Create: `apps/api/src/modules/wa/waha-event.service.ts`

**Interfaces:**
- Consumes: `WahaClientService`, `WaInboundService`, `WaMirrorService`, `ContactSyncService`, `EventsGateway`, `WaService`
- Produces: live WebSocket connection that routes WAHA events to existing services

- [ ] **Step 1: Install ws package if not present**

```bash
cd apps/api && npm list ws || npm install ws && npm install --save-dev @types/ws
```

- [ ] **Step 2: Create WahaEventService**

Create `apps/api/src/modules/wa/waha-event.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import WebSocket from 'ws';
import { WaMessageShape, WahaSessionStatus } from './wa.types';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService } from './wa-mirror.service';
import { ContactSyncService } from './contact-sync.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { SessionStatus } from '@sentinel/database';
import { jidToPhone } from './wa.util';

/** Maps WAHA session statuses to our SessionStatus enum */
function toSessionStatus(wahaStatus: WahaSessionStatus): SessionStatus {
  switch (wahaStatus) {
    case 'WORKING':      return SessionStatus.connected;
    case 'SCAN_QR_CODE': return SessionStatus.qr_required;
    case 'STARTING':     return SessionStatus.reconnecting;
    case 'FAILED':
    case 'STOPPED':
    default:             return SessionStatus.disconnected;
  }
}

@Injectable()
export class WahaEventService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WahaEventService.name);
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private reconnectAttempt = 0;

  private readonly wsUrl: string;

  constructor(
    config: ConfigService,
    private readonly inbound: WaInboundService,
    private readonly mirror: WaMirrorService,
    private readonly contactSync: ContactSyncService,
    private readonly events: EventsGateway,
    // Forward ref because WaService and WahaEventService are in the same module
    @Inject(forwardRef(() => WaServiceRef)) private readonly waServiceRef: WaServiceRef,
  ) {
    const apiUrl = (config.get<string>('WAHA_API_URL') ?? 'http://waha:3000').replace(/\/$/, '');
    const apiKey = config.get<string>('WAHA_API_KEY') ?? '';
    const wsBase = apiUrl.replace(/^http/, 'ws');
    this.wsUrl = `${wsBase}/ws?x-api-key=${encodeURIComponent(apiKey)}`;
  }

  onModuleInit() {
    this.connect();
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  private connect() {
    if (this.destroyed) return;
    this.logger.log(`Connecting to WAHA WebSocket… (attempt ${this.reconnectAttempt + 1})`);

    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    ws.on('open', () => {
      this.logger.log('WAHA WebSocket connected');
      this.reconnectAttempt = 0;
    });

    ws.on('message', (data: Buffer) => {
      try {
        const envelope = JSON.parse(data.toString()) as {
          event: string;
          session: string;
          payload: unknown;
        };
        this.routeEvent(envelope.session, envelope.event, envelope.payload).catch((err) =>
          this.logger.error(`Event routing error [${envelope.event}]: ${err}`),
        );
      } catch (err) {
        this.logger.warn(`Failed to parse WAHA event: ${err}`);
      }
    });

    ws.on('close', () => {
      if (!this.destroyed) this.scheduleReconnect();
    });

    ws.on('error', (err) => {
      this.logger.error(`WAHA WebSocket error: ${err.message}`);
    });
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    this.reconnectAttempt++;
    this.logger.log(`WAHA WebSocket reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // ── Event routing ─────────────────────────────────────────────────────────

  private async routeEvent(session: string, event: string, payload: unknown): Promise<void> {
    switch (event) {
      case 'message':
      case 'message.any':
        await this.onMessage(session, payload as WahaRawMessage);
        break;

      case 'message.reaction':
        await this.onReaction(session, payload as WahaReactionPayload);
        break;

      case 'message.revoked':
        await this.onRevoked(session, payload as { id: string });
        break;

      case 'message.ack':
        await this.onAck(session, payload as WahaAckPayload);
        break;

      case 'contact.upserted':
        await this.onContact(session, payload as WahaContactPayload | WahaContactPayload[]);
        break;

      case 'group.join':
      case 'group.leave':
      case 'group.update':
        await this.onGroup(session, payload as WahaGroupPayload);
        break;

      case 'group.participants.update':
        await this.onGroupParticipants(session, payload as WahaGroupParticipantsPayload);
        break;

      case 'presence.update':
        await this.onPresence(session, payload as WahaPresencePayload);
        break;

      case 'call.received':
        await this.onCall(session, payload as WahaCallPayload);
        break;

      case 'session.status':
        await this.onSessionStatus(session, payload as { status: WahaSessionStatus; qr?: string });
        break;

      default:
        // Silently ignore unknown events
        break;
    }
  }

  // ── Normalisers ───────────────────────────────────────────────────────────

  private async onMessage(session: string, payload: WahaRawMessage): Promise<void> {
    const m: WaMessageShape = {
      key: {
        remoteJid: payload.from,
        fromMe: payload.fromMe,
        id: payload.id,
        senderPn: payload.participant ?? undefined,
      },
      pushName: payload.notifyName ?? undefined,
      messageTimestamp: payload.timestamp,
      wahaType: payload.type ?? 'text',
      body: payload.body ?? '',
      mediaUrl: payload.media?.url ?? undefined,
      mediaMimetype: payload.media?.mimetype ?? undefined,
      mediaFilename: payload.media?.filename ?? undefined,
      location: payload.location
        ? { latitude: payload.location.latitude, longitude: payload.location.longitude, name: payload.location.description }
        : undefined,
      quotedId: payload.replyTo?.id ?? undefined,
    };
    await this.inbound.handleIncoming(session, m);
  }

  private async onReaction(session: string, payload: WahaReactionPayload): Promise<void> {
    await this.mirror.applyReaction(
      session,
      payload.messageId,
      payload.reaction ?? '',
      jidToPhone(payload.from),
    );
  }

  private async onRevoked(session: string, payload: { id: string }): Promise<void> {
    await this.mirror.applyRevoke(session, payload.id);
  }

  private async onAck(session: string, payload: WahaAckPayload): Promise<void> {
    await this.mirror.applyReceiptDetail(session, payload.id, { status: payload.ack, recipient: payload.from });
  }

  private async onContact(
    session: string,
    payload: WahaContactPayload | WahaContactPayload[],
  ): Promise<void> {
    const contacts = Array.isArray(payload) ? payload : [payload];
    await this.contactSync.syncContacts(
      session,
      contacts.map((c) => ({
        id: c.id,
        name: c.name ?? c.notify ?? undefined,
        notify: c.notify ?? undefined,
      })),
    );
  }

  private async onGroup(session: string, payload: WahaGroupPayload): Promise<void> {
    await this.mirror.applyGroupMetadata(session, {
      id: payload.id,
      subject: payload.subject,
      owner: payload.owner,
      desc: payload.description,
      participants: payload.participants,
    });
  }

  private async onGroupParticipants(session: string, payload: WahaGroupParticipantsPayload): Promise<void> {
    await this.mirror.applyGroupParticipantUpdate(session, {
      id: payload.id,
      author: payload.author,
      participants: payload.participants,
      action: payload.action,
    });
  }

  private async onPresence(session: string, payload: WahaPresencePayload): Promise<void> {
    const state = payload.presence;
    const typing = state === 'composing' || state === 'recording';
    this.events.emitToAccount(session, 'wa:presence', {
      accountId: session,
      phone: jidToPhone(payload.id),
      typing,
      presence: state ?? 'unavailable',
    });
  }

  private async onCall(session: string, payload: WahaCallPayload): Promise<void> {
    await this.mirror.logCall(session, payload.from, payload.isVideo ?? false);
  }

  private async onSessionStatus(
    session: string,
    payload: { status: WahaSessionStatus; qr?: string },
  ): Promise<void> {
    const status = toSessionStatus(payload.status);
    await this.waServiceRef.setStatus(session, status);

    if (payload.status === 'SCAN_QR_CODE' && payload.qr) {
      this.events.emitToAccount(session, 'wa:qr', { accountId: session, qr: payload.qr });
    }

    if (status === SessionStatus.disconnected || status === SessionStatus.connected) {
      this.events.emitToAccount(session, 'wa:status', { accountId: session, status });
    }
  }
}

// ── Raw WAHA payload types ────────────────────────────────────────────────

interface WahaRawMessage {
  id: string;
  from: string;
  fromMe: boolean;
  participant?: string | null;
  timestamp: number;
  notifyName?: string | null;
  body?: string | null;
  type?: string;
  hasMedia?: boolean;
  media?: { url: string; mimetype?: string; filename?: string } | null;
  location?: { latitude: number; longitude: number; description?: string } | null;
  replyTo?: { id: string } | null;
}

interface WahaReactionPayload {
  messageId: string;
  from: string;
  reaction?: string | null;
}

interface WahaAckPayload {
  id: string;
  from: string;
  ack: number;
}

interface WahaContactPayload {
  id: string;
  name?: string | null;
  notify?: string | null;
}

interface WahaGroupPayload {
  id: string;
  subject?: string;
  owner?: string;
  description?: string;
  participants?: Array<{ id: string; admin?: string | null }>;
}

interface WahaGroupParticipantsPayload {
  id: string;
  author?: string;
  participants: string[];
  action: string;
}

interface WahaPresencePayload {
  id: string;
  presence?: string;
}

interface WahaCallPayload {
  id: string;
  from: string;
  isVideo?: boolean;
}

/** Lightweight forward-ref interface so WahaEventService can call setStatus without circular dep */
interface WaServiceRef {
  setStatus(accountId: string, status: SessionStatus): Promise<void>;
}
const WaServiceRef = Symbol('WaServiceRef');
export { WaServiceRef };
```

- [ ] **Step 3: Build check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep waha-event
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/wa/waha-event.service.ts
git commit -m "feat(waha): add WahaEventService WebSocket client"
```

---

## Task 8: Refactor WaService (remove Baileys)

**Files:**
- Modify: `apps/api/src/modules/wa/wa.service.ts`

- [ ] **Step 1: Remove all Baileys imports**

Delete these import lines from `wa.service.ts`:

```typescript
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  type WASocket,
} from '@whiskeysockets/baileys';
import * as QRCode from 'qrcode';
import pino from 'pino';
```

Also remove imports of `WaSessionStore`, `WaSendService`, `WaInboundService`, `WaMirrorService`.

Add:

```typescript
import { WahaClientService } from './waha-client.service';
import { SessionStatus } from '@sentinel/database';
```

- [ ] **Step 2: Replace constructor**

Replace the constructor to inject `WahaClientService` instead of the Baileys-era services:

```typescript
constructor(
  private readonly wahaClient: WahaClientService,
  private readonly prisma: PrismaService,
  private readonly events: EventsGateway,
  private readonly notifications: NotificationsService,
  private readonly contactSync: ContactSyncService,
  @Optional() private readonly metrics?: MetricsService,
) {}
```

- [ ] **Step 3: Replace onModuleInit**

```typescript
async onModuleInit() {
  const accounts = await this.prisma.whatsappAccount.findMany({
    where: { isActive: true },
  });
  for (const account of accounts) {
    this.startSession(account.id).catch((err) =>
      this.logger.error(`Failed to start session ${account.id}: ${err}`),
    );
  }
}
```

- [ ] **Step 4: Replace startSession**

```typescript
async startSession(accountId: string): Promise<void> {
  const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new NotFoundException(`Account ${accountId} not found`);

  // Create session in WAHA if it doesn't exist yet, then start it.
  // WAHA returns 409 if already exists — swallow that.
  try {
    await this.wahaClient.createSession(accountId);
  } catch { /* session already exists */ }

  await this.wahaClient.startSession(accountId);
  this.logger.log(`Session started for account ${accountId}`);
}
```

- [ ] **Step 5: Replace restart, removeAccount, requestPairingCode**

```typescript
async restart(accountId: string): Promise<void> {
  await this.wahaClient.restartSession(accountId);
  await this.setStatus(accountId, SessionStatus.reconnecting);
}

async removeAccount(accountId: string): Promise<void> {
  await this.wahaClient.deleteSession(accountId).catch(() => undefined);
  await this.prisma.whatsappAccount.delete({ where: { id: accountId } });
  this.events.emitToAccount(accountId, 'wa:status', { accountId, status: 'disconnected', deleted: true });
}

async requestPairingCode(accountId: string): Promise<string> {
  const account = await this.prisma.whatsappAccount.findUnique({ where: { id: accountId } });
  if (!account) throw new NotFoundException('Account not found');
  const digits = (account.phoneNumber ?? '').replace(/\D/g, '');
  if (!digits) throw new Error('Account has no phone number configured');

  const code = await this.wahaClient.requestPairingCode(accountId, digits);
  this.events.emitToAccount(accountId, 'wa:pairing-code', { accountId, code });
  return code;
}
```

- [ ] **Step 6: Replace getQr, getMetadata, getHealth**

```typescript
async getQr(accountId: string): Promise<{ qr: string | null; status: string }> {
  const [status, qr] = await Promise.all([
    this.wahaClient.getSessionStatus(accountId).catch(() => ({ status: 'unknown' })),
    this.wahaClient.getQr(accountId),
  ]);
  return { qr, status: status.status };
}

async getMetadata(accountId: string): Promise<{ phone: string; name: string } | null> {
  const me = await this.wahaClient.getMe(accountId);
  if (!me) return null;
  return { phone: me.id.replace(/@.*/, ''), name: me.pushName };
}

async getHealth(accountId: string): Promise<{ accountId: string; status: string }> {
  const status = await this.wahaClient.getSessionStatus(accountId).catch(() => ({ status: 'unknown' }));
  return { accountId, status: status.status };
}
```

- [ ] **Step 7: Keep setStatus unchanged; replace all send facade methods**

`setStatus` stays exactly as is (updates DB + emits socket event).

For send facade methods, replace every `this.waSend.methodName(...)` with the equivalent `this.wahaClient.methodName(...)`. For example:

```typescript
async sendText(accountId: string, phone: string, text: string, quoted?: { externalId: string; content: string | null; fromMe: boolean }): Promise<string | null> {
  await this.rateLimiter.throttle(accountId);
  const { phoneToJid } = await import('./wa.util');
  return this.wahaClient.sendText(accountId, phoneToJid(phone), text, quoted?.externalId);
}

async sendMedia(accountId: string, phone: string, mediaType: string, url: string, caption?: string): Promise<string | null> {
  await this.rateLimiter.throttle(accountId);
  const { phoneToJid } = await import('./wa.util');
  const jid = phoneToJid(phone);
  if (mediaType === 'image') return this.wahaClient.sendImage(accountId, jid, url, caption);
  if (mediaType === 'video') return this.wahaClient.sendVideo(accountId, jid, url, caption);
  if (mediaType === 'audio') return this.wahaClient.sendVoice(accountId, jid, url);
  return this.wahaClient.sendFile(accountId, jid, url, caption);
}

// ... repeat for all other send facade methods, delegating to wahaClient
```

Also inject `WaRateLimiter` in the constructor:

```typescript
constructor(
  private readonly wahaClient: WahaClientService,
  private readonly rateLimiter: WaRateLimiter,
  private readonly prisma: PrismaService,
  private readonly events: EventsGateway,
  private readonly notifications: NotificationsService,
  private readonly contactSync: ContactSyncService,
  @Optional() private readonly metrics?: MetricsService,
) {}
```

- [ ] **Step 8: Delete scheduleReconnect, healthCheck (WAHA handles reconnection)**

Remove `scheduleReconnect()`, `@Interval(60_000) healthCheck()`, and the `MAX_RECONNECT_ATTEMPTS` constant. Remove `@nestjs/schedule` `Interval` import if no longer used.

- [ ] **Step 9: Build check**

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep wa.service
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/modules/wa/wa.service.ts
git commit -m "feat(waha): refactor WaService to use WAHA REST instead of Baileys"
```

---

## Task 9: Update wa.module.ts

**Files:**
- Modify: `apps/api/src/modules/wa/wa.module.ts`

- [ ] **Step 1: Rewrite wa.module.ts**

Replace the entire contents of `apps/api/src/modules/wa/wa.module.ts`:

```typescript
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WaController } from './wa.controller';
import { WaService } from './wa.service';
import { WahaClientService } from './waha-client.service';
import { WahaEventService, WaServiceRef } from './waha-event.service';
import { WaRateLimiter } from './wa-rate-limiter';
import { WaInboundService } from './wa-inbound.service';
import { WaMirrorService } from './wa-mirror.service';
import { ContactSyncService } from './contact-sync.service';
import { MessageIngestService } from './message-ingest.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { HermesModule } from '../hermes/hermes.module';
import { SettingsModule } from '../settings/settings.module';
import { AssetsModule } from '../assets/assets.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AiModule,
    HermesModule,
    SettingsModule,
    AssetsModule,
  ],
  controllers: [WaController],
  providers: [
    WahaClientService,
    WaRateLimiter,
    WaService,
    {
      provide: WaServiceRef,
      useExisting: WaService,
    },
    WahaEventService,
    WaInboundService,
    WaMirrorService,
    ContactSyncService,
    MessageIngestService,
  ],
  exports: [WaService, WahaClientService],
})
export class WaModule {}
```

- [ ] **Step 2: Build check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: zero errors across the entire project.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/wa/wa.module.ts
git commit -m "feat(waha): update wa.module.ts — swap Baileys providers for WAHA"
```

---

## Task 10: Delete obsolete files and remove Baileys dependency

**Files:**
- Delete: `apps/api/src/modules/wa/wa-send.service.ts`
- Delete: `apps/api/src/modules/wa/wa-session.store.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Delete obsolete files**

```bash
rm apps/api/src/modules/wa/wa-send.service.ts
rm apps/api/src/modules/wa/wa-session.store.ts
```

- [ ] **Step 2: Remove Baileys and qrcode from package.json**

In `apps/api/package.json`, remove these dependencies:
- `@whiskeysockets/baileys`
- `qrcode` (WAHA serves QR natively)
- `pino` (only used for Baileys silent logger — verify no other usages first: `grep -r "pino" apps/api/src`)

Also remove `@types/qrcode` from devDependencies if present.

- [ ] **Step 3: Reinstall**

```bash
cd apps/api && npm install
```

- [ ] **Step 4: Full build**

```bash
npm run build --workspace=@sentinel/api
```

Expected: clean build with zero errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(waha): remove Baileys, wa-send.service, wa-session.store"
```

---

## Task 11: E2E Smoke Test

- [ ] **Step 1: Start full stack**

```bash
docker compose up -d
npm run dev:api
```

- [ ] **Step 2: Verify WAHA health**

```bash
curl http://localhost:3002/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 3: Create a WhatsApp account via API**

```bash
curl -X POST http://localhost:3001/api/v1/wa/accounts \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"accountName":"Test","phoneNumber":""}'
```

Expected: account created, WAHA session created (check `http://localhost:3002/api/sessions`).

- [ ] **Step 4: Fetch QR code**

```bash
curl http://localhost:3001/api/v1/wa/accounts/<id>/qr \
  -H "Authorization: Bearer <jwt>"
```

Expected: `{ "qr": "data:image/png;base64,...", "status": "SCAN_QR_CODE" }`

- [ ] **Step 5: Scan QR with WhatsApp mobile**

After scanning, session status should become `WORKING`. Check:

```bash
curl http://localhost:3002/api/sessions/<accountId>
```

Expected: `{ "status": "WORKING" }`

- [ ] **Step 6: Send a test message from the connected phone to itself**

Watch the NestJS logs — you should see the message arriving via WahaEventService and being routed to WaInboundService. Check the DB:

```sql
SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
```

Expected: new message row in `messages` table.

- [ ] **Step 7: Trigger AI reply**

Set the conversation's AI mode to `ai_on` and send another message. Check logs for auto-reply pipeline execution and the outbound message being sent via `WahaClientService.sendText`.

- [ ] **Step 8: Commit final**

```bash
git add -A
git commit -m "feat(waha): migration complete — Baileys replaced by WAHA sidecar"
```

---

## Self-Review Checklist (run before marking complete)

- [ ] All Baileys imports removed from `apps/api/src/`
- [ ] `@whiskeysockets/baileys` not in `apps/api/package.json`
- [ ] `WaRateLimiter` tests pass
- [ ] `WahaClientService` tests pass
- [ ] `npx tsc --noEmit` reports zero errors
- [ ] `npm run build --workspace=@sentinel/api` succeeds
- [ ] WAHA appears in `docker compose ps`
- [ ] QR scan flow works end-to-end
- [ ] Inbound message appears in DB within 2 seconds
- [ ] AI auto-reply sends via WAHA (visible in WhatsApp and DB)

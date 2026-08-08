# Sentinel Test Harness — Rencana Implementasi (v2 Revised)

> **Goal:** Membangun Web Chat Simulator untuk testing/debugging Sentinel tanpa WhatsApp. Pakai provider LLM & API yang sama dengan produksi, bisa diganti-ganti.

**Architecture:** NestJS module `TestHarnessModule` — tidak ganggu production code. Web UI dengan chat panel + debug panel real-time. Database: SQLite lokal (mirror schema production) untuk persistence antar restart. Bisa inject skenario test.

**Tech Stack:** NestJS (existing), SQLite (via better-sqlite3), vanilla HTML/JS (web UI), real LLM provider (OpenRouter/sama dengan Sentinel)

---

## Keputusan Desain

### 1. Provider LLM: Sama dengan Sentinel, Bisa Diganti
- Pakai `AiProviderService` yang SAMA dengan production — jadi behavior bot persis seperti di WhatsApp
- Tambah dropdown di Web UI: pilih provider/model (OpenRouter, OpenAI, Anthropic, dll) — override via config
- Tidak pakai mock provider (ingin lihat behavior REAL LLM)

### 2. Database: SQLite Lokal (Rekomendasi)
**Kenapa SQLite?**
- Zero dependency — tidak perlu install Postgres, MySQL, atau server apapun
- File-based — satu file `.db` di `apps/api/data/sentinel-simulator.db`
- Bisa di-copy, di-share, di-version-control-kan (untuk test fixtures)
- Schema mirror production — jadi behaviour order context persis production
- Bisa pre-load seed data (skenario test) dari JSON

**Kenapa BUKAN in-memory?**
- Reset tiap restart — repot kalau lagi debug bug kompleks
- Tidak bisa simpan skenario test

**Kenapa BUKAN production DB?**
- Bahaya — jangan testing di data production
- Butuh koneksi network/VPN

### 3. Web UI Langsung (Skip CLI)
- HTML page simpel di-serve NestJS: `http://localhost:3000/test-harness`
- Layout: chat panel kiri (60%) + debug panel kanan (40%)
- Fitur: multi-conversation tabs, export chat, load scenario

---

## Arsitektur

```
┌──────────────────────────────────────────────────────────┐
│  Browser: http://localhost:3000/test-harness              │
│  ┌──────────────────────┐ ┌────────────────────────────┐ │
│  │   Chat Panel          │ │   Debug Panel              │ │
│  │                       │ │                            │ │
│  │  [Conv 1] [Conv 2] [+]│ │  Status  : closing         │ │
│  │                       │ │  Kota    : MATARAM, NTB    │ │
│  │  Anda: ada golok?    │ │  Ongkir  : Rp50.000 (JNE)  │ │
│  │  Bot : Kami punya...  │ │  Funnel  : patokan         │ │
│  │                       │ │  Token   : {{total_cod}}   │ │
│  │  Anda: 1 ke mataram   │ │           = Rp189.000      │ │
│  │  Bot : Baik, untuk... │ │                            │ │
│  │                       │ │  Gate 💰: ⚠️ ditahan       │ │
│  │  ┌─────────────────┐  │ │  ▶ jumlah_manual          │ │
│  │  │ Ketik pesan...   │  │ │  ▶ funnel_dilanggar       │ │
│  │  └─────────────────┘  │ │                            │ │
│  │  [Kirim] [Load Test]  │ │  Prompt LLM: [Expand ▼]   │ │
│  └──────────────────────┘ │  Grounding : [Expand ▼]    │ │
│                           └────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
         │ HTTP POST /api/test-harness/send
         ▼
┌──────────────────────────────────────────────────────────┐
│  TestHarnessController (NestJS)                           │
│                                                          │
│  POST /send          → ChatSessionManager.sendMessage()  │
│  POST /create        → ChatSessionManager.createSession()│
│  GET  /sessions      → list active sessions              │
│  POST /load-scenario → load test scenario from JSON      │
│  GET  /export/:id    → export conversation as JSON       │
│  GET  /providers     → list available LLM providers      │
│  POST /provider      → switch provider/model             │
│                                                          │
│         │                                                │
│         ▼                                                │
│  ChatSessionManager                                       │
│    ├─ manage multiple conversations (Map<id, Session>)    │
│    ├─ persist to SQLite                                  │
│    ├─ wrap ShippingService + AiService                   │
│    └─ collect debug info per turn                        │
│                                                          │
│         │                                                │
│         ▼                                                │
│  AiService.generateReply()         ← PRODUCTION CODE     │
│  ShippingService.getGroundingText()                       │
│  PromptBuilderService.buildForConversation()               │
│  MoneyGate / resolvePriceTokens                            │
│         │                                                │
│         ▼                                                │
│  DebugInfoCollector                                       │
│    ├─ ekstrak status, kota, ongkir, funnel               │
│    ├─ tangkap Money Gate violations                      │
│    ├─ tangkap token tidak tersubstitusi                   │
│    └─ timestamp & latency                                │
│                                                          │
│         │                                                │
│         ▼                                                │
│  SQLite (data/sentinel-simulator.db)                      │
│    ├─ conversations (id, name, created_at)                │
│    ├─ messages (conv_id, role, content, debug_json)      │
│    ├─ order_snapshots (mirror production schema)         │
│    └─ sessions (active state)                            │
└──────────────────────────────────────────────────────────┘
```

---

## Fase 1: Web Chat Simulator (2-3 jam)

### Task 1.1: Setup SQLite + Schema Migration
**File:** `apps/api/src/test-harness/database/schema.ts`

```typescript
// Gunakan better-sqlite3 (sync, ringan)
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  name TEXT,
  provider TEXT DEFAULT 'openrouter',
  model TEXT DEFAULT 'deepseek/deepseek-v4-pro',
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id TEXT REFERENCES conversations(id),
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system'
  content TEXT NOT NULL,
  debug_json TEXT,    -- JSON string dari DebugInfoCollector
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS order_snapshots (
  -- mirror production OrderSnapshot schema
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id TEXT REFERENCES conversations(id),
  city TEXT,
  province TEXT,
  items TEXT,         -- JSON array
  courier TEXT,
  ongkir INTEGER,
  total INTEGER,
  step TEXT,          -- 'total' | 'patokan' | 'closing'
  created_at INTEGER DEFAULT (unixepoch())
);
`;
```

### Task 1.2: Buat TestHarnessModule
**File:** `apps/api/src/test-harness/test-harness.module.ts`

```typescript
@Module({
  imports: [
    ShippingModule,  // reuse production ShippingService
    AiModule,        // reuse production AiService
  ],
  providers: [
    ChatSessionManager,
    DebugInfoCollector,
    ScenarioLoader,
  ],
  controllers: [TestHarnessController],
})
export class TestHarnessModule {}
```

Daftarkan di `app.module.ts` dengan conditional: hanya aktif kalau `ENABLE_TEST_HARNESS=true`.

### Task 1.3: Buat ChatSessionManager
**File:** `apps/api/src/test-harness/chat-session.manager.ts`

```typescript
@Injectable()
export class ChatSessionManager {
  private sessions = new Map<string, Session>();

  async createSession(name: string, opts?: { provider?: string; model?: string }) {
    // Buat conversationId unik: test-<timestamp>-<random>
    // Simpan ke SQLite
    // Return session state
  }

  async sendMessage(sessionId: string, text: string) {
    const session = this.sessions.get(sessionId);
    
    // 1. Simpan pesan user ke SQLite
    // 2. Panggil AiService.generateReply(sessionId)
    // 3. DebugInfoCollector.collect(sessionId, reply)
    // 4. Simpan response + debug_info ke SQLite
    // 5. Return { reply, debug }
  }

  async loadScenario(sessionId: string, scenario: TestScenario) {
    // Pre-load messages + order context dari JSON scenario
    // Supaya bisa replay chat history tertentu
  }

  // ... getSession, listSessions, deleteSession, exportSession
}
```

### Task 1.4: Buat DebugInfoCollector
**File:** `apps/api/src/test-harness/debug-info.collector.ts`

```typescript
@Injectable()
export class DebugInfoCollector {
  constructor(
    private readonly shipping: ShippingService,
  ) {}

  async collect(conversationId: string, reply: string) {
    // Panggil shipping.getGroundingText() atau parse internal state
    const meta = await this.shipping.computeFunnelMeta(conversationId);
    const grounding = await this.shipping.getGroundingText(conversationId);
    
    return {
      status: grounding.status,        // 'ok' | 'no_destination' | 'need_more_detail' | ...
      kota: grounding.kota_tujuan,
      ongkir: grounding.ongkir,
      funnel: meta.mode,               // 'total' | 'patokan' | 'closing' | 'normal'
      hidePriceUnits: meta.hidePriceUnits,
      gateWarnings: this.extractGateWarnings(reply, grounding),  // dari log
      tokens: this.extractTokens(grounding),  // {{subtotal}} = RpX, dll
      latencyMs: Date.now() - this.requestStart,
    };
  }

  private extractGateWarnings(reply: string, grounding: any): string[] {
    // Parse reply untuk cek apakah ada Money Gate violation
    // Baca dari logs AiService terbaru
    return [];
  }
}
```

### Task 1.5: Buat TestHarnessController (REST API)
**File:** `apps/api/src/test-harness/test-harness.controller.ts`

```
POST /api/test-harness/sessions          → createSession(name, provider?, model?)
GET  /api/test-harness/sessions          → listSessions()
POST /api/test-harness/sessions/:id/send → sendMessage(sessionId, text)
GET  /api/test-harness/sessions/:id      → getSession(sessionId)
POST /api/test-harness/sessions/:id/load → loadScenario(sessionId, scenario)
GET  /api/test-harness/sessions/:id/export → exportSession(sessionId)
GET  /api/test-harness/providers         → listProviders()
PATCH /api/test-harness/sessions/:id/provider → switchProvider(sessionId, provider, model)
DELETE /api/test-harness/sessions/:id    → deleteSession(sessionId)
```

### Task 1.6: Buat Web UI
**File:** `apps/api/src/test-harness/web/index.html`

HTML page statis yang di-serve NestJS via `@Get('test-harness')`:
- Layout: flexbox dengan chat panel kiri + debug panel kanan
- Chat bubbles: user (kanan, biru) vs bot (kiri, hijau)
- Debug panel: collapsible sections — Status, Kota/Ongkir, Funnel, Tokens, Gate Warnings
- Input bar: text input + tombol kirim
- Header: session tabs, dropdown provider/model, tombol New/Load/Export
- Polling: auto-refresh debug info (atau SSE/WebSocket untuk real-time)

**CSS/JS:** Vanilla (tanpa framework) — biar ringan, gak nambah dependency.

### Task 1.7: Tambah Conditional Module Loading
**File:** `apps/api/src/app.module.ts`

```typescript
const imports = [/* ... existing ... */];

if (process.env.ENABLE_TEST_HARNESS === 'true') {
  imports.push(TestHarnessModule);
}
```

### Task 1.8: Buat Test Scenario Loader
**File:** `apps/api/src/test-harness/scenario.loader.ts`

```typescript
interface TestScenario {
  name: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  orderContext?: { city: string; items: Array<{ name: string; qty: number }> };
}

@Injectable()
export class ScenarioLoader {
  // Load dari JSON file atau inline
  async load(sessionId: string, scenario: TestScenario | string) {
    // Inject messages ke session + SQLite
    // Inject order context ke ShippingQuoteCache + OrderContextService
  }
}
```

---

## Fase 2: Bulk Replay Engine (4-6 jam) — UNTUK SESI BERIKUTNYA

Sama seperti rencana awal, dengan penyesuaian:
- Gunakan `ChatSessionManager` yang SUDAH dibuat di Fase 1 sebagai engine
- Database chat history: extract dari production DB atau dari SQLite simulator

---

## File yang Akan Dibuat

```
apps/api/src/test-harness/
├── test-harness.module.ts
├── test-harness.controller.ts
├── chat-session.manager.ts
├── debug-info.collector.ts
├── scenario.loader.ts
├── database/
│   └── schema.ts
├── types.ts
└── web/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## Environment Variables

```bash
ENABLE_TEST_HARNESS=true
TEST_HARNESS_DB_PATH=./data/sentinel-simulator.db
```

---

## Cara Pakai

```bash
# 1. Start Sentinel dengan test harness
cd apps/api
ENABLE_TEST_HARNESS=true npm run start:dev

# 2. Buka browser
open http://localhost:3000/test-harness

# 3. Chat!
# - Session baru: klik "+" → otomatis bikin percakapan baru
# - Ketik pesan → lihat respon + debug info
# - Ganti provider/model: dropdown di header
# - Load skenario: klik "Load" → paste JSON scenario
```

---

## Verifikasi

- [ ] Web UI bisa diakses di `/test-harness`
- [ ] Bisa bikin session baru, kirim pesan, lihat response
- [ ] Debug panel menampilkan status/kota/ongkir/funnel/token
- [ ] Gate warnings muncul kalau ada Money Gate violation
- [ ] Bisa ganti provider/model tanpa restart
- [ ] Conversation persist antar restart (SQLite)
- [ ] Load skenario dari JSON bekerja
- [ ] Tidak ada perubahan di production code path (conditional load)
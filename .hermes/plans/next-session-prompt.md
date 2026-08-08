# 🚀 Lanjutkan: Sentinel Test Harness — Fase 1 (Web Chat Simulator)

Kamu adalah Senior Backend Engineer untuk proyek "Sentinel" (Hermes Repo) — bot AI WhatsApp untuk penjualan produk (golok/pisau), ongkir, dan funneling closing.

## Konteks Proyek

**Lokasi:** `/Users/anggafatih/Documents/AI-Projects/projek-ceo/hermes_repo`
**Tech:** NestJS/TypeScript, SQLite (better-sqlite3), OpenRouter (LLM), vanilla HTML/JS

**Kode kunci:**
- `apps/api/src/modules/shipping/shipping.service.ts` — core: `quoteForConversation()`, `getGroundingText()`, `computeFunnelMeta()`, `compressHistory()`, `resolvePriceTokens()`
- `apps/api/src/modules/ai/ai.service.ts` — `generateReply()`: full pipeline quote → grounding → LLM → gate uang → reply
- `apps/api/src/modules/ai/prompt-builder.service.ts` — `buildForConversation()`: build prompt + history
- `apps/api/src/i18n/bot-prompts.ts` — grounding text constants
- `apps/api/src/modules/shipping/shipping.service.spec.ts` — test harness: `harness()`, `pesanBaru()`, `entry()`, `fakeLog()`

**Funnel state machine (Pakem v3):**
- Tema A: `classifyTurn()` — identifikasi konteks chat
- Tema B: `resolveItems()` — resolusi barang (termasuk deixis)
- Tema C: Carry-over alamat (Provinsi → Kota → Kecamatan)
- Tema D: `quoteUntukTujuan()` → API Mengantar → `finalizeQuote()`
- Funnel modes: `normal` → `total` → `patokan` → `closing` (via `computeFunnelMeta()`)

**Known patterns:**
- Money Gate: validasi `resolvePriceTokens()` — deteksi angka rupiah ditulis manual, rekap total, `jumlah_manual`, `funnel_dilanggar`
- PLACE_HINT regex: deteksi perubahan kota tujuan
- `hidePriceUnits`: boolean — kalau true, token harga disembunyikan dari katalog grounding

## Tugas: Implementasi Fase 1 — Web Chat Simulator

Baca rencana lengkap: `/Users/anggafatih/Documents/AI-Projects/projek-ceo/hermes_repo/.hermes/plans/2026-08-08_sentinel-test-harness.md`

**Goal:** Bikin web app simpel untuk testing/debugging Sentinel tanpa WhatsApp. Ketik pesan → lihat response bot + debug info (status, kota, ongkir, funnel, gate warnings, token).

### Keputusan Desain (SUDAH FINAL)

1. **Provider LLM:** Pakai `AiProviderService` production (sama dengan Sentinel). Ada dropdown di UI untuk ganti provider/model.
2. **Database:** SQLite via better-sqlite3. File di `apps/api/data/sentinel-simulator.db`. Schema mirror production. Kenapa SQLite? Zero dependency, gak perlu install apa-apa, persist antar restart.
3. **UI:** Web langsung (HTML/CSS/JS vanilla), serve NestJS di `/test-harness`.
4. **Module loading:** Conditional — hanya aktif kalau `ENABLE_TEST_HARNESS=true`. Tidak ganggu production path.

### File yang Harus Dibuat

Semua di `apps/api/src/test-harness/`:
1. `types.ts` — TypeScript interfaces
2. `database/schema.ts` — SQLite schema + migration
3. `test-harness.module.ts` — NestJS module
4. `chat-session.manager.ts` — manage multi-conversation, wrap AiService + ShippingService
5. `debug-info.collector.ts` — ekstrak status/kota/ongkir/funnel/token/gate dari internal state
6. `scenario.loader.ts` — load test scenario dari JSON
7. `test-harness.controller.ts` — REST API endpoints
8. `web/index.html` + `web/style.css` + `web/app.js` — Web UI

### REST API Endpoints

```
POST /api/test-harness/sessions          → createSession(name, provider?, model?)
GET  /api/test-harness/sessions          → listSessions()
POST /api/test-harness/sessions/:id/send → sendMessage(sessionId, text)
GET  /api/test-harness/sessions/:id      → getSession(sessionId)
POST /api/test-harness/sessions/:id/load → loadScenario(sessionId, scenario)
GET  /api/test-harness/sessions/:id/export → exportSession(sessionId)
GET  /api/test-harness/providers         → list available providers
PATCH /api/test-harness/sessions/:id/provider → switchProvider(sessionId, provider, model)
DELETE /api/test-harness/sessions/:id    → deleteSession(sessionId)
```

### Web UI Layout

```
┌──────────────────────┐ ┌────────────────────────────┐
│   Chat Panel (60%)    │ │   Debug Panel (40%)         │
│                       │ │                            │
│  [Conv 1] [Conv 2] [+] │ │  Status  : closing         │
│                       │ │  Kota    : MATARAM, NTB    │
│  Anda: ada golok?    │ │  Ongkir  : Rp50.000 (JNE)  │
│  Bot : Kami punya...  │ │  Funnel  : patokan         │
│                       │ │  Tokens  : (expandable)     │
│  ┌─────────────────┐  │ │  Gate 💰: ⚠️ (expandable)  │
│  │ Ketik pesan...   │  │  Grounding: (expandable)    │
│  └─────────────────┘  │ │  Prompt   : (expandable)    │
│  [Kirim] [Load Test]  │ │                            │
└──────────────────────┘ └────────────────────────────┘
  Header: dropdown provider/model, session name
```

### Alur DebugInfoCollector

```typescript
async collect(conversationId: string) {
  const grounding = await this.shipping.getGroundingText(conversationId);
  const meta = await this.shipping.computeFunnelMeta(conversationId);

  return {
    status: grounding.status,           // 'ok' | 'no_destination' | 'need_more_detail'
    kota: grounding.kota_tujuan,        // dari buildPriceTokens
    ongkir: grounding.ongkir,           // dari buildPriceTokens
    funnel: meta.mode,                  // 'total' | 'patokan' | 'closing' | 'normal'
    hidePriceUnits: meta.hidePriceUnits,
    gateWarnings: [],                   // dari log AiService / intercept resolvePriceTokens
    tokens: extractTokens(grounding),   // parse {{token}} = value
    latencyMs: number,
  };
}
```

### Aturan Eksekusi

1. Baca ulang rencana di `.hermes/plans/2026-08-08_sentinel-test-harness.md` sebelum mulai
2. Kerjakan task per task, TDD kalau memungkinkan
3. JANGAN ubah production code (`shipping.service.ts`, `ai.service.ts`, `prompt-builder.service.ts`) — semua kode baru di `test-harness/`
4. Kecuali: tambah `TestHarnessModule` ke `app.module.ts` secara CONDITIONAL
5. Setiap selesai 1 task, verify: jalankan `npm run start:dev` dan buka `http://localhost:3000/test-harness`
6. Jangan install dependency baru tanpa konfirmasi dulu

### Verifikasi Final

- [ ] Web UI bisa diakses di browser
- [ ] Bisa bikin session baru, kirim pesan, lihat response
- [ ] Debug panel menampilkan status/kota/ongkir/funnel/token
- [ ] Gate warnings muncul kalau ada Money Gate violation
- [ ] Bisa ganti provider/model tanpa restart
- [ ] Conversation persist antar restart (SQLite)
- [ ] Load skenario dari JSON bekerja
- [ ] `ENABLE_TEST_HARNESS=false` → module NOT loaded (production safe)

### Pertama Kali Buka Sesi Ini

Jawab: "✅ Siap Bos. Saya mulai dari Task 1.1: Setup SQLite schema. Lanjut?"
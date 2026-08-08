# 🐛 Lanjutkan Debug: Money Gate Closing — funnel_dilanggar

Kamu adalah Senior Backend Engineer untuk proyek **Sentinel** (Hermes Repo) — bot AI WhatsApp untuk penjualan produk (golok/pisau), ongkir, dan funneling closing.

## Target Debug Hari Ini

**Bug:** Di state **closing**, Money Gate menahan draft dengan error:
> *"Balasan melanggar alur penjualan wajib — tidak menutup dengan pertanyaan langkah 'closing'"*

Ini adalah error `funnel_dilanggar` — model tidak mengikuti template closing yang diwajibkan.

---

## Konteks Proyek

**Lokasi:** `/Users/anggafatih/Documents/AI-Projects/projek-ceo/hermes_repo`
**Tech:** NestJS/TypeScript, PostgreSQL, Redis, Docker
**Server:** Docker containers — `hermes-api` (port 3001), `hermes-web` (port 3000)

**Kode kunci:**
- `apps/api/src/modules/shipping/shipping.service.ts` — core ~4500L
  - `funnelDirective()` line ~2700 — state machine funnel, buat template closing
  - `computeFunnelMeta()` line ~2865 — SATU sumber mode funnel (total/patokan/closing/normal)
  - `getGroundingText()` line ~2990 — build grounding untuk LLM
  - `resolvePriceTokens()` line ~3470 — Money Gate: validasi reply model
  - `compressHistory()` line ~2911 — kompres history saat post-total
- `apps/api/src/i18n/bot-prompts.ts` — grounding constants
  - `SHIPPING_MONEY_RULE_POST_TOTAL` line ~674 — rem harga untuk patokan/closing
  - `SHIPPING_FUNNEL_CLOSING` line ~816 — directive closing verbatim
- `apps/api/src/modules/settings/settings.service.ts` — AppSettings
  - `orderFunnelClosingCod` line ~307 — template closing COD
  - `orderFunnelClosingTransfer` line ~308 — template closing transfer

## Flow Funnel Closing

```
getGroundingText()
  └─ computeFunnelMeta() → mode='closing', hidePriceUnits=true
  └─ build grounding text:
       ├─ SHIPPING_MONEY_RULE_POST_TOTAL: "JANGAN sebut harga/total APAPUN"
       ├─ katalogPenanda(q, true) — token TANPA harga (hidePriceUnits)
       └─ funnelDirective() → SHIPPING_FUNNEL_CLOSING:
            "pakai teks ini PERSIS: ${orderFunnelClosingCod}"
            
resolvePriceTokens() [Money Gate — post-LLM]:
  └─ substitusi semua {{token}} → nilai asli
  └─ funnel enforcement (line ~3734):
       cek apakah reply model mengandung kalimatWajib (template closing)
       └─ GAGAL → funnel_dilanggar
```

## Analisis Sudah Dilakukan

### Template Closing (orderFunnelClosingCod default):
```
Terimakasih kak konfirmasinya. Berikut data pesanannya ya :
{{daftar_produk_harga}}
📍 Formulir Pemesanan:
Nama: {{nama_pembeli}}
No HP: {{no_hp}}
Alamat: {{alamat_lengkap}}

{{catatan_sk}}
```

### Masalah Ditemukan:
1. **`{{daftar_produk_harga}}` TIDAK TERDEFINISI** — `ORDER_GLOBAL_TOKENS` tidak di-set di `.env` atau AppSettings. Token ini tidak ada di kamus `buildPriceTokens()` (token sistem) maupun `globalTokens` (token AppSettings).

2. **Konflik instruksi grounding vs funnel:**
   - Grounding: `SHIPPING_MONEY_RULE_POST_TOTAL` → "JANGAN sebut harga/total APAPUN"
   - Funnel: `SHIPPING_FUNNEL_CLOSING` → "pakai teks ini PERSIS: ...{{daftar_produk_harga}}..."
   - Model bingung — grounding bilang jangan, funnel bilang wajib

3. **Apa yang terjadi di resolvePriceTokens:**
   - `{{daftar_produk_harga}}` tidak ada di `tokens` → substitusi ke "" (string kosong)
   - Model mungkin menghapus baris `{{daftar_produk_harga}}` (ikut grounding "jangan sebut harga")
   - Funnel check: `normSubstituted.includes(normKalimatWajib)` — kalimatWajib tanpa daftar_produk_harga TIDAK cocok dengan reply model yang juga diubah

## Opsi Solusi (BELUM DIPUTUSKAN)

| # | Solusi | Risk |
|---|--------|------|
| **A** | Tambah `daftar_produk_harga` ke `ORDER_GLOBAL_TOKENS` via AppSettings — isi daftar produk TANPA harga | Butuh setup manual, update tiap produk baru |
| **B** | Ganti template closing: `{{daftar_produk_harga}}` → `{{rincian_order}}` (token sistem SUDAH ada di `buildPriceTokens`) | Format beda (`rincian_order` = list nama+qty, bukan nama+harga) |
| **C** | Bikin token sistem baru `daftar_produk_tanpa_harga` di `buildPriceTokens()` — isi daftar produk tanpa harga, dihitung otomatis | Perlu code change di `shipping.service.ts`, tapi SATU sumber kebenaran |

---

## Tugas Debug

1. **Verifikasi token `{{rincian_order}}`** — cek formatnya di `buildPriceTokens()`. Apakah bisa menggantikan `{{daftar_produk_harga}}` di template closing?

2. **Cek apakah `ORDER_GLOBAL_TOKENS` bisa diisi dari dashboard** — atau harus dari env variable?

3. **Tentukan solusi terbaik** dan usulkan ke Bos SEBELUM eksekusi.

4. **JANGAN** mengubah production code tanpa persetujuan. Semua perubahan harus pakai marker `>>> ANGGA ... <<< ANGGA`.

5. **Aturan testing:** `cd apps/api && npx jest --no-coverage --runInBand src/modules/shipping/ src/modules/ai/` — harus 317/317 PASS.

---

## Cara Akses

```bash
# Server: Docker containers
docker ps                              # cek container
docker logs hermes-api --tail 50       # log API
docker exec hermes-api sh -c '...'     # execute inside container

# Restart containers
cd /Users/anggafatih/Documents/AI-Projects/projek-ceo/hermes_repo
docker compose restart api web

# Test health
curl http://localhost:3001/api/v1/health

# Test suite
cd /Users/anggafatih/Documents/AI-Projects/projek-ceo/hermes_repo/apps/api
npx jest --no-coverage --runInBand src/modules/shipping/ src/modules/ai/
```

## Pertama Kali Buka Sesi Ini

Jawab: "✅ Siap Bos. Saya verifikasi token `{{rincian_order}}` dulu, lalu analisis opsi terbaik. Lanjut?"
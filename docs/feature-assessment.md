# Penilaian Fitur vs Kebutuhan Pasar

Dokumen ini menilai cakupan fitur Hermes AI Sales & CS Control Center terhadap
kebutuhan nyata tim sales/CS WhatsApp multi-akun (pasar Indonesia/SEA), dan
memetakan: **fitur yang sudah tepat**, **fitur yang sebaiknya ditambah**, dan
**fitur yang berisiko over-engineering**.

Status verifikasi (smoke test runtime, 2026-06): Postgres + Redis + API + Web
berjalan, login owner sukses, dan **seluruh endpoint utama tiap halaman
mengembalikan HTTP 200**; semua route web (15 halaman) ter-render 200. Build,
lint, dan QA checks lulus.

---

## 1. Fitur inti yang sudah ada & tepat sasaran ✅

Ini adalah tulang punggung produk dan sudah sesuai kebutuhan pasar:

- **Multi-akun WhatsApp (Baileys)** dengan QR scan, persistensi sesi,
  auto-reconnect + anti-ban (delay manusiawi, throttle, health check).
- **Inbox 3-panel gaya WhatsApp Web** (kini responsif master-detail di HP).
- **Mode AI per percakapan**: ON / OFF / DRAFT / SUPERVISED / PAUSED — ini
  pembeda utama dan sesuai kebutuhan "human-in-the-loop".
- **Hermes supervisor** (rules + LLM, confidence/risk, pre-send & post-send).
- **Lead scoring + auto-tagging** (Cold/Warm/Hot/Very Hot).
- **Knowledge base** dengan ingest file (PDF/Word/Excel/CSV/dll) & URL — feeds
  langsung ke prompt AI.
- **CRM** (kontak, stage, tag, catatan internal, timeline terpadu, bulk action).
- **Campaign terkontrol** (approval, rate limit, opt-out, idempotency, personalisasi).
- **Analytics & monitoring** (response time, AI quality, funnel, delivery rate).
- **Roles** (owner/supervisor/admin/viewer), audit log, CSV export, quick replies, SLA.

---

## 2. Fitur yang sebaiknya DITAMBAH (gap pasar nyata) 🟡

Diurutkan dari dampak tertinggi:

### Prioritas tinggi
1. **Quick-reply / template di composer inbox.** Backend `/quick-replies` &
   `/templates` sudah ada, tetapi composer inbox belum punya tombol sisip cepat
   (mis. `/` shortcut atau panel snippet). Ini fitur paling sering dipakai agen
   CS harian — dampak produktivitas besar, effort kecil.
2. **Notifikasi unread & suara/badge real-time di sidebar.** Sudah ada
   `unreadCount` per percakapan; tampilkan badge total di item nav "Inbox" dan
   notifikasi browser agar agen tak melewatkan chat masuk.
3. **Indikator status pesan terkirim** (centang 1/2/biru) di gelembung pesan.
   Sudah ada `deliveryStatus` di model; tampilkan di UI untuk kepercayaan agen.
4. **Mobile navigation drawer.** Sidebar kini icon-rail di HP (berfungsi), tapi
   label tersembunyi. Tambah drawer hamburger agar label terbaca penuh di HP.

### Prioritas menengah
5. **Penjadwalan pesan personal** (bukan campaign) — kirim 1 pesan ke 1 kontak
   pada waktu tertentu (follow-up manual terjadwal).
6. **Deteksi & template jam operasional / auto-reply di luar jam.** Model akun
   sudah punya business hours; manfaatkan untuk auto-greeting di luar jam.
7. **Pencarian global** lintas kontak + pesan dari satu kotak (saat ini
   pencarian per-konteks).
8. **Ekspor laporan terjadwal** (email/Hermes Agent) — kirim daily report
   otomatis ke supervisor.

### Prioritas rendah (nice-to-have)
9. Label/folder percakapan kustom dengan warna.
10. Catatan suara → transkrip (di luar MVP, tapi sering diminta pasar ID).

---

## 3. Fitur yang BERISIKO over-engineering / tunda ⛔

Pertahankan ruang lingkup; hindari menambah kompleksitas yang tak terpakai:

- **AI self-learning / fine-tuning otomatis** — sudah benar dikecualikan dari
  MVP. Knowledge base manual + supervisor sudah cukup dan lebih aman.
- **Omnichannel penuh (IG/FB/Telegram sebagai inbox)** — Hermes Agent sudah
  menangani *outbound* multi-platform untuk notifikasi; menjadikan semuanya
  inbox dua arah adalah produk berbeda. Tunda sampai ada permintaan jelas.
- **OCR bukti pembayaran & analitik closing mendalam** — sudah di luar MVP;
  pertahankan.
- **Sidecar agentic (hermes-sidecar)** — opsional & sudah punya fallback; jangan
  jadikan dependensi wajib.
- **Native mobile app** — PWA responsif (yang kini diperbaiki) cukup untuk
  kebutuhan agen di HP.

---

## 3b. Status implementasi (update)

Dikerjakan & diverifikasi runtime di iterasi ini:

- ✅ **Quick-reply di composer inbox** (tombol ⚡ + ekspansi shortcut `/nama`).
- ✅ **Centang status pengiriman** (pending/sent/delivered/read/failed) di gelembung.
- ✅ **Drawer navigasi mobile** + **badge unread** di nav Inbox
  (`GET /conversations/unread-count`, terverifikasi).
- ✅ **Indikator koneksi realtime** (Live / Reconnecting…) di header inbox.
- ✅ **Penjadwalan pesan personal** — UI baru di inbox (tombol "Schedule")
  memakai backend follow-up yang sudah ada (`POST /follow-ups`, queue delayed
  job, kirim otomatis via Baileys, cancel). Validasi 400/404 terverifikasi.
- ✅ **Auto-reply di luar jam operasional** — ternyata SUDAH lengkap end-to-end
  (`maybeAutoAway` + `awayMessage` + `isWithinBusinessHours`, dengan cooldown);
  UI ada di halaman Accounts. Tidak perlu dibangun ulang.
- ✅ **Perbaikan 429 & WebSocket** — debounce reload dari event + fallback
  polling transport.

### Catatan keamanan dependency (perlu keputusan)

- `npm audit`: 38 kerentanan (2 kritis, 10 high). `npm audit fix` non-breaking
  gagal karena konflik peer-dep; sebagian besar butuh `npm audit fix --force`
  (berisiko bump major NestJS/Next — jangan dijalankan tanpa uji regresi).
- Kerentanan **kritis pada `xlsx`** (dipakai untuk ingest Excel di Knowledge)
  **tidak ada perbaikan di npm registry**. Mitigasi: migrasi ke versi resmi
  SheetJS dari CDN mereka atau ganti ke `exceljs`. Karena file di-upload oleh
  admin (semi-tepercaya) risikonya menengah, tapi tetap perlu ditangani sebelum
  produksi.

## 4. Catatan QA / kualitas

- **Responsivitas**: inbox kini master-detail di HP; panel lebar-tetap
  (campaigns/knowledge) stack di mobile; grid statistik 2 kolom di HP. Sidebar
  icon-rail berfungsi di semua ukuran.
- **Penanganan error**: kirim pesan gagal di inbox kini memunculkan banner error
  (sebelumnya senyap).
- **Konsistensi desain**: padding `p-5`, token warna (hermes/channel/danger/
  review), dan komponen Card/Button/Badge sudah konsisten lintas halaman.
- **Belum diverifikasi runtime end-to-end**: pengiriman pesan WhatsApp nyata
  (butuh akun WA aktif) dan jawaban AI (butuh kunci provider). Disarankan uji
  pilot dengan 1 akun + 1 kunci AI sebelum produksi.

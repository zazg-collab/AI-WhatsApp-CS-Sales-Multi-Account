# Tutorial Deploy Gratis (untuk Demo)

Panduan ini untuk **demo saja**, bukan produksi. Semua layanan di bawah
gratis tanpa kartu kredit dan tanpa masa trial yang habis. Total waktu:
~30-45 menit. Dicek per Juli 2026 — cek ulang harga kalau kamu baca ini jauh
setelahnya, kebijakan free tier sering berubah.

## Gambaran stack

| Bagian | Layanan | Fungsi |
|---|---|---|
| `apps/web` (dashboard) | **Vercel** | tampilan yang dibuka user |
| `apps/api` (backend + WhatsApp gateway) | **Render** | otak sistem |
| Database | **Neon** (Postgres) | simpan semua data |
| Antrian/cache | **Upstash** (Redis) | queue campaign, cache |

Urutan pengerjaan **wajib**: Neon → Upstash → Render → Vercel. Alasannya:
Render butuh `DATABASE_URL` dari Neon dan `REDIS_URL` dari Upstash sebelum
bisa jalan, jadi dua itu harus siap duluan.

**Siapkan sebelum mulai:**
- Repo ini sudah ada di GitHub kamu (branch `main` yang sudah dibersihkan).
- Endpoint AI (`AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`) — pakai OpenAI,
  OpenRouter, atau Nous Portal. Kalau belum punya, daftar dulu di salah satu
  itu dan ambil API key-nya, siapkan di notepad.

---

## 1. Neon (Database Postgres) — ~5 menit

1. Buka [neon.tech](https://neon.tech) → **Sign up** (bisa pakai akun
   GitHub, tidak perlu kartu kredit).
2. Setelah masuk dashboard, klik **Create a project**.
3. Isi nama project, misal `hermes-demo`. Region pilih yang paling dekat
   (misal Singapore/AWS ap-southeast-1). Klik **Create project**.
4. Di halaman project, cari tab **Connection Details** / **Dashboard**.
   Pastikan opsi **"Pooled connection"** dicentang/aktif (penting — bukan
   direct connection).
5. Copy nilai **Connection string**-nya. Bentuknya seperti:
   ```
   postgresql://user:password@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```
6. Simpan ini di notepad dengan label `DATABASE_URL`.

---

## 2. Upstash (Redis) — ~3 menit

1. Buka [upstash.com](https://upstash.com) → **Sign up** (bisa pakai GitHub).
2. Di dashboard, klik **Create database**.
3. Isi nama, misal `hermes-demo-redis`. Type pilih **Regional** (bukan
   Global — regional cukup dan gratis). Region samakan/dekat dengan Neon.
4. Setelah dibuat, buka database itu, scroll ke bagian **REST API** /
   **Connect**, cari **`Redis URL`** atau **`rediss://`** connection string
   (bukan REST URL, tapi Redis protocol URL). Bentuknya:
   ```
   rediss://default:xxxxxxxx@xxxx-xxxx.upstash.io:6379
   ```
5. Simpan di notepad dengan label `REDIS_URL`.

---

## 3. Render (Backend API) — ~15 menit

1. Buka [render.com](https://render.com) → **Get Started** → sign up pakai
   GitHub (izinkan akses ke repo kamu, atau minimal ke repo Hermes ini).
2. Di dashboard, klik **New +** (pojok kanan atas) → **Blueprint**.
3. Pilih repo GitHub kamu (yang sudah berisi branch `main` hasil kerjaan
   kita). Render otomatis mendeteksi file [`render.yaml`](../render.yaml)
   di root repo dan menampilkan preview service `hermes-api`.
4. Klik **Apply** / **Create New Resources**. Render mulai generate service
   tapi belum bisa build sampai environment variable diisi.
5. Buka service **hermes-api** yang baru dibuat → tab **Environment**.
   Isi/lengkapi variabel berikut (yang belum ada nilainya, klik **Add
   Environment Variable**):

   | Key | Isi dengan |
   |---|---|
   | `DATABASE_URL` | connection string dari Neon (langkah 1) |
   | `REDIS_URL` | connection string dari Upstash (langkah 2) |
   | `AI_BASE_URL` | endpoint AI kamu, contoh `https://api.openai.com/v1` |
   | `AI_API_KEY` | API key AI kamu |
   | `AI_MODEL` | nama model, contoh `gpt-4o-mini` atau `Hermes-4-70B` |

   `JWT_SECRET` dan `SEED_OWNER_PASSWORD` **sudah otomatis di-generate**
   oleh `render.yaml` — tidak perlu diisi manual, tapi nanti kamu perlu
   lihat nilai `SEED_OWNER_PASSWORD`-nya (klik ikon mata di sebelah
   variabelnya) untuk bisa login.
6. Klik **Save Changes** — Render otomatis mulai build & deploy (lihat tab
   **Logs**, tunggu sampai muncul `Hermes API listening on...`, biasanya
   2-5 menit).
7. Setelah status service jadi **Live** (bulat hijau), copy URL service-nya
   di bagian atas halaman, contoh:
   ```
   https://hermes-api-xxxx.onrender.com
   ```
   Simpan di notepad dengan label `RENDER_URL`.
8. **Jalankan migrasi database + seed akun owner** (baru sekali ini saja):
   buka tab **Shell** di service Render kamu (pojok atas), lalu ketik:
   ```bash
   npm run db:migrate --workspace=@sentinel/database
   npm run db:seed --workspace=@sentinel/database
   ```
   Tekan Enter, tunggu sampai muncul `Seeded owner user: owner@hermes.local`.
9. Uji API-nya hidup — buka di browser tab baru:
   ```
   https://hermes-api-xxxx.onrender.com/api/v1/health
   ```
   Harus muncul `{"status":"ok", ...}`. Kalau muncul error/502, cek tab
   **Logs** di Render untuk lihat pesan errornya (biasanya `DATABASE_URL`
   atau `REDIS_URL` salah copy).

---

## 4. Vercel (Dashboard/Frontend) — ~10 menit

1. Buka [vercel.com](https://vercel.com) → **Sign Up** pakai GitHub.
2. Di dashboard, klik **Add New** → **Project**.
3. Pilih repo GitHub yang sama → klik **Import**.
4. Di layar konfigurasi build, klik **Edit** di bagian **Root Directory**,
   pilih/ketik `apps/web`.
5. Pastikan Vercel mendeteksi **Framework Preset: Next.js** otomatis (kalau
   belum, pilih manual).
6. Buka bagian **Environment Variables**, tambahkan dua ini (ganti
   `hermes-api-xxxx` dengan URL Render kamu dari langkah 3.7):

   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://hermes-api-xxxx.onrender.com/api/v1` |
   | `NEXT_PUBLIC_SOCKET_URL` | `https://hermes-api-xxxx.onrender.com/events` |

7. Klik **Deploy**. Tunggu 2-4 menit sampai selesai build.
8. Setelah selesai, klik **Visit** / buka URL Vercel-nya (contoh
   `https://hermes-control.vercel.app`).

---

## 5. Login pertama kali

1. Buka URL Vercel kamu → halaman login akan muncul.
2. Email: `owner@hermes.local`
3. Password: nilai `SEED_OWNER_PASSWORD` yang tadi kamu lihat di Render →
   Environment tab (langkah 3.5).
4. Setelah masuk, **langsung ganti password** lewat menu Settings/Profile —
   password auto-generate itu ada di config yang bisa dilihat siapa pun yang
   punya akses ke Render project kamu.
5. Coba tambah akun WhatsApp (menu WhatsApp Accounts) → scan QR dengan HP →
   kirim pesan test dari nomor lain → cek muncul di dashboard.

---

## Hidup dengan free tier (batasan yang wajar untuk demo)

- **Render tidur setelah 15 menit tidak ada request.** Request pertama
  setelah itu lambat (~30-60 detik) — jangan kaget saat demo live, buka
  dashboard beberapa menit sebelum sesi demo dimulai supaya sudah "bangun".
- **Tidak ada disk permanen di Render free tier** — kalau service
  sleep/redeploy, sesi WhatsApp (`.wa-sessions`) bisa hilang dan minta scan
  QR ulang. Untuk demo ini normal, tinggal scan lagi.
- **Neon**: 100 CU-hour & 0.5GB — cukup untuk demo, kalau mau reset data
  tinggal hapus & buat project baru (gratis lagi).
- **Upstash**: 500K command/bulan — jauh dari cukup untuk demo skala kecil.

## Kalau butuh yang lebih stabil (bukan cuma demo)

Sesi WhatsApp yang sering putus itu tanda kamu sudah butuh disk permanen.
Naik ke [`vercel-railway-setup.md`](./vercel-railway-setup.md) (berbayar,
~$50-60/bulan, disk permanen) atau [`vps-deploy.md`](./vps-deploy.md) (VPS
sendiri, docker-compose sudah disiapkan di repo).

## Troubleshooting cepat

| Gejala | Penyebab umum | Perbaikan |
|---|---|---|
| Render build gagal | Salah isi env var, atau lupa isi | Cek tab Logs, biasanya nama variabel yang typo |
| `/health` return 502 | `DATABASE_URL`/`REDIS_URL` salah | Copy ulang dari Neon/Upstash, pastikan tidak ada spasi tertinggal |
| Login gagal 401 | Belum jalankan `db:seed` | Ulangi langkah 3.8 |
| Dashboard blank/API error di browser | `NEXT_PUBLIC_API_URL` di Vercel salah/kurang `/api/v1` | Edit env var di Vercel → Redeploy |
| QR WhatsApp tidak muncul | Render baru saja sleep lalu bangun, kasih waktu ~10 detik | Refresh halaman |

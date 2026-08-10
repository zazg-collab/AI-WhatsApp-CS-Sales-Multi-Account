-- >>> ANGGA — LANGKAH 5 (2026-08-10): langkah funnel menempel pada PESAN.
-- Nullable, tanpa default: pesan lama tetap NULL = "tidak menanyakan langkah apa pun".
-- Idempoten supaya riwayat migrasi bisa diputar ulang dari DB kosong.
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "funnel_step" TEXT;

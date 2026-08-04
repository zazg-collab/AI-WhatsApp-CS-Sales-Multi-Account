-- >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): pisahkan alasan penahanan
-- gerbang uang dari `content`. Sebelumnya alasan ("gerbang uang menahan: ...")
-- ditempel sebagai prefiks teks langsung ke `content` -- kalau admin klik
-- Approve tanpa edit dulu, teks debug internal itu ikut terkirim ke pelanggan.
-- Default array kosong = tidak pernah ditahan gerbang uang.
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "money_gate_issues" TEXT[] NOT NULL DEFAULT '{}';

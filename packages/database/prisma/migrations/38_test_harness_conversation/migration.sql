-- >>> ANGGA — F3b (2026-08-09, cowork): test-harness memakai Conversation asli.
--
-- DITULIS MANUAL, bukan `prisma migrate dev` — lihat alasan di migrasi
-- 37_order_context_events: `migrate dev` men-diff skema vs DB dan MEN-DROP
-- objek raw-SQL yang tidak dikenal schema.prisma (insiden index HNSW pgvector
-- 2026-08-04). Apply HANYA dengan `prisma migrate deploy`.
--
-- Kenapa: otak bot (`shipping.service`, `order-context.service`) membaca
-- `conversations`/`messages`, dan `order_context_events` punya FK ke
-- `conversations`. Selama sesi uji hidup di tabelnya sendiri, memori order,
-- funnelExpect, dan turnMemo MUSTAHIL terisi dari tester — tester menguji bot
-- yang berbeda dari yang melayani pelanggan (T6).

-- 1. Akun WA khusus test-harness. INI HANYA BARIS DATABASE: tidak ada QR,
--    tidak ada socket Baileys, tidak ada login. is_active = false supaya tidak
--    ikut terhitung sebagai akun kerja. Kolom lain sengaja dibiarkan memakai
--    default schema (gateway_type=baileys, session_status=disconnected,
--    ai_mode=ai_draft) supaya migrasi ini tidak menebak label enum.
-- >>> ANGGA — koreksi AUDIT (2026-08-09, cowork): `phone_number` juga UNIQUE,
--    dan `ON CONFLICT ("id")` TIDAK menangkap tabrakan di kolom itu. Kalau ada
--    database (mis. staging yang pernah dicoba manual) yang sudah memuat nomor
--    '000-test-harness' dengan id berbeda, `migrate deploy` berhenti dengan
--    23505 dan seluruh deploy gagal. Dijaga `WHERE NOT EXISTS` atas KEDUA kunci
--    unik, bukan cuma salah satunya.
INSERT INTO "whatsapp_accounts" ("id", "account_name", "phone_number", "is_active", "created_at", "updated_at")
SELECT '00000000-0000-4000-8000-0000000f3b00', 'Test Harness (lokal)', '000-test-harness', false, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "whatsapp_accounts"
  WHERE "id" = '00000000-0000-4000-8000-0000000f3b00' OR "phone_number" = '000-test-harness'
);

-- 2. Pesan uji pindah ke tabel `messages`. Tabel lama dibuang.
--    Data lama TIDAK dimigrasikan — isinya percakapan uji sekali pakai.
DROP TABLE IF EXISTS "test_messages";

-- 3. `test_sessions` susut jadi penunjuk. Baris lama dihapus lebih dulu karena
--    tidak punya conversation_id dan akan melanggar NOT NULL.
DELETE FROM "test_sessions";

ALTER TABLE "test_sessions" ADD COLUMN "conversation_id" TEXT NOT NULL;

CREATE UNIQUE INDEX "test_sessions_conversation_id_key" ON "test_sessions"("conversation_id");

ALTER TABLE "test_sessions"
  ADD CONSTRAINT "test_sessions_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

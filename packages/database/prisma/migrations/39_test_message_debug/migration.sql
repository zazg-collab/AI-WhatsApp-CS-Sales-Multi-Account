-- >>> ANGGA — F3c (2026-08-09, cowork): rumah DebugSnapshot panel test-harness.
-- Ditulis MANUAL (lihat alasan di migrasi 37). Apply dengan `migrate deploy`.
--
-- Sesudah F3b pesan uji tinggal di `messages`, tabel produksi yang tidak punya
-- kolom debug khusus tester — dan tidak boleh diberi. Tanpa tabel ini, panel
-- debug kehilangan riwayatnya setiap kali sesi dibuka ulang: itu downgrade.
CREATE TABLE "test_message_debug" (
    "message_id" TEXT NOT NULL,
    "debug_info" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_message_debug_pkey" PRIMARY KEY ("message_id")
);

ALTER TABLE "test_message_debug"
  ADD CONSTRAINT "test_message_debug_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

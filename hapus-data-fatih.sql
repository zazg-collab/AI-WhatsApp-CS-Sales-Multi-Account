-- ============================================================================
-- Hapus riwayat testing "Fatih" — Hermes (Cordova Store)
-- Disiapkan 2026-08-04. Jalankan LEWAT Bossfren/Antigravity, bukan otomatis
-- dari Cowork (sandbox ini tidak nyambung ke DB — localhost:5433 connection
-- refused, dicek langsung dari device_bash).
--
-- CARA PAKAI:
--   1. Ganti 6285722193049 di bawah dengan nomor HP-nya (format persis
--      seperti tersimpan di kolom customers.phone_number, mis. 6281234567890
--      tanpa "+" — cek dulu kalau ragu, lihat langkah 0).
--   2. docker compose exec postgres psql -U hermes -d hermes -f hapus-data-fatih.sql
--      (sesuaikan nama service kalau bukan "postgres" — cek docker-compose.yml)
--
-- KENAPA CUKUP SATU DELETE (bukan hapus tabel per tabel seperti precedent
-- lama "hapus-fatih-YYYYMMDD-N"): skema Prisma sekarang pakai onDelete:Cascade
-- rapi — Conversation.customer, Message.conversation, SentinelReview.conversation
-- semuanya cascade. Hapus baris customers otomatis membawa conversations,
-- messages, sentinel_reviews miliknya. (whatsapp_contacts & learning_proposals
-- SURVIVE dengan customer_id di-null-kan — tidak masalah, bukan riwayat chat.)
--
-- CACHE: tidak perlu truncate tabel/Redis apa pun — ai-cache.service.ts dan
-- shipping-quote.cache.ts SEKARANG in-memory Map per proses (bukan Redis/
-- Postgres lagi, beda dari precedent lama). Cache kutipan ongkir dikunci per
-- conversationId — begitu conversation lama dihapus & yang baru dibuat saat
-- Fatih chat lagi, cache lama otomatis tidak relevan. Cache jawaban AI malah
-- dari awal bukan per-customer (kunci botId+pertanyaan, TTL 10 menit), jadi
-- tidak ada yang perlu dibersihkan di situ untuk "Fatih" secara spesifik.
-- ============================================================================

-- LANGKAH 0 (opsional tapi disarankan): pastikan dulu ini benar row Fatih
-- sebelum menghapus apa pun. Jalankan SENDIRI dulu, baca hasilnya.
SELECT id, name, phone_number, lead_stage, created_at, last_message_at
FROM customers
WHERE phone_number = '6285722193049';

-- Preview berapa banyak yang bakal ikut kehapus (jalankan sebelum DELETE):
SELECT
  (SELECT count(*) FROM conversations WHERE customer_id = c.id) AS jumlah_percakapan,
  (SELECT count(*) FROM messages m JOIN conversations co ON co.id = m.conversation_id WHERE co.customer_id = c.id) AS jumlah_pesan,
  (SELECT count(*) FROM sentinel_reviews sr JOIN conversations co ON co.id = sr.conversation_id WHERE co.customer_id = c.id) AS jumlah_review_sentinel
FROM customers c
WHERE c.phone_number = '6285722193049';

-- LANGKAH 1 — backup dulu (matching precedent lama: backup sebelum hapus).
-- Bikin tabel salinan bertanggal, gampang di-drop kalau sudah yakin aman.
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_20260804_customers AS
  SELECT * FROM customers WHERE phone_number = '6285722193049';
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_20260804_conversations AS
  SELECT co.* FROM conversations co
  JOIN customers c ON c.id = co.customer_id
  WHERE c.phone_number = '6285722193049';
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_20260804_messages AS
  SELECT m.* FROM messages m
  JOIN conversations co ON co.id = m.conversation_id
  JOIN customers c ON c.id = co.customer_id
  WHERE c.phone_number = '6285722193049';
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_20260804_sentinel_reviews AS
  SELECT sr.* FROM sentinel_reviews sr
  JOIN conversations co ON co.id = sr.conversation_id
  JOIN customers c ON c.id = co.customer_id
  WHERE c.phone_number = '6285722193049';

-- LANGKAH 2 — hapus. SATU baris ini cukup (cascade menangani sisanya).
DELETE FROM customers WHERE phone_number = '6285722193049';

-- LANGKAH 3 (opsional, jalankan belakangan kalau sudah yakin aman & tidak
-- perlu backup lagi — BUKAN bagian otomatis dari skrip ini):
--   DROP TABLE _backup_hapus_fatih_20260804_customers;
--   DROP TABLE _backup_hapus_fatih_20260804_conversations;
--   DROP TABLE _backup_hapus_fatih_20260804_messages;
--   DROP TABLE _backup_hapus_fatih_20260804_sentinel_reviews;

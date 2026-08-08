-- ============================================================================
-- Hapus TOTAL semua jejak "Fatih" — Hermes (Cordova Store)
-- Disiapkan 2026-08-04, ronde 2. Jalankan sendiri lewat docker compose exec
-- (sandbox Cowork tidak nyambung ke DB — localhost:5433 connection refused).
--
-- KENAPA RONDE 1 (hapus-data-fatih.sql) BELUM TUNTAS:
-- Ronde 1 menghapus baris `customers` (dan ikut kebawa: conversations, messages,
-- sentinel_reviews lewat cascade). TAPI ada satu tabel lain yang SENGAJA didesain
-- untuk TIDAK ikut kehapus otomatis: `whatsapp_contacts` (relasi ke customer pakai
-- onDelete: SetNull, bukan Cascade — biar daftar kontak WA gak ikut rusak kalau
-- satu customer dihapus). Baris whatsapp_contacts punya kolom name/notify/
-- verified_name sendiri (terpisah dari customers.name, yang di ronde 1 malah
-- kosong) — INI kemungkinan besar sumber nama "Fatih" yang masih keliatan.
--
-- CATATAN PENTING soal WhatsApp pushName (BUKAN sesuatu yang bisa dihapus dari DB):
-- Kalau nomor itu chat lagi ke bot, WhatsApp SENDIRI yang kirim nama tampilan
-- (pushName) apa adanya sesuai yang disetel di HP nomor itu — sistem otomatis
-- bikin customer BARU dengan nama itu lagi (message-ingest.service.ts). Ini bukan
-- data lama yang "gagal dihapus", ini percakapan BARU yang genuinely baru terjadi.
-- Kalau memang gak mau kejadian lagi, satu-satunya cara adalah nomor itu jangan
-- chat lagi ke bot (atau di-opt-out/di-block), bukan sesuatu yang bisa dicegah
-- lewat hapus data.
--
-- CARA PAKAI:
--   1. Ganti 6285722193049 di bawah dengan nomor HP yang sama persis dipakai
--      di ronde 1 (format tanpa "+", mis. 6285722193049).
--   2. Jalankan LANGKAH 0 dulu (read-only), baca hasilnya baik-baik — ini nyari
--      SEMUA baris yang masih menyebut "fatih" (case-insensitive) di beberapa
--      tabel sekaligus, bukan cuma yang cocok nomor HP-nya. Kalau ada baris yang
--      TERNYATA bukan punya nomor Fatih (nama kebetulan sama/typo beda orang),
--      JANGAN lanjut ke LANGKAH 2 buat baris itu — kabari dulu.
--   3. docker compose exec -T postgres psql -U hermes -d hermes < hapus-fatih-total.sql
--      (dari folder hermes_repo, sama seperti ronde 1)
-- ============================================================================

-- LANGKAH 0 — cek dulu, baca hasilnya. Nyari di whatsapp_contacts (nama tampilan
-- WA yang tersimpan) DAN learning_proposals (kalau ada proposal pembelajaran
-- yang nyangkut ke percakapan Fatih dulu), pakai NOMOR HP maupun NAMA sekaligus
-- supaya kalau ada baris "Fatih" dengan nomor lain juga ketahuan (tapi jangan
-- langsung dihapus tanpa dicek, lihat catatan di atas).
SELECT 'whatsapp_contacts (by phone)' AS sumber, id, jid, phone_number, name, notify, verified_name, customer_id
FROM whatsapp_contacts
WHERE phone_number = '6285722193049' OR jid LIKE '6285722193049@%';

SELECT 'whatsapp_contacts (by name, cek manual!)' AS sumber, id, jid, phone_number, name, notify, verified_name, customer_id
FROM whatsapp_contacts
WHERE name ILIKE '%fatih%' OR notify ILIKE '%fatih%' OR verified_name ILIKE '%fatih%';

SELECT 'customers (by name, harusnya kosong kalau ronde 1 sukses)' AS sumber, id, name, phone_number
FROM customers
WHERE name ILIKE '%fatih%' OR phone_number = '6285722193049';

SELECT 'learning_proposals (masih nyangkut ke customer lama?)' AS sumber, id, title, customer_id, conversation_id
FROM learning_proposals
WHERE customer_id IS NULL AND (title ILIKE '%fatih%');

-- LANGKAH 1 — backup dulu sebelum hapus (matching pola ronde 1).
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_total_20260804_whatsapp_contacts AS
  SELECT * FROM whatsapp_contacts
  WHERE phone_number = '6285722193049' OR jid LIKE '6285722193049@%';

-- LANGKAH 2 — hapus baris whatsapp_contacts milik nomor Fatih (SATU-SATUNYA
-- tabel yang sengaja tidak ikut cascade di ronde 1). Aman: tabel ini cuma cache
-- kontak WA untuk tampilan/pencarian, BUKAN riwayat chat — sudah tidak ada
-- conversations/messages yang menunjuk ke sini lagi sejak ronde 1.
DELETE FROM whatsapp_contacts
WHERE phone_number = '6285722193049' OR jid LIKE '6285722193049@%';

-- LANGKAH 3 (opsional, jalankan belakangan kalau sudah yakin aman):
--   DROP TABLE _backup_hapus_fatih_total_20260804_whatsapp_contacts;
--   DROP TABLE _backup_hapus_fatih_20260804_customers;          (dari ronde 1)
--   DROP TABLE _backup_hapus_fatih_20260804_conversations;      (dari ronde 1)
--   DROP TABLE _backup_hapus_fatih_20260804_messages;           (dari ronde 1)
--   DROP TABLE _backup_hapus_fatih_20260804_sentinel_reviews;   (dari ronde 1)

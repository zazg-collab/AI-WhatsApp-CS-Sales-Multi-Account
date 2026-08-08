-- ============================================================================
-- Hapus TOTAL semua jejak "Fatih" — RONDE 3 (identitas @lid yang kelewat)
-- Disiapkan 2026-08-04. Jalankan sendiri lewat docker compose exec.
--
-- KENAPA MASIH ADA CHAT FATIH SETELAH RONDE 1 & 2:
-- Ronde 1 hapus customer dengan phone_number = nomor HP asli Fatih (6285722193049).
-- Ronde 2 hapus baris whatsapp_contacts untuk nomor itu juga.
-- TAPI hasil query LANGKAH 0 ronde 2 nemuin ada CUSTOMER LAIN, orang yang sama
-- (nama "Fatih") tapi disimpan pakai identitas BEDA:
--   customers.id           = 965e0316-e96b-4b9e-b0a2-74a89fc5d647
--   customers.phone_number = 27608184053792@lid   (BUKAN nomor asli — ini "Linked ID"
--                                                   internal WhatsApp multi-device,
--                                                   dipakai sebelum WA "resolve" ke
--                                                   nomor HP asli)
--   whatsapp_contacts.id   = 7a58fd7a-818b-4655-b6c4-4bebb4626b96 (jid sama, @lid)
--
-- Ini BUKAN typo atau kegagalan hapus — ini dua baris `customers` yang GENUINELY
-- terpisah di database untuk orang yang sama, karena WhatsApp kadang kirim pesan
-- dari kontak yang sama pakai dua identitas berbeda (nomor asli vs kode @lid)
-- sebelum ke-"resolve" jadi satu. Kode Hermes (contact-sync.service.ts) punya
-- mekanisme buat gabungin ini (recordLidMapping/mergeCustomerInto) tapi
-- kelihatannya belum sempat ke-trigger untuk kontak ini. Makanya scoping ronde 1
-- (by nomor HP asli) gak nyentuh baris @lid ini sama sekali — beda kolom
-- phone_number-nya.
--
-- Kali ini pakai ID PERSIS (bukan pattern), diambil langsung dari hasil query
-- ronde 2 yang Bossfren jalankan — jadi tidak ada ambiguitas sama sekali.
--
-- CARA PAKAI:
--   docker compose exec -T postgres psql -U hermes -d hermes < hapus-fatih-lid.sql
--   (dari folder hermes_repo, sama seperti ronde 1 & 2)
-- ============================================================================

-- LANGKAH 0 — preview, baca dulu sebelum lanjut.
SELECT
  (SELECT count(*) FROM conversations WHERE customer_id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647') AS jumlah_percakapan,
  (SELECT count(*) FROM messages m JOIN conversations co ON co.id = m.conversation_id WHERE co.customer_id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647') AS jumlah_pesan,
  (SELECT count(*) FROM sentinel_reviews sr JOIN conversations co ON co.id = sr.conversation_id WHERE co.customer_id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647') AS jumlah_review_sentinel;

-- LANGKAH 1 — backup dulu.
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_lid_20260804_customers AS
  SELECT * FROM customers WHERE id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647';
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_lid_20260804_conversations AS
  SELECT * FROM conversations WHERE customer_id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647';
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_lid_20260804_messages AS
  SELECT m.* FROM messages m
  JOIN conversations co ON co.id = m.conversation_id
  WHERE co.customer_id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647';
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_lid_20260804_sentinel_reviews AS
  SELECT sr.* FROM sentinel_reviews sr
  JOIN conversations co ON co.id = sr.conversation_id
  WHERE co.customer_id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647';
CREATE TABLE IF NOT EXISTS _backup_hapus_fatih_lid_20260804_whatsapp_contacts AS
  SELECT * FROM whatsapp_contacts WHERE id = '7a58fd7a-818b-4655-b6c4-4bebb4626b96';

-- LANGKAH 2 — hapus. Customer dulu (cascade bawa conversations/messages/
-- sentinel_reviews-nya), lalu whatsapp_contacts (SetNull, gak ikut cascade,
-- harus dihapus manual sama seperti ronde 2).
DELETE FROM customers WHERE id = '965e0316-e96b-4b9e-b0a2-74a89fc5d647';
DELETE FROM whatsapp_contacts WHERE id = '7a58fd7a-818b-4655-b6c4-4bebb4626b96';

-- LANGKAH 3 — verifikasi tidak ada sisa sama sekali (harusnya 0 baris keduanya).
SELECT 'customers' AS sumber, count(*) FROM customers
WHERE name ILIKE '%fatih%' OR phone_number ILIKE '%fatih%'
UNION ALL
SELECT 'whatsapp_contacts', count(*) FROM whatsapp_contacts
WHERE name ILIKE '%fatih%' OR notify ILIKE '%fatih%' OR verified_name ILIKE '%fatih%';

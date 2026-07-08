-- Deleting a WhatsApp account already cascades its conversations/messages.
-- Customer rows were left behind as orphans (sourceAccountId set NULL),
-- piling up as duplicate "Tanpa nama / Nomor tersembunyi" ghosts on re-pair
-- (the (phoneNumber, sourceAccountId) unique key can't match an orphaned NULL
-- row, so a fresh customer gets created every time the account is recreated).
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_source_account_id_fkey";

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_source_account_id_fkey"
  FOREIGN KEY ("source_account_id") REFERENCES "whatsapp_accounts"("id")
  ON UPDATE CASCADE ON DELETE CASCADE;

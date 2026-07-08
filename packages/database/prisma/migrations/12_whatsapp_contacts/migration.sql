-- Persist WhatsApp contact-book sync data from Baileys contacts/history events.
CREATE TABLE "whatsapp_contacts" (
  "id" TEXT NOT NULL,
  "whatsapp_account_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "jid" TEXT NOT NULL,
  "lid" TEXT,
  "phone_number" TEXT,
  "name" TEXT,
  "notify" TEXT,
  "verified_name" TEXT,
  "avatar_url" TEXT,
  "status" TEXT,
  "raw" JSONB,
  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_contacts_whatsapp_account_id_jid_key" ON "whatsapp_contacts"("whatsapp_account_id", "jid");
CREATE INDEX "whatsapp_contacts_whatsapp_account_id_idx" ON "whatsapp_contacts"("whatsapp_account_id");
CREATE INDEX "whatsapp_contacts_phone_number_idx" ON "whatsapp_contacts"("phone_number");

ALTER TABLE "whatsapp_contacts"
  ADD CONSTRAINT "whatsapp_contacts_whatsapp_account_id_fkey"
  FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "whatsapp_contacts"
  ADD CONSTRAINT "whatsapp_contacts_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Quick replies / message templates + conversation SLA breach tracking.

-- SLA: timestamp the conversation was flagged as awaiting an overdue reply
-- (null = within SLA / already answered). Set & cleared by the SLA scanner.
ALTER TABLE "conversations" ADD COLUMN "sla_breached_at" TIMESTAMP(3);

-- Canned replies / message templates.
CREATE TABLE "quick_replies" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "shortcut" TEXT,
  "whatsapp_account_id" TEXT,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quick_replies_whatsapp_account_id_idx" ON "quick_replies"("whatsapp_account_id");

ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_whatsapp_account_id_fkey"
  FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

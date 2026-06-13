-- Change onDelete from RESTRICT to CASCADE for conversations and campaigns FKs
-- on whatsapp_account_id. Prisma schema was updated but no migration was generated.

-- Drop existing FK constraints
ALTER TABLE "conversations" DROP CONSTRAINT "conversations_whatsapp_account_id_fkey";
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_whatsapp_account_id_fkey";

-- Re-create with CASCADE
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

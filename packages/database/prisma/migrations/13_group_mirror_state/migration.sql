-- Store WhatsApp group chat identity, metadata, and participant snapshots.
ALTER TABLE "conversations"
  ADD COLUMN "chat_jid" TEXT,
  ADD COLUMN "is_group" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "group_subject" TEXT,
  ADD COLUMN "group_owner_jid" TEXT,
  ADD COLUMN "group_description" TEXT,
  ADD COLUMN "group_participants" JSONB,
  ADD COLUMN "group_metadata" JSONB;

CREATE UNIQUE INDEX "conversations_whatsapp_account_id_chat_jid_key"
  ON "conversations"("whatsapp_account_id", "chat_jid");

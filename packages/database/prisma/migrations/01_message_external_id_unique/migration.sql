-- Deduplicate inbound WhatsApp messages: prevent the same external_id being
-- ingested twice into the same conversation (H1).
-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_external_id_key" ON "messages"("conversation_id", "external_id");

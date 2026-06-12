-- Conversation workflow status (open/pending/resolved) + message reply/quote link.
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'pending', 'resolved');

ALTER TABLE "conversations" ADD COLUMN "status" "ConversationStatus" NOT NULL DEFAULT 'open';

ALTER TABLE "messages" ADD COLUMN "quoted_message_id" TEXT;
ALTER TABLE "messages" ADD CONSTRAINT "messages_quoted_message_id_fkey"
  FOREIGN KEY ("quoted_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

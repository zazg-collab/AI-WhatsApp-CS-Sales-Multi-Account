-- Performance audit (P1): add indexes for hot filter/sort columns that were
-- missing them — conversation/customer list & export queries order by
-- last_message_at on every request, and filter by status/assigned_admin_id/
-- source_account_id without an index to use.

CREATE INDEX IF NOT EXISTS "conversations_status_idx" ON "conversations"("status");
CREATE INDEX IF NOT EXISTS "conversations_assigned_admin_id_idx" ON "conversations"("assigned_admin_id");
CREATE INDEX IF NOT EXISTS "conversations_last_message_at_idx" ON "conversations"("last_message_at");

CREATE INDEX IF NOT EXISTS "customers_source_account_id_idx" ON "customers"("source_account_id");
CREATE INDEX IF NOT EXISTS "customers_assigned_admin_id_idx" ON "customers"("assigned_admin_id");
CREATE INDEX IF NOT EXISTS "customers_last_message_at_idx" ON "customers"("last_message_at");

-- Message pagination (getMessages/exportList) filters by conversation_id and
-- always sorts by created_at — replace the single-column index with a
-- composite one that satisfies both in a single index scan.
DROP INDEX IF EXISTS "messages_conversation_id_idx";
CREATE INDEX IF NOT EXISTS "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

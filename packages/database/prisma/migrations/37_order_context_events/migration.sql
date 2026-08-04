-- >>> ANGGA — Order Context Log (blueprint 2026-08-04): tabel memori order
-- per percakapan, append-only. Ditulis manual (BUKAN `prisma migrate dev` —
-- lihat insiden index HNSW 2026-08-04: migrate dev men-diff skema vs DB dan
-- men-drop objek raw-SQL yang tidak dikenal schema.prisma). Apply dengan
-- `npx prisma migrate deploy`.
CREATE TABLE "order_context_events" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_context_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "order_context_events_conversation_id_created_at_idx"
    ON "order_context_events"("conversation_id", "created_at");

ALTER TABLE "order_context_events"
    ADD CONSTRAINT "order_context_events_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

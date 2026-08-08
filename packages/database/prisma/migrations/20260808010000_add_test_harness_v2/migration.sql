-- CreateTable
CREATE TABLE "test_sessions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "debug_info" JSONB,

    CONSTRAINT "test_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "test_messages_session_id_timestamp_idx" ON "test_messages"("session_id", "timestamp");

-- AddForeignKey
ALTER TABLE "test_messages" ADD CONSTRAINT "test_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

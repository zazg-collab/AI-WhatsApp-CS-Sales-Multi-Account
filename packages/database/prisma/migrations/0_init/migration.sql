-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'supervisor', 'admin', 'viewer');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "GatewayType" AS ENUM ('baileys', 'gowa', 'cloud_api');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('connected', 'disconnected', 'qr_required', 'banned', 'reconnecting', 'paused');

-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('ai_on', 'ai_off', 'ai_draft', 'ai_supervised', 'ai_paused');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('active', 'inactive', 'draft');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('draft', 'active', 'expired', 'archived', 'needs_review');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('cold', 'warm', 'hot', 'very_hot');

-- CreateEnum
CREATE TYPE "TakeoverStatus" AS ENUM ('ai_active', 'admin_takeover', 'waiting_admin', 'resolved', 'returned_to_ai');

-- CreateEnum
CREATE TYPE "SenderType" AS ENUM ('customer', 'admin', 'ai', 'system', 'hermes');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'video', 'audio', 'voice', 'document', 'sticker', 'location', 'system');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('pending', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'running', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('queued', 'sending', 'sent', 'failed', 'blocked');

-- CreateEnum
CREATE TYPE "HermesDecision" AS ENUM ('approve', 'draft', 'block', 'pause_ai', 'takeover_required');

-- CreateTable "users"
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable "whatsapp_accounts"
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "assigned_admin_id" TEXT,
    "assigned_bot_id" TEXT,
    "ai_mode" "AiMode" NOT NULL DEFAULT 'ai_off',
    "session_status" "SessionStatus" NOT NULL DEFAULT 'disconnected',
    "gateway_type" "GatewayType" NOT NULL DEFAULT 'baileys',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable "bots"
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "BotStatus" NOT NULL DEFAULT 'draft',
    "persona_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable "personas"
CREATE TABLE "personas" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "soul_md" TEXT NOT NULL,
    "marketing_flow" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable "knowledge_bases"
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "bot_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable "knowledge_items"
CREATE TABLE "knowledge_items" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'draft',
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable "customers"
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "source_account_id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "lead_stage" "LeadStage" NOT NULL DEFAULT 'cold',
    "lead_score" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assigned_admin_id" TEXT,
    "notes" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable "conversations"
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "whatsapp_account_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "ai_mode" "AiMode" NOT NULL DEFAULT 'ai_off',
    "takeover_status" "TakeoverStatus" NOT NULL DEFAULT 'ai_active',
    "takeover_by_id" TEXT,
    "last_message" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable "messages"
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_type" "SenderType" NOT NULL,
    "sender_id" TEXT,
    "message_type" "MessageType" NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "media_url" TEXT,
    "external_id" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'delivered',
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "hermes_review_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable "hermes_reviews"
CREATE TABLE "hermes_reviews" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "decision" "HermesDecision" NOT NULL,
    "confidence_score" INTEGER NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "risk_level" TEXT NOT NULL,
    "reason" TEXT,
    "recommendation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hermes_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable "follow_ups"
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable "campaigns"
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "whatsapp_account_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "created_by_id" TEXT NOT NULL,
    "approved_by_id" TEXT,
    "target_filter" JSONB NOT NULL DEFAULT '{}',
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable "campaign_recipients"
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'queued',
    "message_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable "audit_logs"
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_key" ON "whatsapp_accounts"("phone_number");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_is_active_idx" ON "whatsapp_accounts"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "personas_bot_id_key" ON "personas"("bot_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_bot_id_idx" ON "knowledge_bases"("bot_id");

-- CreateIndex
CREATE INDEX "knowledge_items_knowledge_base_id_idx" ON "knowledge_items"("knowledge_base_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_number_source_account_id_key" ON "customers"("phone_number", "source_account_id");

-- CreateIndex
CREATE INDEX "customers_source_account_id_idx" ON "customers"("source_account_id");

-- CreateIndex
CREATE INDEX "customers_tags_idx" ON "customers" USING GIN("tags");

-- CreateIndex
CREATE INDEX "conversations_customer_id_whatsapp_account_id_idx" ON "conversations"("customer_id", "whatsapp_account_id");

-- CreateIndex
CREATE INDEX "conversations_ai_mode_idx" ON "conversations"("ai_mode");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_created_at_idx" ON "messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_hermes_review_id_key" ON "messages"("hermes_review_id");

-- CreateIndex
CREATE INDEX "hermes_reviews_conversation_id_idx" ON "hermes_reviews"("conversation_id");

-- CreateIndex
CREATE INDEX "follow_ups_conversation_id_idx" ON "follow_ups"("conversation_id");

-- CreateIndex
CREATE INDEX "campaigns_whatsapp_account_id_idx" ON "campaigns"("whatsapp_account_id");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_customer_id_key" ON "campaign_recipients"("campaign_id", "customer_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_assigned_bot_id_fkey" FOREIGN KEY ("assigned_bot_id") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_takeover_by_id_fkey" FOREIGN KEY ("takeover_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_hermes_review_id_fkey" FOREIGN KEY ("hermes_review_id") REFERENCES "hermes_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hermes_reviews" ADD CONSTRAINT "hermes_reviews_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
CREATE TYPE "HermesDecision" AS ENUM ('approve', 'draft', 'block', 'pause_ai', 'takeover_required');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('scheduled', 'sent', 'cancelled', 'done');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('pending', 'queued', 'sending', 'sent', 'failed', 'skipped');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'admin',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "gateway_type" "GatewayType" NOT NULL DEFAULT 'baileys',
    "session_status" "SessionStatus" NOT NULL DEFAULT 'disconnected',
    "assigned_bot_id" TEXT,
    "assigned_admin_id" TEXT,
    "ai_mode" "AiMode" NOT NULL DEFAULT 'ai_draft',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "bot_name" TEXT NOT NULL,
    "persona_id" TEXT,
    "knowledge_base_id" TEXT,
    "marketing_flow_id" TEXT,
    "default_ai_mode" "AiMode" NOT NULL DEFAULT 'ai_draft',
    "language" TEXT NOT NULL DEFAULT 'id',
    "status" "BotStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "soul_md" TEXT NOT NULL,
    "tone" TEXT,
    "style" TEXT,
    "rules" TEXT,
    "forbidden_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'draft',
    "created_by" TEXT,
    "approved_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "product_name" TEXT,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "phone_number" TEXT NOT NULL,
    "source_account_id" TEXT,
    "assigned_admin_id" TEXT,
    "status" TEXT,
    "lead_score" INTEGER NOT NULL DEFAULT 0,
    "lead_stage" "LeadStage" NOT NULL DEFAULT 'cold',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "whatsapp_account_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "ai_mode" "AiMode" NOT NULL DEFAULT 'ai_draft',
    "takeover_status" "TakeoverStatus" NOT NULL DEFAULT 'ai_active',
    "assigned_admin_id" TEXT,
    "last_message" TEXT,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_type" "SenderType" NOT NULL,
    "sender_id" TEXT,
    "message_type" "MessageType" NOT NULL DEFAULT 'text',
    "content" TEXT,
    "media_url" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'pending',
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "hermes_review_id" TEXT,
    "external_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hermes_reviews" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "conversation_id" TEXT NOT NULL,
    "bot_id" TEXT,
    "confidence_score" INTEGER NOT NULL,
    "risk_score" INTEGER NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "decision" "HermesDecision" NOT NULL,
    "reason" TEXT,
    "recommendation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hermes_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'scheduled',
    "message_template" TEXT,
    "ai_generated_message" TEXT,
    "assigned_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message_template" TEXT NOT NULL,
    "target_filter" JSONB,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "whatsapp_account_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "approved_by_id" TEXT,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 6,
    "human_delay_min_ms" INTEGER NOT NULL DEFAULT 5000,
    "human_delay_max_ms" INTEGER NOT NULL DEFAULT 20000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "phone_number" TEXT NOT NULL,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "sent_message_id" TEXT,
    "error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
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
CREATE INDEX "knowledge_items_knowledge_base_id_idx" ON "knowledge_items"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "customers_lead_stage_idx" ON "customers"("lead_stage");

-- CreateIndex
CREATE UNIQUE INDEX "customers_phone_number_source_account_id_key" ON "customers"("phone_number", "source_account_id");

-- CreateIndex
CREATE INDEX "conversations_whatsapp_account_id_idx" ON "conversations"("whatsapp_account_id");

-- CreateIndex
CREATE INDEX "conversations_customer_id_idx" ON "conversations"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_hermes_review_id_key" ON "messages"("hermes_review_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "hermes_reviews_conversation_id_idx" ON "hermes_reviews"("conversation_id");

-- CreateIndex
CREATE INDEX "follow_ups_scheduled_at_idx" ON "follow_ups"("scheduled_at");

-- CreateIndex
CREATE INDEX "campaigns_status_idx" ON "campaigns"("status");

-- CreateIndex
CREATE INDEX "campaigns_whatsapp_account_id_idx" ON "campaigns"("whatsapp_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_idempotency_key_key" ON "campaign_recipients"("idempotency_key");

-- CreateIndex
CREATE INDEX "campaign_recipients_campaign_id_status_idx" ON "campaign_recipients"("campaign_id", "status");

-- CreateIndex
CREATE INDEX "campaign_recipients_customer_id_idx" ON "campaign_recipients"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_recipients_campaign_id_customer_id_key" ON "campaign_recipients"("campaign_id", "customer_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_assigned_bot_id_fkey" FOREIGN KEY ("assigned_bot_id") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bots" ADD CONSTRAINT "bots_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_source_account_id_fkey" FOREIGN KEY ("source_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_hermes_review_id_fkey" FOREIGN KEY ("hermes_review_id") REFERENCES "hermes_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hermes_reviews" ADD CONSTRAINT "hermes_reviews_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hermes_reviews" ADD CONSTRAINT "hermes_reviews_bot_id_fkey" FOREIGN KEY ("bot_id") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assigned_admin_id_fkey" FOREIGN KEY ("assigned_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


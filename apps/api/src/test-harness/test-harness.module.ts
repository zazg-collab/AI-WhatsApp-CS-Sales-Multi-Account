/**
 * Test Harness Module
 * 
 * NestJS module untuk Web Chat Simulator.
 * Port-safe design: running di NestJS app yang sama di port 3001.
 * 
 * Features:
 * - Isolated database tables (test_sessions, test_messages)
 * - REST API endpoints (/api/v1/test-harness/*)
 * - Web UI served via Express static middleware
 * - MOCK AI replies untuk Fase 1 (MVP)
 * 
 * Created: 2026-08-08
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../modules/ai/ai.module'; // >>> ANGGA — real AI integration
import { ProductsModule } from '../modules/products/products.module';
import { TestHarnessController } from './test-harness.controller';
import { TestHarnessRepository } from './test-harness.repository';
import { ChatSessionManager } from './chat-session.manager';
import { DebugInfoCollector } from './debug-info.collector';
import { ScenarioLoader } from './scenario.loader';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [AiModule, ProductsModule], // >>> ANGGA — provides AiProviderService & ProductsService
  controllers: [TestHarnessController],
  providers: [
    TestHarnessRepository,
    ChatSessionManager,
    DebugInfoCollector,
    ScenarioLoader,
    PrismaService,
  ],
  exports: [
    TestHarnessRepository,
    ChatSessionManager,
    DebugInfoCollector,
    ScenarioLoader,
  ],
})
export class TestHarnessModule {}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { WaModule } from './modules/wa/wa.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AiModule } from './modules/ai/ai.module';
import { HermesModule } from './modules/hermes/hermes.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { CustomersModule } from './modules/customers/customers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    WaModule,
    ConversationsModule,
    AiModule,
    HermesModule,
    KnowledgeModule,
    CustomersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

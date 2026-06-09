import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { WaModule } from './modules/wa/wa.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AiModule } from './modules/ai/ai.module';
import { HermesModule } from './modules/hermes/hermes.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BotsModule } from './modules/bots/bots.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RealtimeModule,
    NotificationsModule,
    AuthModule,
    WaModule,
    ConversationsModule,
    AiModule,
    HermesModule,
    KnowledgeModule,
    CustomersModule,
    BotsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

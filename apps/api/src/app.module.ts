import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
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
import { FollowUpsModule } from './modules/followups/followups.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
      }),
      inject: [ConfigService],
    }),
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
    FollowUpsModule,
    DashboardModule,
    AuditModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

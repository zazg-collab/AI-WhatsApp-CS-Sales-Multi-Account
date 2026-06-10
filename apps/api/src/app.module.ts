import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { RateLimitGuard } from './common/rate-limit.guard';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { SecurityHeadersMiddleware } from './common/security-headers.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
      }),
      inject: [ConfigService],
    }),
    // Lightweight queue used only by the health controller to ping Redis (M5).
    BullModule.registerQueue({ name: 'health' }),
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
    CampaignsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Cross-cutting production hardening: consistent errors, rate limits,
    // request tracing/logging. Feature modules stay focused on domain logic.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, SecurityHeadersMiddleware)
      .forRoutes('*');
  }
}

import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { WaModule } from './modules/wa/wa.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { AiModule } from './modules/ai/ai.module';
import { SentinelModule } from './modules/sentinel/sentinel.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { CustomersModule } from './modules/customers/customers.module';
import { BotsModule } from './modules/bots/bots.module';
import { FollowUpsModule } from './modules/followups/followups.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AuditModule } from './modules/audit/audit.module';
import { UsersModule } from './modules/users/users.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { QuickRepliesModule } from './modules/quick-replies/quick-replies.module';
import { SlaModule } from './modules/sla/sla.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SettingsModule } from './modules/settings/settings.module';
import { LearningModule } from './modules/learning/learning.module';
import { AssetsModule } from './modules/assets/assets.module';
import { ProductsModule } from './modules/products/products.module';
import { ShippingModule } from './modules/shipping/shipping.module'; // >>> ANGGA <<<
import { AgentModule } from './modules/agent/agent.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { MetricsModule } from './common/metrics/metrics.module';
import { ErrorReporterModule } from './common/error-reporter.service';
import { RateLimitGuard } from './common/rate-limit.guard';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { RequestLoggingInterceptor } from './common/request-logging.interceptor';
import { SecurityHeadersMiddleware } from './common/security-headers.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get('REDIS_URL') },
        // M5: bounded retries with backoff and automatic cleanup so a transient
        // failure is retried, a permanent one stops, and Redis doesn't grow
        // unbounded with finished jobs.
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      }),
      inject: [ConfigService],
    }),
    // Lightweight queue used only by the health controller to ping Redis (M5).
    BullModule.registerQueue({ name: 'health' }),
    // Cross-cutting observability: Prometheus /metrics + central error reporter.
    MetricsModule,
    ErrorReporterModule,
    PrismaModule,
    RealtimeModule,
    NotificationsModule,
    AuthModule,
    WaModule,
    ConversationsModule,
    AiModule,
    SentinelModule,
    KnowledgeModule,
    CustomersModule,
    BotsModule,
    FollowUpsModule,
    DashboardModule,
    AuditModule,
    UsersModule,
    CampaignsModule,
    QuickRepliesModule,
    SlaModule,
    WebhooksModule,
    SettingsModule,
    LearningModule,
    AssetsModule,
    ProductsModule,
    ShippingModule, // >>> ANGGA <<<
    AgentModule,
    AlertsModule,
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

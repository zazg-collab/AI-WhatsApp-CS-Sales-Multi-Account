import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertmanagerWebhookGuard } from '../../common/alertmanager-webhook.guard';

@Module({
  controllers: [AlertsController],
  providers: [AlertmanagerWebhookGuard],
})
export class AlertsModule {}

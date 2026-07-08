import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { AlertmanagerWebhookGuard } from '../../common/alertmanager-webhook.guard';
import { NotificationsService } from '../../notifications/notifications.service';

interface AlertmanagerAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface AlertmanagerWebhookPayload {
  status: 'firing' | 'resolved';
  alerts: AlertmanagerAlert[];
}

/**
 * Receives Alertmanager's webhook_configs POST and forwards a human-readable
 * summary through the existing outbound notification gateway (`hermes send`),
 * so alert *rules* (monitoring/alerts.yml) are not just configured but
 * actually delivered through the channel admins already watch.
 *
 * Internal/operational, not part of the product API — excluded from Swagger
 * and guarded by a dedicated shared secret distinct from AGENT_API_KEY.
 */
@ApiExcludeController()
@Controller('internal/alerts')
@UseGuards(AlertmanagerWebhookGuard)
export class AlertsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @HttpCode(204)
  async receive(@Body() payload: AlertmanagerWebhookPayload): Promise<void> {
    const alerts = payload?.alerts ?? [];
    if (alerts.length === 0) return;

    const lines = alerts.map((alert) => {
      const icon = alert.status === 'firing' ? '\u{1F6A8}' : '✅';
      const severity = alert.labels?.severity ?? 'unknown';
      const name = alert.labels?.alertname ?? 'UnknownAlert';
      const summary = alert.annotations?.summary ?? '';
      return `${icon} [${severity}] ${name} (${alert.status}) — ${summary}`;
    });

    await this.notifications.send(lines.join('\n'));
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export const WEBHOOK_EVENTS = [
  'lead.hot',
  'conversation.resolved',
  'conversation.auto_closed',
  'message.customer',
  'csat.received',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never returns the HMAC secret — it's write-only after creation. */
  list() {
    return this.prisma.webhookEndpoint.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    });
  }

  create(url: string, secret: string, events: string[]) {
    return this.prisma.webhookEndpoint.create({ data: { url, secret, events } });
  }

  update(id: string, data: { url?: string; secret?: string; events?: string[]; isActive?: boolean }) {
    return this.prisma.webhookEndpoint.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  /** Fire-and-forget delivery to all active endpoints subscribed to this event. */
  async deliver(event: WebhookEvent, payload: unknown): Promise<void> {
    const endpoints = await this.prisma.webhookEndpoint.findMany({
      where: { isActive: true, events: { has: event } },
    });
    if (!endpoints.length) return;

    const body = JSON.stringify({ event, payload, deliveredAt: new Date().toISOString() });

    await Promise.allSettled(
      endpoints.map(async (ep: { id: string; url: string; secret: string }) => {
        const sig = createHmac('sha256', ep.secret).update(body).digest('hex');
        try {
          const res = await fetch(ep.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Sentinel-Signature': `sha256=${sig}`, 'X-Sentinel-Event': event },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) this.logger.warn(`Webhook ${ep.id} → ${ep.url} returned ${res.status}`);
        } catch (err) {
          this.logger.warn(`Webhook ${ep.id} → ${ep.url} failed: ${err}`);
        }
      }),
    );
  }
}

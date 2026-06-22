import { Controller, ForbiddenException, Get, Header, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { Gauge } from 'prom-client';
import { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * GET /api/v1/metrics — Prometheus scrape endpoint.
 *
 * Auth: if METRICS_TOKEN is set, the scraper must send it as a Bearer token. If
 * unset, the endpoint is open and MUST be reachable only on an internal network
 * (bind/firewall accordingly) — it exposes operational internals, not secrets.
 *
 * Excluded from Swagger (operational, not part of the product API).
 */
@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  private readonly token = process.env.METRICS_TOKEN ?? '';

  // Pull-based gauges: their values are refreshed at scrape time below, so a
  // scrape always reflects live state (no drift from missed push events).
  private readonly waSessions: Gauge<'state'>;
  private readonly queueDepth: Gauge<'queue' | 'state'>;

  constructor(
    private readonly metrics: MetricsService,
    private readonly prisma: PrismaService,
    @InjectQueue('campaigns') private readonly campaignsQueue: Queue,
    @InjectQueue('health') private readonly healthQueue: Queue,
  ) {
    this.waSessions = new Gauge({
      name: 'wa_session_state',
      help: 'WhatsApp accounts by session status',
      labelNames: ['state'] as const,
      registers: [this.metrics.registry],
    });
    this.queueDepth = new Gauge({
      name: 'bullmq_jobs',
      help: 'BullMQ jobs by queue and state',
      labelNames: ['queue', 'state'] as const,
      registers: [this.metrics.registry],
    });
  }

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4')
  async scrape(@Req() req: Request): Promise<string> {
    if (this.token) {
      const auth = req.header('authorization') ?? '';
      if (auth !== `Bearer ${this.token}`) {
        throw new ForbiddenException('Invalid metrics token');
      }
    }
    await Promise.all([this.collectWaSessions(), this.collectQueues()]);
    return this.metrics.render();
  }

  private async collectWaSessions() {
    try {
      const rows = await this.prisma.whatsappAccount.groupBy({
        by: ['sessionStatus'],
        _count: { _all: true },
      });
      this.waSessions.reset();
      for (const r of rows) {
        this.waSessions.set({ state: String(r.sessionStatus) }, r._count._all);
      }
    } catch {
      // A metrics scrape must never throw — skip this gauge on DB trouble.
    }
  }

  private async collectQueues() {
    for (const queue of [this.campaignsQueue, this.healthQueue]) {
      try {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        for (const [state, value] of Object.entries(counts)) {
          this.queueDepth.set({ queue: queue.name, state }, value ?? 0);
        }
      } catch {
        // Skip this queue if Redis is unreachable.
      }
    }
  }
}

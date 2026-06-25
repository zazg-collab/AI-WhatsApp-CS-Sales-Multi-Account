import { Injectable } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Histogram,
} from 'prom-client';

/**
 * Central Prometheus registry + the app's core operational metrics.
 *
 * Pull-based gauges (WhatsApp session state, queue depth) are NOT defined here —
 * they're registered as scrape-time collectors by the modules that own the data
 * (see MetricsController), so a scrape reflects live state without us pushing on
 * every change. This service owns the always-incrementing counters/histograms.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15],
    registers: [this.registry],
  });

  readonly httpTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly aiRequests = new Counter({
    name: 'ai_requests_total',
    help: 'AI provider calls by outcome',
    labelNames: ['outcome'] as const, // success | error | fallback
    registers: [this.registry],
  });

  // Token usage per model — the only visibility into AI spend. prom-client
  // counters take floats, so multiply by your per-token rate in the dashboard
  // to get cost. kind = prompt | completion.
  readonly aiTokens = new Counter({
    name: 'ai_tokens_total',
    help: 'AI provider token usage by model and kind',
    labelNames: ['model', 'kind'] as const,
    registers: [this.registry],
  });

  // Measures the PRD §performance-targets "AI draft generation: < 10s" SLI.
  readonly aiRequestDuration = new Histogram({
    name: 'ai_request_duration_seconds',
    help: 'AI provider chat() call duration in seconds',
    buckets: [0.5, 1, 2, 5, 10, 15, 30],
    registers: [this.registry],
  });

  // Measures the PRD §performance-targets "Incoming message -> dashboard
  // display: < 2s" SLI — from inbound webhook receipt to the message:new
  // socket emit.
  readonly messageIngestDuration = new Histogram({
    name: 'message_ingest_duration_seconds',
    help: 'Time from inbound WhatsApp message receipt to dashboard socket emit',
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  readonly hermesReviews = new Counter({
    name: 'hermes_reviews_total',
    help: 'Hermes supervisor decisions',
    labelNames: ['decision'] as const,
    registers: [this.registry],
  });

  readonly waEvents = new Counter({
    name: 'wa_events_total',
    help: 'WhatsApp connection lifecycle events',
    labelNames: ['event'] as const, // connected | disconnected | reconnect | banned | logged_out
    registers: [this.registry],
  });

  // Self-monitoring for the outbound alert channel itself (NotificationsService)
  // — without this, a broken `hermes send` CLI fails silently and no alert can
  // ever reach anyone.
  readonly notificationSend = new Counter({
    name: 'hermes_notification_send_total',
    help: 'Outbound notification send attempts via the Hermes Agent gateway',
    labelNames: ['outcome'] as const, // success | error | timeout | unconfigured
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'hermes_' });
  }

  /** Render the full registry in Prometheus text exposition format. */
  async render(): Promise<string> {
    return this.registry.metrics();
  }
}

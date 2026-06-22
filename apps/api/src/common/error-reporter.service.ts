import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { createHash } from 'crypto';
import { currentContext } from './request-context';

interface SuppressionEntry {
  count: number;
  windowStartedAt: number;
}

// Bound the dedup map so a high-cardinality error storm (e.g. fingerprint
// includes an unexpectedly variable field) can't grow it unbounded.
const MAX_TRACKED_FINGERPRINTS = 1000;
const SUPPRESSION_WINDOW_MS = 5 * 60_000;

/**
 * Central error sink for failures that don't flow through the HTTP exception
 * filter — background jobs, WhatsApp reconnect failures, AI calls, queue
 * processors — plus the 5xx path.
 *
 * It always emits a single structured `error` log line (so it's searchable and
 * groupable in whatever log backend you ship to) — every call, never deduped.
 * If ERROR_WEBHOOK_URL is set, it additionally POSTs a compact JSON payload
 * (Sentry-store / Slack-incoming / any webhook) — fire-and-forget, never
 * throws into the caller, and no-ops when unconfigured. PII (message bodies,
 * phone numbers) is intentionally NOT forwarded; pass only ids in `context`.
 *
 * Webhook delivery is deduped by fingerprint (error name + message + route)
 * within a 5-minute window: the first occurrence posts immediately, repeats
 * within the window are counted but not re-posted, and the first occurrence
 * *after* the window expires posts again with `suppressedRepeats` carrying
 * how many were swallowed. This stops a single recurring bug from becoming
 * dozens of identical pages while still surfacing how bad it was.
 */
@Injectable()
export class ErrorReporterService {
  private readonly logger = new Logger('ErrorReporter');
  private readonly webhook = process.env.ERROR_WEBHOOK_URL ?? '';
  private readonly env = process.env.NODE_ENV ?? 'development';
  private readonly suppression = new Map<string, SuppressionEntry>();

  capture(error: unknown, context: Record<string, unknown> = {}): void {
    const { requestId, userId } = currentContext();
    const err = error instanceof Error ? error : new Error(String(error));
    const route = typeof context.route === 'string' ? context.route : undefined;
    const payload = {
      level: 'error' as const,
      env: this.env,
      name: err.name,
      message: err.message,
      stack: err.stack,
      requestId,
      userId,
      ...context,
    };

    // Always log (structured). This is the durable record, never deduped.
    this.logger.error(JSON.stringify(payload), err.stack);

    if (!this.webhook) return;

    const fingerprint = this.fingerprint(err.name, err.message, route);
    const decision = this.shouldSend(fingerprint);
    if (!decision.send) return;

    const webhookPayload = decision.suppressedCount
      ? { ...payload, suppressedRepeats: decision.suppressedCount }
      : payload;

    // Fire-and-forget; swallow all transport errors so reporting never cascades.
    void fetch(this.webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    }).catch(() => undefined);
  }

  private fingerprint(name: string, message: string, route?: string): string {
    return createHash('sha1').update(`${name}|${message}|${route ?? ''}`).digest('hex');
  }

  private shouldSend(fingerprint: string): { send: boolean; suppressedCount?: number } {
    const now = Date.now();
    const entry = this.suppression.get(fingerprint);

    if (!entry || now - entry.windowStartedAt > SUPPRESSION_WINDOW_MS) {
      if (this.suppression.size >= MAX_TRACKED_FINGERPRINTS) this.suppression.clear();
      const suppressedCount = entry?.count;
      this.suppression.set(fingerprint, { count: 0, windowStartedAt: now });
      return { send: true, suppressedCount };
    }

    entry.count += 1;
    return { send: false };
  }
}

@Global()
@Module({
  providers: [ErrorReporterService],
  exports: [ErrorReporterService],
})
export class ErrorReporterModule {}

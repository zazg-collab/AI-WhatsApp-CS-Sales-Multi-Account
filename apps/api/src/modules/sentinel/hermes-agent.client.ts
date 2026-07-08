import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client for the optional Python sidecar that wraps hermes-agent's AIAgent
 * (services/hermes-sidecar). Returns null whenever the sidecar is unset or
 * unreachable so callers can fall back to the plain model — supervision must
 * never hard-depend on hermes-agent being installed.
 */
@Injectable()
export class HermesAgentClient {
  private readonly logger = new Logger(HermesAgentClient.name);
  private readonly url: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.url = (config.get<string>('HERMES_SIDECAR_URL') ?? '').replace(
      /\/$/,
      '',
    );
    this.token = config.get<string>('HERMES_SIDECAR_TOKEN') ?? '';
    this.timeoutMs = Number(config.get<string>('AI_TIMEOUT_MS') ?? 30_000);
  }

  get enabled(): boolean {
    return Boolean(this.url);
  }

  async ask(
    question: string,
    context?: string,
    system?: string,
  ): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // C4: authenticate to the sidecar so /ask is not an open agent endpoint.
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const res = await fetch(`${this.url}/ask`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ question, context, system }),
        // H8: never let the supervisor hang on an unresponsive sidecar.
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        this.logger.warn(`sidecar /ask returned ${res.status}`);
        return null;
      }
      const body = (await res.json()) as { answer?: string };
      return body.answer ?? null;
    } catch (err) {
      this.logger.warn(`sidecar unreachable: ${err}`);
      return null;
    }
  }
}

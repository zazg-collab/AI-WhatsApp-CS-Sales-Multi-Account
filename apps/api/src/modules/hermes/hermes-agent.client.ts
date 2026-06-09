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

  constructor(config: ConfigService) {
    this.url = (config.get<string>('HERMES_SIDECAR_URL') ?? '').replace(
      /\/$/,
      '',
    );
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
      const res = await fetch(`${this.url}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context, system }),
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

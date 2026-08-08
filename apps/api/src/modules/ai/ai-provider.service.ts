import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { MetricsService } from '../../common/metrics/metrics.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for a JSON object response when supported. */
  json?: boolean;
  tools?: any[];
}

export interface ChatResponse {
  content: string;
  tool_calls?: any[];
}

/**
 * Thin client for any OpenAI-compatible chat API. Provider config (base URL,
 * API key, model, temperature, timeout) is resolved from SettingsService at
 * call time, so an admin can change it from the dashboard with no redeploy.
 * SettingsService layers DB overrides over the AI_* env defaults.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  // ponytail: one retry on transient failures (network / 5xx / 429); 4xx is a
  // bad request and never retried. Raise RETRIES if a flaky provider needs it.
  private static readonly RETRIES = 1;
  private static readonly RETRY_BACKOFF_MS = 300;

  constructor(
    private readonly settings: SettingsService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /** Public, non-secret config for the dashboard. */
  async getConfig() {
    const ai = await this.settings.ai();
    return { baseUrl: ai.baseUrl, defaultModel: ai.model };
  }

  async defaultModel(): Promise<string> {
    return (await this.settings.ai()).model;
  }

  /** Model for the Sentinel supervisor; falls back to the CS bot model. */
  async sentinelModel(): Promise<string> {
    const ai = await this.settings.ai();
    return ai.sentinelModel || ai.model;
  }

  private headers(apiKey: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    return h;
  }

  /** List model ids advertised by the configured base URL. */
  async listModels(): Promise<string[]> {
    const ai = await this.settings.ai();
    try {
      const res = await fetch(`${ai.baseUrl}/models`, {
        headers: this.headers(ai.apiKey),
        signal: AbortSignal.timeout(ai.timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`Provider returned ${res.status}`);
      }
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      return (body.data ?? []).map((m) => m.id).sort();
    } catch (err) {
      this.logger.error(`listModels failed: ${err}`);
      throw new ServiceUnavailableException(
        'Could not reach AI provider to list models',
      );
    }
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const res = await this.chatWithTools(messages, opts);
    return res.content;
  }

  async chatWithTools(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    const ai = await this.settings.ai();
    const payload: Record<string, unknown> = {
      model: opts.model ?? ai.model,
      messages,
      temperature: opts.temperature ?? ai.temperature,
    };
    if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
    if (opts.json) payload.response_format = { type: 'json_object' };
    if (opts.tools && opts.tools.length > 0) {
      payload.tools = opts.tools;
      payload.tool_choice = 'auto';
    }

    const model = String(payload.model);
    const total = AiProviderService.RETRIES + 1;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= total; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${ai.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.headers(ai.apiKey),
          body: JSON.stringify(payload),
          // H8: bound the wait so a hung provider can't stall auto-reply forever.
          signal: AbortSignal.timeout(ai.timeoutMs),
        });
      } catch (err) {
        // Network/timeout — transient, retry if attempts remain.
        lastErr = err;
        this.logger.warn(`chat request failed (attempt ${attempt}/${total}): ${err}`);
        if (attempt < total) {
          await this.backoff(attempt);
          continue;
        }
        throw new ServiceUnavailableException('Could not reach AI provider');
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Retry only transient server-side statuses; 4xx (except 429) is our bug.
        const transient = res.status >= 500 || res.status === 429;
        this.logger.error(`chat error ${res.status} (attempt ${attempt}/${total}): ${text}`);
        if (transient && attempt < total) {
          await this.backoff(attempt);
          continue;
        }
        throw new ServiceUnavailableException(`AI provider error (${res.status})`);
      }

      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string, tool_calls?: any[] } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      this.recordTokens(model, body.usage);
      const msg = body.choices?.[0]?.message;
      return {
        content: msg?.content?.trim() ?? '',
        tool_calls: msg?.tool_calls,
      };
    }
    // Unreachable (loop either returns or throws) — satisfy the type checker.
    throw new ServiceUnavailableException(`Could not reach AI provider: ${lastErr}`);
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((r) =>
      setTimeout(r, AiProviderService.RETRY_BACKOFF_MS * attempt),
    );
  }

  /** Emit token usage so spend is visible per model (no-op if unmeasured). */
  private recordTokens(
    model: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
  ): void {
    if (!usage || !this.metrics) return;
    if (usage.prompt_tokens) {
      this.metrics.aiTokens.inc({ model, kind: 'prompt' }, usage.prompt_tokens);
    }
    if (usage.completion_tokens) {
      this.metrics.aiTokens.inc({ model, kind: 'completion' }, usage.completion_tokens);
    }
  }
}

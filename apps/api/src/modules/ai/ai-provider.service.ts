import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for a JSON object response when supported. */
  json?: boolean;
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

  constructor(private readonly settings: SettingsService) {}

  /** Public, non-secret config for the dashboard. */
  async getConfig() {
    const ai = await this.settings.ai();
    return { baseUrl: ai.baseUrl, defaultModel: ai.model };
  }

  async defaultModel(): Promise<string> {
    return (await this.settings.ai()).model;
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
    const ai = await this.settings.ai();
    const payload: Record<string, unknown> = {
      model: opts.model ?? ai.model,
      messages,
      temperature: opts.temperature ?? ai.temperature,
    };
    if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
    if (opts.json) payload.response_format = { type: 'json_object' };

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
      this.logger.error(`chat request failed: ${err}`);
      throw new ServiceUnavailableException('Could not reach AI provider');
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`chat error ${res.status}: ${text}`);
      throw new ServiceUnavailableException(
        `AI provider error (${res.status})`,
      );
    }

    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content?.trim() ?? '';
  }
}

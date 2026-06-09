import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
 * Thin client for any OpenAI-compatible chat API. The provider is selected
 * purely via env (AI_BASE_URL / AI_API_KEY / AI_MODEL), so the same code
 * targets OpenAI, OpenRouter, Ollama, LM Studio, vLLM, etc.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('AI_BASE_URL') ?? 'https://api.openai.com/v1'
    ).replace(/\/$/, '');
    this.apiKey = config.get<string>('AI_API_KEY') ?? '';
    this.defaultModel = config.get<string>('AI_MODEL') ?? 'gpt-4o-mini';
  }

  get model(): string {
    return this.defaultModel;
  }

  getConfig() {
    return { baseUrl: this.baseUrl, defaultModel: this.defaultModel };
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h.Authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  /** List model ids advertised by the configured base URL. */
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: this.headers(),
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
    const payload: Record<string, unknown> = {
      model: opts.model ?? this.defaultModel,
      messages,
      temperature: opts.temperature ?? 0.6,
    };
    if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
    if (opts.json) payload.response_format = { type: 'json_object' };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(payload),
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

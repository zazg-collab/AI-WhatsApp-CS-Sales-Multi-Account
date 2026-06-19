import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

/** Max texts per `/embeddings` request — keeps payloads small and within
 *  provider batch limits. */
const EMBED_BATCH_SIZE = 64;

/**
 * Thin client for an OpenAI-compatible `/embeddings` endpoint. Reuses the same
 * provider config (base URL + API key) as the chat client; the embedding model
 * and dimension are separate settings. When no embedding model is configured
 * the service reports `enabled() === false` and callers fall back to keyword
 * retrieval — so RAG is purely opt-in via the AI_EMBED_MODEL env.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private readonly settings: SettingsService) {}

  /** True when an embedding model is configured. */
  async enabled(): Promise<boolean> {
    return !!(await this.settings.ai()).embedModel;
  }

  async dimension(): Promise<number> {
    return (await this.settings.ai()).embedDim;
  }

  /** Configured embedding model name (empty when disabled). */
  async modelName(): Promise<string> {
    return (await this.settings.ai()).embedModel;
  }

  /**
   * Embed one or more texts. Returns one vector per input, in order. Throws on
   * provider failure so write-path callers can decide to swallow it (indexing
   * is best-effort) while the read path can fall back to keyword search.
   */
  async embed(texts: string[]): Promise<number[][]> {
    const ai = await this.settings.ai();
    if (!ai.embedModel) {
      throw new Error('No embedding model configured');
    }
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE).map((t) => t.slice(0, 8000));
      const vectors = await this.embedBatch(ai.baseUrl, ai.apiKey, ai.embedModel, ai.timeoutMs, batch);
      out.push(...vectors);
    }
    return out;
  }

  /** Embed a single text; convenience wrapper around {@link embed}. */
  async embedOne(text: string): Promise<number[]> {
    const [vec] = await this.embed([text]);
    return vec;
  }

  private async embedBatch(
    baseUrl: string,
    apiKey: string,
    model: string,
    timeoutMs: number,
    input: string[],
  ): Promise<number[][]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model, input }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      this.logger.error(`embeddings request failed: ${err}`);
      throw new Error('Could not reach embedding provider');
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`embeddings error ${res.status}: ${text}`);
      throw new Error(`Embedding provider error (${res.status})`);
    }
    const body = (await res.json()) as {
      data?: Array<{ embedding: number[]; index: number }>;
    };
    // Sort by index defensively — spec guarantees order but be safe.
    return (body.data ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}

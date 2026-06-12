import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

interface CacheEntry {
  answer: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 500;

/**
 * Conservative in-memory response cache for the AI engine. Keyed by a hash of
 * (botId + normalized question). Intended only for short, generic questions
 * where customer-specific memory would not change the answer. No Redis
 * dependency — a plain Map with insertion-ordered eviction (oldest first).
 */
@Injectable()
export class AiCacheService {
  private readonly store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  /** Normalize question text: lowercase, trim, collapse ws, strip trailing punctuation. */
  private normalize(question: string): string {
    return (question ?? '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.!?,;:]+$/, '')
      .trim();
  }

  private key(botId: string, question: string): string {
    return createHash('sha256')
      .update(`${botId}::${this.normalize(question)}`)
      .digest('hex');
  }

  get(botId: string, question: string): string | null {
    const key = this.key(botId, question);
    const entry = this.store.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      this.misses++;
      return null;
    }
    // Refresh recency for LRU-ish behavior.
    this.store.delete(key);
    this.store.set(key, entry);
    this.hits++;
    return entry.answer;
  }

  set(botId: string, question: string, answer: string, ttlMs = DEFAULT_TTL_MS): void {
    const key = this.key(botId, question);
    this.store.delete(key);
    this.store.set(key, { answer, expiresAt: Date.now() + ttlMs });
    while (this.store.size > MAX_ENTRIES) {
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
    }
  }

  stats(): { size: number; hits: number; misses: number; hitRate: number } {
    const total = this.hits + this.misses;
    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }

  clear(): void {
    this.store.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

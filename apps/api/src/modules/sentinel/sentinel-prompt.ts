import { createHash } from 'node:crypto';
import { t, SENTINEL_SYSTEM as SENTINEL_SYSTEM_DICT } from '../../i18n/bot-prompts';

/** Sentinel supervisor system prompt for a given bot language (default: 'id'). */
export function sentinelSystemPrompt(lang = 'id'): string {
  return t(SENTINEL_SYSTEM_DICT, lang);
}

/** Kept for backward-compat with any direct import of the old constant. */
export const SENTINEL_SYSTEM = t(SENTINEL_SYSTEM_DICT, 'id');

/**
 * Self-versioning prompt id: a short hash of the full prompt dictionary (all
 * languages). Any edit to the Sentinel system prompt changes this automatically —
 * no manual version bump to forget. Stored on each SentinelReview (audit #5).
 */
export const SENTINEL_PROMPT_VERSION: string = createHash('sha256')
  .update(JSON.stringify(SENTINEL_SYSTEM_DICT))
  .digest('hex')
  .slice(0, 12);

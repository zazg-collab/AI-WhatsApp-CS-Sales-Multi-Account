import { createHash } from 'node:crypto';
import { t, HERMES_SYSTEM as HERMES_SYSTEM_DICT } from '../../i18n/bot-prompts';

/** Hermes supervisor system prompt for a given bot language (default: 'id'). */
export function hermesSystemPrompt(lang = 'id'): string {
  return t(HERMES_SYSTEM_DICT, lang);
}

/** Kept for backward-compat with any direct import of the old constant. */
export const HERMES_SYSTEM = t(HERMES_SYSTEM_DICT, 'id');

/**
 * Self-versioning prompt id: a short hash of the full prompt dictionary (all
 * languages). Any edit to the Hermes system prompt changes this automatically —
 * no manual version bump to forget. Stored on each HermesReview (audit #5).
 */
export const HERMES_PROMPT_VERSION: string = createHash('sha256')
  .update(JSON.stringify(HERMES_SYSTEM_DICT))
  .digest('hex')
  .slice(0, 12);

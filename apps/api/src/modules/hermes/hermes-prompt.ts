import { t, HERMES_SYSTEM as HERMES_SYSTEM_DICT } from '../../i18n/bot-prompts';

/** Hermes supervisor system prompt for a given bot language (default: 'id'). */
export function hermesSystemPrompt(lang = 'id'): string {
  return t(HERMES_SYSTEM_DICT, lang);
}

/** Kept for backward-compat with any direct import of the old constant. */
export const HERMES_SYSTEM = t(HERMES_SYSTEM_DICT, 'id');

/**
 * Minimal className joiner — drops falsy values and collapses whitespace.
 * No external deps; keeps the UI kit self-contained.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

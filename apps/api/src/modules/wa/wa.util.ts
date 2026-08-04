/**
 * Normalize a user-entered phone number to WhatsApp's MSISDN form (digits only,
 * Indonesian leading `0` rewritten to country code `62`). Single source of truth
 * — call sites must not re-implement the `0 → 62` rule inline.
 */
export function normalizePhone(input: string): string {
  let digits = input.replace(/[^\d]/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  return digits;
}

/** Convert a phone number (digits only) to a Baileys direct-chat JID. */
export function phoneToJid(phone: string): string {
  if (phone.includes('@')) return phone;
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

/** Extract the bare phone number from a WhatsApp JID. */
export function jidToPhone(jid: string): string {
  if (jid.endsWith('@lid')) return jid;
  return jid.split('@')[0].split(':')[0];
}

/**
 * >>> ANGGA: buang akhiran perangkat dari sebuah JID —
 * `6285722193049:0@s.whatsapp.net` → `6285722193049@s.whatsapp.net`,
 * `27608184053792:14@lid` → `27608184053792@lid`.
 *
 * Baileys multi-device menempelkan nomor perangkat di banyak tempat (kontak
 * riwayat, `getPNForLID`, event pemetaan LID). Aturan ini dulu ditulis ulang
 * sebagai regex inline di dua tempat berbeda di contact-sync; sekarang satu.
 */
export function bareJid(jid: string): string {
  return jid.replace(/^([^:@]+):\d+(@\S+)$/, '$1$2');
}

export function isDirectChatJid(jid: string): boolean {
  // @c.us is WAHA's standard; @s.whatsapp.net appears in some engines' internal
  // fields; @lid is the privacy identifier — accept all on input. Require at
  // least one digit before the suffix: malformed jids like bare "@c.us" (no
  // number part, seen from some WAHA chat-overview entries) must NOT pass —
  // they produce an empty phoneNumber, a phantom customer, and a broken
  // chatId on send.
  return /^\d+@(c\.us|s\.whatsapp\.net|lid)$/.test(jid);
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

export function isSupportedChatJid(jid: string): boolean {
  return isDirectChatJid(jid) || isGroupJid(jid);
}

import { optOutKeywordsFor } from '../../i18n/bot-prompts';

/** Keywords (case-insensitive) that signal a customer wants to opt out.
 *  Pass the bot's language to check language-appropriate phrases; always
 *  includes the universal 'stop' keyword.
 */
export function isOptOutMessage(text?: string | null, lang = 'id'): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  const keywords = optOutKeywordsFor(lang);
  return keywords.some((keyword) => {
    if (keyword.includes(' ')) return normalized.includes(keyword);
    return new RegExp(`\\b${keyword}\\b`).test(normalized);
  });
}

/** Default polite name placeholder when customer name is unknown. */
const DEFAULT_NAMES: Record<string, string> = {
  id: 'Kak',
  en: 'there',
  es: 'estimado/a',
  pt: 'prezado/a',
  ar: '',
  ms: 'Kak',
};

export function renderTemplate(
  template: string,
  vars: { name?: string | null; phone?: string | null },
  lang = 'id',
): string {
  const defaultName = DEFAULT_NAMES[lang] ?? '';
  const name = vars.name?.trim() || defaultName;
  const phone = vars.phone?.trim() || '';
  return template
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/\{\{\s*phone\s*\}\}/gi, phone);
}

/** Human-like delay to reduce ban risk (PRD 22.1 mitigation). */
export function humanDelay(min = 600, max = 1800): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
};

export function extForMimetype(mime?: string | null): string {
  if (!mime) return 'bin';
  const clean = mime.split(';')[0].trim().toLowerCase();
  return MIME_EXT[clean] ?? 'bin';
}

export function typingDelay(
  text: string,
  perChar = 50,
  min = 800,
  max = 6000,
): Promise<void> {
  const raw = (text?.length ?? 0) * perChar;
  const ms = Math.min(Math.max(raw, min), max);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffDelay(
  attempt: number,
  base = 2000,
  max = 60000,
): number {
  const exp = Math.min(base * Math.pow(2, attempt), max);
  const jitter = 1 + (Math.random() * 0.4 - 0.2); // ±20%
  return Math.round(exp * jitter);
}

/** Convert a phone number (digits only) to a WhatsApp JID. */
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

export function isDirectChatJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith('@g.us');
}

export function isSupportedChatJid(jid: string): boolean {
  return isDirectChatJid(jid) || isGroupJid(jid);
}

/** Keywords (case-insensitive) that signal a customer wants to opt out. */
const OPT_OUT_KEYWORDS = ['stop', 'berhenti', 'unsubscribe', 'cancel langganan', 'jangan kirim'];

export function isOptOutMessage(text?: string | null): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase();
  return OPT_OUT_KEYWORDS.some((keyword) => {
    if (keyword.includes(' ')) return normalized.includes(keyword);
    return new RegExp(`\\b${keyword}\\b`).test(normalized);
  });
}

export function renderTemplate(
  template: string,
  vars: { name?: string | null; phone?: string | null },
): string {
  const name = vars.name?.trim() || 'Kak';
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

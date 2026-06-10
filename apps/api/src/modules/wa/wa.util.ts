/** Convert a phone number (digits only) to a WhatsApp JID. */
export function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

/** Extract the bare phone number from a WhatsApp JID. */
export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

/**
 * True only for 1-on-1 customer chats (M1). Groups (@g.us), broadcast lists
 * (@broadcast), newsletters/channels (@newsletter) must never be ingested:
 * they would create bogus "customers" from group ids and let the bot
 * auto-reply into group chats.
 */
export function isDirectChatJid(jid: string): boolean {
  return jid.endsWith('@s.whatsapp.net');
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

/**
 * File extension for a WhatsApp media mimetype. Unknown types fall back to
 * `bin` so the file is still stored but never executed/rendered as something
 * it is not.
 */
export function extForMimetype(mime?: string | null): string {
  if (!mime) return 'bin';
  const clean = mime.split(';')[0].trim().toLowerCase();
  return MIME_EXT[clean] ?? 'bin';
}

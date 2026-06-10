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

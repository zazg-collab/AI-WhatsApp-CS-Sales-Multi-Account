// Helpers for presenting WhatsApp contact identifiers in the UI.
//
// Newer WhatsApp addresses some chats by an "@lid" privacy identifier instead
// of a phone number. When the backend has not yet resolved it to a real number
// (e.g. older contacts synced before resolution existed), we must avoid showing
// the raw "226293320839404@lid" string as if it were a phone number.

/** True when the value is an unresolved WhatsApp @lid privacy identifier. */
export function isLid(value: string | null | undefined): boolean {
  return !!value && value.endsWith('@lid');
}

/**
 * Format a stored phoneNumber for display. Real numbers pass through; an
 * unresolved @lid becomes a neutral, honest placeholder instead of a fake
 * number. Pass a locale-specific `hiddenLabel` for the placeholder.
 */
export function formatPhone(
  phoneNumber: string | null | undefined,
  hiddenLabel = 'Nomor tersembunyi',
): string {
  if (!phoneNumber) return '';
  if (isLid(phoneNumber)) return hiddenLabel;
  return phoneNumber;
}

/**
 * Best display name for a contact: their saved name, else a real phone number,
 * else the neutral hidden-number placeholder — never the raw @lid string.
 */
export function contactDisplayName(
  name: string | null | undefined,
  phoneNumber: string | null | undefined,
  hiddenLabel = 'Kontak WhatsApp',
): string {
  if (name?.trim()) return name.trim();
  if (phoneNumber && !isLid(phoneNumber)) return phoneNumber;
  return hiddenLabel;
}

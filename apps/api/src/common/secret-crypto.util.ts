import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Encrypt sensitive config (external DB connection strings, Google service
 * account private keys) at rest with AES-256-GCM. The key is derived from the
 * SECRET_ENCRYPTION_KEY env var (any length — hashed to 32 bytes).
 *
 * Backward/dev compatible: if the key is not configured, values pass through
 * as plaintext (with the caller free to warn). Encrypted values carry an
 * `enc:v1:` prefix so decrypt can tell them apart from legacy plaintext rows.
 */
const PREFIX = 'enc:v1:';
const ALGO = 'aes-256-gcm';

function key(): Buffer | null {
  const raw = process.env.SECRET_ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash('sha256').update(raw).digest(); // 32 bytes
}

export function encryptionEnabled(): boolean {
  return Boolean(process.env.SECRET_ENCRYPTION_KEY);
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

/** Encrypt a string. Returns plaintext unchanged when no key is configured. */
export function encryptSecret(plain: string): string {
  const k = key();
  if (!k || plain == null) return plain;
  if (isEncrypted(plain)) return plain; // already encrypted
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, k, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

/** Decrypt a value. Plaintext (no prefix) is returned as-is for legacy rows. */
export function decryptSecret(value: string): string {
  if (!isEncrypted(value)) return value;
  const k = key();
  if (!k) throw new Error('SECRET_ENCRYPTION_KEY tidak diset, tapi nilai terenkripsi');
  const parts = value.slice(PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Format secret terenkripsi tidak valid');
  const [ivB, tagB, dataB] = parts;
  const decipher = createDecipheriv(ALGO, k, Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

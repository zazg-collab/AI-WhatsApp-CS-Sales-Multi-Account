import { encryptSecret, decryptSecret, isEncrypted, encryptionEnabled } from './secret-crypto.util';

describe('secret-crypto.util', () => {
  const KEY = 'test-key-please-rotate';

  describe('with SECRET_ENCRYPTION_KEY set', () => {
    const prev = process.env.SECRET_ENCRYPTION_KEY;
    beforeAll(() => { process.env.SECRET_ENCRYPTION_KEY = KEY; });
    afterAll(() => { process.env.SECRET_ENCRYPTION_KEY = prev; });

    it('round-trips a secret', () => {
      const secret = 'postgresql://u:p@host:5432/db';
      const enc = encryptSecret(secret);
      expect(enc).not.toBe(secret);
      expect(isEncrypted(enc)).toBe(true);
      expect(decryptSecret(enc)).toBe(secret);
    });

    it('encryptionEnabled reports true', () => {
      expect(encryptionEnabled()).toBe(true);
    });

    it('does not double-encrypt', () => {
      const once = encryptSecret('x');
      expect(encryptSecret(once)).toBe(once);
    });

    it('different ciphertext each time (random IV)', () => {
      expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
    });

    it('fails on tampered ciphertext (GCM auth)', () => {
      const enc = encryptSecret('secret');
      const tampered = enc.slice(0, -4) + 'AAAA';
      expect(() => decryptSecret(tampered)).toThrow();
    });

    it('passes through legacy plaintext on decrypt', () => {
      expect(decryptSecret('plain-legacy-value')).toBe('plain-legacy-value');
    });
  });

  describe('without SECRET_ENCRYPTION_KEY', () => {
    const prev = process.env.SECRET_ENCRYPTION_KEY;
    beforeAll(() => { delete process.env.SECRET_ENCRYPTION_KEY; });
    afterAll(() => { if (prev !== undefined) process.env.SECRET_ENCRYPTION_KEY = prev; });

    it('passes through plaintext (dev) and reports disabled', () => {
      expect(encryptSecret('plain')).toBe('plain');
      expect(encryptionEnabled()).toBe(false);
    });
  });
});

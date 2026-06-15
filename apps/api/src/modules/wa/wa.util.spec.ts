import { phoneToJid, jidToPhone, humanDelay, isDirectChatJid, isGroupJid, isSupportedChatJid, extForMimetype, typingDelay, backoffDelay, isOptOutMessage, renderTemplate } from './wa.util';

describe('wa.util', () => {
  describe('phoneToJid', () => {
    it('strips non-digits and appends suffix', () => {
      expect(phoneToJid('+62 812-3456-7890')).toBe('6281234567890@s.whatsapp.net');
    });
    it('handles already-clean digits', () => {
      expect(phoneToJid('6281234567890')).toBe('6281234567890@s.whatsapp.net');
    });
    it('preserves an already-normalized JID', () => {
      expect(phoneToJid('123456789012345@lid')).toBe('123456789012345@lid');
    });
  });

  describe('jidToPhone', () => {
    it('extracts bare number from jid', () => {
      expect(jidToPhone('6281234567890@s.whatsapp.net')).toBe('6281234567890');
    });
    it('strips device suffix', () => {
      expect(jidToPhone('6281234567890:12@s.whatsapp.net')).toBe('6281234567890');
    });
    it('preserves LID JIDs because they are not phone numbers', () => {
      expect(jidToPhone('123456789012345@lid')).toBe('123456789012345@lid');
    });
  });

  describe('isDirectChatJid', () => {
    it('accepts 1-on-1 chats', () => {
      expect(isDirectChatJid('6281234567890@s.whatsapp.net')).toBe(true);
    });
    it('accepts WhatsApp LID 1-on-1 chats from multi-device sync', () => {
      expect(isDirectChatJid('123456789012345@lid')).toBe(true);
    });
    it('rejects groups, broadcasts, newsletters (M1)', () => {
      expect(isDirectChatJid('123456-789@g.us')).toBe(false);
      expect(isDirectChatJid('status@broadcast')).toBe(false);
      expect(isDirectChatJid('999@broadcast')).toBe(false);
      expect(isDirectChatJid('abc@newsletter')).toBe(false);
    });
  });

  describe('group/support jid helpers', () => {
    it('detects WhatsApp groups separately from direct chats', () => {
      expect(isGroupJid('123456-789@g.us')).toBe(true);
      expect(isGroupJid('6281234567890@s.whatsapp.net')).toBe(false);
    });
    it('accepts direct and group chats for mirror sync', () => {
      expect(isSupportedChatJid('6281234567890@s.whatsapp.net')).toBe(true);
      expect(isSupportedChatJid('123456789012345@lid')).toBe(true);
      expect(isSupportedChatJid('123456-789@g.us')).toBe(true);
      expect(isSupportedChatJid('status@broadcast')).toBe(false);
    });
  });

  describe('extForMimetype', () => {
    it('maps common WhatsApp mimetypes', () => {
      expect(extForMimetype('image/jpeg')).toBe('jpg');
      expect(extForMimetype('video/mp4')).toBe('mp4');
      expect(extForMimetype('application/pdf')).toBe('pdf');
    });
    it('strips codec parameters (voice notes)', () => {
      expect(extForMimetype('audio/ogg; codecs=opus')).toBe('ogg');
    });
    it('falls back to bin for unknown/missing types', () => {
      expect(extForMimetype('application/x-evil')).toBe('bin');
      expect(extForMimetype(undefined)).toBe('bin');
      expect(extForMimetype(null)).toBe('bin');
    });
  });

  describe('humanDelay', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('resolves after a delay within range', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const p = humanDelay(600, 1800);
      jest.runAllTimers();
      await expect(p).resolves.toBeUndefined();
    });

    it('uses min/max bounds', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const p = humanDelay(100, 200);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      jest.runAllTimers();
      await p;
    });
  });

  describe('typingDelay', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('is proportional to message length (~50ms/char)', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      typingDelay('a'.repeat(40)); // 40 * 50 = 2000ms, within bounds
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    });

    it('clamps to the minimum for short messages', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      typingDelay('hi'); // 2 * 50 = 100ms → clamped to 800
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 800);
    });

    it('clamps to the maximum for long messages', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      typingDelay('x'.repeat(1000)); // 50000ms → clamped to 6000
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 6000);
    });

    it('handles empty/undefined text via the minimum', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      typingDelay('');
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 800);
    });
  });

  describe('isOptOutMessage', () => {
    it('detects single-word keywords case-insensitively', () => {
      expect(isOptOutMessage('STOP')).toBe(true);
      expect(isOptOutMessage('tolong berhenti ya')).toBe(true);
      expect(isOptOutMessage('please Unsubscribe')).toBe(true);
    });
    it('detects multi-word phrases', () => {
      expect(isOptOutMessage('saya mau cancel langganan')).toBe(true);
      expect(isOptOutMessage('jangan kirim lagi pesan ini')).toBe(true);
    });
    it('does not match substrings of larger words', () => {
      expect(isOptOutMessage('nonstop service')).toBe(false);
    });
    it('returns false for empty/undefined and unrelated text', () => {
      expect(isOptOutMessage('')).toBe(false);
      expect(isOptOutMessage(undefined)).toBe(false);
      expect(isOptOutMessage('halo kak mau tanya harga')).toBe(false);
    });
  });

  describe('renderTemplate', () => {
    it('replaces name and phone tokens', () => {
      expect(renderTemplate('Halo {{name}}, no {{phone}}', { name: 'Budi', phone: '628' }))
        .toBe('Halo Budi, no 628');
    });
    it('falls back to Kak when name is missing', () => {
      expect(renderTemplate('Halo {{name}}', { name: null, phone: '628' })).toBe('Halo Kak');
      expect(renderTemplate('Halo {{name}}', { name: '  ', phone: '628' })).toBe('Halo Kak');
    });
    it('passes through templates without tokens', () => {
      expect(renderTemplate('Promo spesial!', { name: 'A', phone: '1' })).toBe('Promo spesial!');
    });
    it('handles whitespace and casing inside tokens', () => {
      expect(renderTemplate('Hi {{ NAME }}', { name: 'Z' })).toBe('Hi Z');
    });
  });

  describe('backoffDelay', () => {
    afterEach(() => jest.restoreAllMocks());

    it('grows exponentially from the base', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5); // jitter factor = 1.0
      expect(backoffDelay(0)).toBe(2000);
      expect(backoffDelay(1)).toBe(4000);
      expect(backoffDelay(2)).toBe(8000);
    });

    it('caps at the maximum', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      expect(backoffDelay(20)).toBe(60000);
    });

    it('applies jitter within ±20%', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0); // jitter factor = 0.8
      expect(backoffDelay(1)).toBe(3200); // 4000 * 0.8
      jest.spyOn(Math, 'random').mockReturnValue(1); // jitter factor ≈ 1.2
      expect(backoffDelay(1)).toBe(4800); // 4000 * 1.2
    });
  });
});

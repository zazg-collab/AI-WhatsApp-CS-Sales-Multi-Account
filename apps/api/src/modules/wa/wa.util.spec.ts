import { phoneToJid, jidToPhone, humanDelay, isDirectChatJid, extForMimetype } from './wa.util';

describe('wa.util', () => {
  describe('phoneToJid', () => {
    it('strips non-digits and appends suffix', () => {
      expect(phoneToJid('+62 812-3456-7890')).toBe('6281234567890@s.whatsapp.net');
    });
    it('handles already-clean digits', () => {
      expect(phoneToJid('6281234567890')).toBe('6281234567890@s.whatsapp.net');
    });
  });

  describe('jidToPhone', () => {
    it('extracts bare number from jid', () => {
      expect(jidToPhone('6281234567890@s.whatsapp.net')).toBe('6281234567890');
    });
    it('strips device suffix', () => {
      expect(jidToPhone('6281234567890:12@s.whatsapp.net')).toBe('6281234567890');
    });
  });

  describe('isDirectChatJid', () => {
    it('accepts 1-on-1 chats', () => {
      expect(isDirectChatJid('6281234567890@s.whatsapp.net')).toBe(true);
    });
    it('rejects groups, broadcasts, newsletters (M1)', () => {
      expect(isDirectChatJid('123456-789@g.us')).toBe(false);
      expect(isDirectChatJid('status@broadcast')).toBe(false);
      expect(isDirectChatJid('999@broadcast')).toBe(false);
      expect(isDirectChatJid('abc@newsletter')).toBe(false);
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
});

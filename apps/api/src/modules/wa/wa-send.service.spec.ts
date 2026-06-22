import { WaSendService } from './wa-send.service';

describe('WaSendService', () => {
  function make() {
    const store: any = { sendTimestamps: new Map<string, number[]>(), get: jest.fn() };
    const settings: any = { wa: jest.fn().mockResolvedValue({ humanDelayMinMs: 0, humanDelayMaxMs: 0, typingPerCharMs: 0, typingMinMs: 0, typingMaxMs: 0 }) };
    const svc = new WaSendService(store, settings);
    return { svc, store, settings };
  }

  // H5 regression — a reaction's key.fromMe must match the target message's
  // authorship, else WhatsApp can't resolve the key and it silently no-ops.
  describe('sendReaction fromMe', () => {
    it('defaults fromMe to false (reacting to a customer message)', async () => {
      const { svc, store } = make();
      const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'x' } }) };
      store.get.mockReturnValue({ sock });

      await svc.sendReaction('a1', '628', 'EXT', '👍');

      expect(sock.sendMessage).toHaveBeenCalledWith('628@s.whatsapp.net', {
        react: { text: '👍', key: { remoteJid: '628@s.whatsapp.net', id: 'EXT', fromMe: false } },
      });
    });

    it('passes fromMe:true when reacting to our own message', async () => {
      const { svc, store } = make();
      const sock = { sendMessage: jest.fn().mockResolvedValue({ key: { id: 'x' } }) };
      store.get.mockReturnValue({ sock });

      await svc.sendReaction('a1', '628', 'EXT', '👍', true);

      expect(sock.sendMessage).toHaveBeenCalledWith('628@s.whatsapp.net', {
        react: { text: '👍', key: { remoteJid: '628@s.whatsapp.net', id: 'EXT', fromMe: true } },
      });
    });
  });

  // H4 regression — concurrent sends must reserve rate-limit slots serially, so
  // they can't all read a sub-limit count and burst past MAX_SENDS_PER_MINUTE.
  describe('throttleSend concurrency (rate limit)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('records every slot under the limit without lost writes', async () => {
      const { svc, store } = make();
      await Promise.all(Array.from({ length: 20 }, () => (svc as any).throttleSend('a1')));
      expect(store.sendTimestamps.get('a1')).toHaveLength(20);
    });

    it('blocks the 21st concurrent send instead of bursting past the cap', async () => {
      const { svc, store } = make();
      await Promise.all(Array.from({ length: 20 }, () => (svc as any).throttleSend('a1')));
      expect(store.sendTimestamps.get('a1')).toHaveLength(20);

      // The 21st must wait for an older stamp to age out — it must NOT push a
      // 21st timestamp into the same window.
      const pending = (svc as any).throttleSend('a1');
      await Promise.resolve();
      await Promise.resolve();
      expect(store.sendTimestamps.get('a1')).toHaveLength(20);

      // Once the window rolls forward the original 20 expire and the blocked send
      // proceeds — leaving exactly one fresh stamp, never 21.
      jest.advanceTimersByTime(60_000);
      await pending;
      expect(store.sendTimestamps.get('a1')).toHaveLength(1);
    });
  });
});

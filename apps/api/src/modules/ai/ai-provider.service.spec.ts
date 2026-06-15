import { ServiceUnavailableException } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';

function makeService(env: Record<string, string> = {}) {
  const ai = {
    baseUrl: (env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    apiKey: env.AI_API_KEY ?? '',
    model: env.AI_MODEL ?? 'gpt-4o-mini',
    temperature: env.AI_TEMPERATURE ? Number(env.AI_TEMPERATURE) : 0.6,
    timeoutMs: env.AI_TIMEOUT_MS ? Number(env.AI_TIMEOUT_MS) : 30_000,
  };
  const settings = { ai: async () => ai } as any;
  return new AiProviderService(settings);
}

describe('AiProviderService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('getConfig + defaultModel return defaults', async () => {
    const s = makeService();
    expect(await s.getConfig()).toEqual({
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o-mini',
    });
    expect(await s.defaultModel()).toBe('gpt-4o-mini');
  });

  it('strips trailing slash from base url', async () => {
    const s = makeService({ AI_BASE_URL: 'http://x/v1/' });
    expect((await s.getConfig()).baseUrl).toBe('http://x/v1');
  });

  describe('listModels', () => {
    it('returns sorted model ids', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ id: 'zeta' }, { id: 'alpha' }] }),
      }) as any;
      const s = makeService();
      expect(await s.listModels()).toEqual(['alpha', 'zeta']);
    });
    it('throws ServiceUnavailable on non-ok', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
      await expect(makeService().listModels()).rejects.toThrow(ServiceUnavailableException);
    });
    it('throws ServiceUnavailable on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('net')) as any;
      await expect(makeService().listModels()).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('chat', () => {
    it('returns assistant content', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ choices: [{ message: { content: '  hi  ' } }] }),
      }) as any;
      const s = makeService({ AI_API_KEY: 'k' });
      expect(await s.chat([{ role: 'user', content: 'hello' }], { json: true, maxTokens: 10 })).toBe('hi');
    });
    it('returns empty string when no choices', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as any;
      expect(await makeService().chat([])).toBe('');
    });
    it('throws on non-ok response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false, status: 429, text: async () => 'rate',
      }) as any;
      await expect(makeService().chat([])).rejects.toThrow(ServiceUnavailableException);
    });
    it('throws on network failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('down')) as any;
      await expect(makeService().chat([])).rejects.toThrow(ServiceUnavailableException);
    });
  });
});

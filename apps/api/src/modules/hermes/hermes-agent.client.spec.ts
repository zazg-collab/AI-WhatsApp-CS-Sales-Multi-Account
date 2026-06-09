import { HermesAgentClient } from './hermes-agent.client';

function make(url?: string) {
  return new HermesAgentClient({ get: () => url } as any);
}

describe('HermesAgentClient', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('disabled when no url', async () => {
    const c = make();
    expect(c.enabled).toBe(false);
    expect(await c.ask('q')).toBeNull();
  });

  it('returns answer on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'hi' }),
    }) as any;
    const c = make('http://side/');
    expect(c.enabled).toBe(true);
    expect(await c.ask('q', 'ctx', 'sys')).toBe('hi');
  });

  it('returns null on non-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;
    expect(await make('http://side').ask('q')).toBeNull();
  });

  it('returns null on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('x')) as any;
    expect(await make('http://side').ask('q')).toBeNull();
  });
});

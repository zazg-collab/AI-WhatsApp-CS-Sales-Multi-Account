import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api, getToken, setToken, clearToken } from './api';

describe('token helpers', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns null when no token set', () => {
    expect(getToken()).toBeNull();
  });

  it('sets, gets and clears token', () => {
    setToken('abc');
    expect(getToken()).toBe('abc');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('api()', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('builds the full URL and returns parsed json', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ hello: 'world' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api<{ hello: string }>('/ping');
    expect(result).toEqual({ hello: 'world' });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/v1/ping');
    expect((opts.headers as any)['Content-Type']).toBe('application/json');
    expect((opts.headers as any).Authorization).toBeUndefined();
  });

  it('attaches the bearer token when present', async () => {
    setToken('jwt-123');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    await api('/secure');
    const [, opts] = fetchMock.mock.calls[0];
    expect((opts.headers as any).Authorization).toBe('Bearer jwt-123');
  });

  it('merges custom headers and options', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    });
    vi.stubGlobal('fetch', fetchMock);

    await api('/x', { method: 'POST', headers: { 'X-Test': '1' } });
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect((opts.headers as any)['X-Test']).toBe('1');
  });

  it('throws with the server message on non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Bad input' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/fail')).rejects.toThrow('Bad input');
  });

  it('throws a generic message when body has no message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('no json');
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/fail')).rejects.toThrow('Request failed: 500');
  });
});

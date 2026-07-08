import { EmbeddingService } from './embedding.service';

describe('EmbeddingService', () => {
  const makeSettings = (over: Partial<{ embedModel: string; embedDim: number }> = {}) =>
    ({
      ai: jest.fn().mockResolvedValue({
        baseUrl: 'https://api.test/v1',
        apiKey: 'k',
        model: 'm',
        timeoutMs: 1000,
        embedModel: 'text-embedding-3-small',
        embedDim: 3,
        ...over,
      }),
    }) as any;

  afterEach(() => jest.restoreAllMocks());

  it('reports disabled when no embed model configured', async () => {
    const svc = new EmbeddingService(makeSettings({ embedModel: '' }));
    expect(await svc.enabled()).toBe(false);
    await expect(svc.embed(['hi'])).rejects.toThrow(/No embedding model/);
  });

  it('embeds texts via the /embeddings endpoint preserving order', async () => {
    const fetchMock = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { index: 1, embedding: [0.4, 0.5, 0.6] },
          { index: 0, embedding: [0.1, 0.2, 0.3] },
        ],
      }),
    } as any);

    const svc = new EmbeddingService(makeSettings());
    const out = await svc.embed(['a', 'b']);

    expect(out).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.test/v1/embeddings');
    expect((init as any).headers.Authorization).toBe('Bearer k');
  });

  it('throws a clear error on provider failure', async () => {
    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom',
    } as any);
    const svc = new EmbeddingService(makeSettings());
    await expect(svc.embedOne('x')).rejects.toThrow(/Embedding provider error \(500\)/);
  });
});

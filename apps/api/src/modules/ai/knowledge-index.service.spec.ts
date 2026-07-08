import { KnowledgeIndexService } from './knowledge-index.service';

describe('KnowledgeIndexService', () => {
  const makePrisma = () => ({
    knowledgeItem: { findUnique: jest.fn(), findMany: jest.fn() },
    $executeRawUnsafe: jest.fn().mockResolvedValue(1),
    $queryRawUnsafe: jest.fn(),
  });

  it('search returns [] and skips SQL when embeddings disabled', async () => {
    const prisma = makePrisma();
    const embeddings = { enabled: jest.fn().mockResolvedValue(false) } as any;
    const svc = new KnowledgeIndexService(prisma as any, embeddings);

    expect(await svc.search('kb1', 'query', 10)).toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('search returns [] (keyword fallback) when the embed call fails', async () => {
    const prisma = makePrisma();
    const embeddings = {
      enabled: jest.fn().mockResolvedValue(true),
      embedOne: jest.fn().mockRejectedValue(new Error('provider down')),
    } as any;
    const svc = new KnowledgeIndexService(prisma as any, embeddings);

    expect(await svc.search('kb1', 'query', 10)).toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('search runs a cosine-ordered vector query and returns rows', async () => {
    const prisma = makePrisma();
    prisma.$queryRawUnsafe.mockResolvedValue([
      { id: 'a', title: 'T', productName: null, content: 'C' },
    ]);
    const embeddings = {
      enabled: jest.fn().mockResolvedValue(true),
      embedOne: jest.fn().mockResolvedValue([0.1, 0.2]),
    } as any;
    const svc = new KnowledgeIndexService(prisma as any, embeddings);

    const rows = await svc.search('kb1', 'kapan sampai', 5);
    expect(rows).toHaveLength(1);
    const [sql, kb, vec, limit] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/embedding" <=> \$2::vector/);
    expect(kb).toBe('kb1');
    expect(vec).toBe('[0.1,0.2]');
    expect(limit).toBe(5);
  });

  it('indexItem is a no-op when disabled', async () => {
    const prisma = makePrisma();
    const embeddings = { enabled: jest.fn().mockResolvedValue(false) } as any;
    const svc = new KnowledgeIndexService(prisma as any, embeddings);

    await svc.indexItem('x');
    expect(prisma.knowledgeItem.findUnique).not.toHaveBeenCalled();
    expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('indexItem skips re-embed when content hash is unchanged', async () => {
    const prisma = makePrisma();
    const embeddings = {
      enabled: jest.fn().mockResolvedValue(true),
      modelName: jest.fn().mockResolvedValue('m'),
      embedOne: jest.fn(),
    } as any;
    const svc = new KnowledgeIndexService(prisma as any, embeddings);
    // First call computes the hash and would store; capture it, then replay.
    const item = { id: 'x', title: 'T', productName: null, content: 'C', contentHash: null };
    prisma.knowledgeItem.findUnique.mockResolvedValue(item);
    embeddings.embedOne.mockResolvedValue([0.1]);
    await svc.indexItem('x');
    // $executeRawUnsafe(sql, vector, model, hash, id) → hash is arg index 3.
    const storedHash = prisma.$executeRawUnsafe.mock.calls[0][3];

    // Now the item already has that hash → no embed call.
    prisma.knowledgeItem.findUnique.mockResolvedValue({ ...item, contentHash: storedHash });
    embeddings.embedOne.mockClear();
    await svc.indexItem('x');
    expect(embeddings.embedOne).not.toHaveBeenCalled();
  });
});

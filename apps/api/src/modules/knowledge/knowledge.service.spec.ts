import { NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

describe('KnowledgeService', () => {
  let service: KnowledgeService;
  let prisma: any;
  let knowledgeIndex: any;

  beforeEach(() => {
    prisma = {
      knowledgeBase: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'kb1' }),
        update: jest.fn().mockResolvedValue({ id: 'kb1' }),
      },
      knowledgeItem: {
        create: jest.fn().mockResolvedValue({ id: 'ki1' }),
        update: jest.fn().mockResolvedValue({ id: 'ki1' }),
      },
    };
    // RAG disabled in unit tests → indexItem is a no-op; assert it's invoked
    // on writes without standing up the embedding provider.
    knowledgeIndex = {
      indexItem: jest.fn().mockResolvedValue(undefined),
      reindexBase: jest.fn().mockResolvedValue(0),
      enabled: jest.fn().mockResolvedValue(false),
    };
    service = new KnowledgeService(prisma, knowledgeIndex);
  });

  it('listBases includes item counts', async () => {
    await service.listBases();
    expect(prisma.knowledgeBase.findMany.mock.calls[0][0].include).toBeDefined();
  });

  it('createBase sets createdById', async () => {
    await service.createBase({ name: 'KB' } as any, 'u1');
    expect(prisma.knowledgeBase.create.mock.calls[0][0].data.createdById).toBe('u1');
  });

  describe('getBase', () => {
    it('returns base when found', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue({ id: 'kb1' });
      expect(await service.getBase('kb1')).toEqual({ id: 'kb1' });
    });
    it('throws when missing', async () => {
      prisma.knowledgeBase.findUnique.mockResolvedValue(null);
      await expect(service.getBase('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateBase', () => {
    it('sets approvedById when status active', async () => {
      await service.updateBase('kb1', { status: 'active' } as any, 'u1');
      expect(prisma.knowledgeBase.update.mock.calls[0][0].data.approvedById).toBe('u1');
    });
    it('does not set approvedById otherwise', async () => {
      await service.updateBase('kb1', { status: 'draft' } as any, 'u1');
      expect(prisma.knowledgeBase.update.mock.calls[0][0].data.approvedById).toBeUndefined();
    });
  });

  describe('addItem', () => {
    it('maps fields and parses dates', async () => {
      await service.addItem('kb1', {
        title: 'T',
        content: 'C',
        validFrom: '2024-01-01',
        validUntil: '2024-12-31',
        status: 'active',
      } as any);
      const data = prisma.knowledgeItem.create.mock.calls[0][0].data;
      expect(data.knowledgeBaseId).toBe('kb1');
      expect(data.validFrom).toBeInstanceOf(Date);
      expect(data.validUntil).toBeInstanceOf(Date);
    });
    it('leaves dates undefined when not given', async () => {
      await service.addItem('kb1', { title: 'T', content: 'C' } as any);
      const data = prisma.knowledgeItem.create.mock.calls[0][0].data;
      expect(data.validFrom).toBeUndefined();
    });
  });

  describe('updateItem', () => {
    it('parses dates on update', async () => {
      await service.updateItem('ki1', { validUntil: '2025-01-01' } as any);
      expect(prisma.knowledgeItem.update.mock.calls[0][0].data.validUntil).toBeInstanceOf(Date);
    });
  });
});

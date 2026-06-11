import { NotFoundException } from '@nestjs/common';
import { QuickRepliesService } from './quick-replies.service';

describe('QuickRepliesService', () => {
  let service: QuickRepliesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      quickReply: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'q1' }),
        update: jest.fn().mockResolvedValue({ id: 'q1' }),
        delete: jest.fn().mockResolvedValue({ id: 'q1' }),
      },
    };
    service = new QuickRepliesService(prisma);
  });

  describe('list', () => {
    it('scopes to the account plus global templates', async () => {
      await service.list('a1');
      const where = prisma.quickReply.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([{ whatsappAccountId: 'a1' }, { whatsappAccountId: null }]);
    });
    it('returns everything when no account given', async () => {
      await service.list();
      expect(prisma.quickReply.findMany.mock.calls[0][0].where).toEqual({});
    });
  });

  describe('create', () => {
    it('strips a leading slash from the shortcut and records the author', async () => {
      await service.create({ title: ' Salam ', content: 'Halo kak', shortcut: '/salam' }, 'u1');
      const data = prisma.quickReply.create.mock.calls[0][0].data;
      expect(data.title).toBe('Salam');
      expect(data.shortcut).toBe('salam');
      expect(data.createdById).toBe('u1');
      expect(data.whatsappAccountId).toBeNull();
    });
    it('normalizes a blank shortcut to null', async () => {
      await service.create({ title: 'X', content: 'Y', shortcut: '   ' }, 'u1');
      expect(prisma.quickReply.create.mock.calls[0][0].data.shortcut).toBeNull();
    });
  });

  describe('update', () => {
    it('throws when missing', async () => {
      prisma.quickReply.findUnique.mockResolvedValue(null);
      await expect(service.update('q1', { title: 'x' })).rejects.toThrow(NotFoundException);
    });
    it('updates only provided fields', async () => {
      prisma.quickReply.findUnique.mockResolvedValue({ id: 'q1' });
      await service.update('q1', { content: 'new' });
      const data = prisma.quickReply.update.mock.calls[0][0].data;
      expect(data).toEqual({ content: 'new' });
    });
  });

  describe('remove', () => {
    it('throws when missing', async () => {
      prisma.quickReply.findUnique.mockResolvedValue(null);
      await expect(service.remove('q1')).rejects.toThrow(NotFoundException);
    });
    it('deletes when found', async () => {
      prisma.quickReply.findUnique.mockResolvedValue({ id: 'q1' });
      expect(await service.remove('q1')).toEqual({ deleted: true });
      expect(prisma.quickReply.delete).toHaveBeenCalledWith({ where: { id: 'q1' } });
    });
  });
});

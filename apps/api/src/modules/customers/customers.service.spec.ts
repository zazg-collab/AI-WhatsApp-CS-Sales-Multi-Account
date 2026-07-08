import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { LeadStage } from '@sentinel/database';
import { CustomersService } from './customers.service';
import { MAX_EXPORT_ROWS } from '../../common/export-limits';

describe('CustomersService', () => {
  let service: CustomersService;
  let prisma: any;
  let audit: any;

  beforeEach(() => {
    prisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn() },
      conversation: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      sentinelReview: { findMany: jest.fn().mockResolvedValue([]) },
      followUp: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ps: any[]) => Promise.all(ps)),
    };
    audit = { log: jest.fn().mockResolvedValue({}) };
    service = new CustomersService(prisma, audit);
  });

  describe('list', () => {
    it('applies stage, tag and search filters', async () => {
      await service.list({ stage: LeadStage.hot, tag: 'vip', search: 'budi' });
      const arg = prisma.customer.findMany.mock.calls[0][0];
      expect(arg.where.leadStage).toBe(LeadStage.hot);
      expect(arg.where.tags).toEqual({ has: 'vip' });
      expect(arg.where.OR).toHaveLength(2);
    });
    it('empty filters → empty where', async () => {
      await service.list({});
      expect(prisma.customer.findMany.mock.calls[0][0].where).toEqual({});
    });
  });

  describe('get', () => {
    it('returns customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1' });
      expect(await service.get('c1')).toEqual({ id: 'c1' });
    });
    it('throws when missing', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.get('c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('delegates to prisma update', async () => {
      prisma.customer.update.mockResolvedValue({ id: 'c1' });
      await service.update('c1', { name: 'New' } as any);
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { name: 'New' },
      });
    });
  });

  describe('addNote', () => {
    it('appends stamped note to existing notes', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', notes: 'old note' });
      prisma.customer.update.mockResolvedValue({ id: 'c1' });
      await service.addNote('c1', 'new note', 'u1');
      const data = prisma.customer.update.mock.calls[0][0].data;
      expect(data.notes).toContain('old note');
      expect(data.notes).toContain('new note');
      expect(data.notes.split('\n')).toHaveLength(2);
      expect(audit.log).toHaveBeenCalled();
    });
    it('creates note when none exist', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'c1', notes: null });
      prisma.customer.update.mockResolvedValue({ id: 'c1' });
      await service.addNote('c1', 'first', 'u1');
      expect(prisma.customer.update.mock.calls[0][0].data.notes).toContain('first');
    });
    it('throws when customer missing', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      await expect(service.addNote('c1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('timeline', () => {
    it('merges and sorts events reverse-chronologically', async () => {
      prisma.conversation.findMany.mockResolvedValue([{ id: 'conv1' }]);
      prisma.message.findMany.mockResolvedValue([
        { createdAt: new Date('2024-01-01') },
      ]);
      prisma.sentinelReview.findMany.mockResolvedValue([
        { createdAt: new Date('2024-03-01') },
      ]);
      prisma.followUp.findMany.mockResolvedValue([
        { createdAt: new Date('2024-02-01') },
      ]);
      const events = await service.timeline('c1');
      expect(events.map((e) => e.type)).toEqual([
        'sentinel_review',
        'follow_up',
        'message',
      ]);
    });
  });

  describe('bulkAction', () => {
    it('rejects empty id list', async () => {
      await expect(
        service.bulkAction({ customerIds: [] } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
    it('rejects when no action selected', async () => {
      await expect(
        service.bulkAction({ customerIds: ['a'] } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
    it('updates customers with lead stage', async () => {
      prisma.customer.findMany.mockResolvedValue([{ id: 'a', tags: [], notes: null }]);
      prisma.customer.update.mockResolvedValue({ id: 'a' });
      const r = await service.bulkAction(
        { customerIds: ['a'], leadStage: LeadStage.hot } as any,
        'u1',
      );
      expect(r.updatedCount).toBe(1);
      expect(audit.log).toHaveBeenCalled();
    });
    it('throws when some customers not found', async () => {
      prisma.customer.findMany.mockResolvedValue([]);
      await expect(
        service.bulkAction(
          { customerIds: ['a'], leadStage: LeadStage.hot } as any,
          'u1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('exportList', () => {
    it('returns customers with a capped take', async () => {
      await service.exportList({ stage: LeadStage.warm });
      expect(prisma.customer.findMany.mock.calls[0][0].take).toBe(MAX_EXPORT_ROWS);
    });

    it('warns when the export hits the cap', async () => {
      prisma.customer.findMany.mockResolvedValueOnce(
        Array.from({ length: MAX_EXPORT_ROWS }, (_, i) => ({ id: String(i) })),
      );
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      await service.exportList({ stage: LeadStage.warm });
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});

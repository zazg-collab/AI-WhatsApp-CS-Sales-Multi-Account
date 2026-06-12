import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([{ id: 'a1' }]),
      },
    };
    service = new AuditService(prisma);
  });

  describe('log', () => {
    it('creates a log row with meta as newValue', async () => {
      await service.log('u1', 'act', 'Thing', 't1', { x: 1 });
      expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({
        userId: 'u1',
        action: 'act',
        entityType: 'Thing',
        entityId: 't1',
        newValue: { x: 1 },
      });
    });
  });

  describe('list', () => {
    it('returns data + total with filters', async () => {
      const r = await service.list({
        userId: 'u1',
        entity: 'Thing',
        action: 'create',
        from: '2024-01-01',
        to: '2024-12-31',
        limit: 5,
        offset: 0,
      });
      expect(r.total).toBe(2);
      expect(r.data).toHaveLength(1);
      const where = prisma.auditLog.findMany.mock.calls[0][0].where;
      expect(where.userId).toBe('u1');
      expect(where.entityType).toBe('Thing');
      expect(where.createdAt).toHaveProperty('gte');
      expect(where.createdAt).toHaveProperty('lte');
    });
    it('works with no filters', async () => {
      const r = await service.list({});
      expect(r.total).toBe(2);
    });
  });
});

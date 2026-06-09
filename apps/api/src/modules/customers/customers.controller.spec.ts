import { LeadStage } from '@hermes/database';
import { CustomersController } from './customers.controller';

describe('CustomersController', () => {
  let controller: CustomersController;
  let svc: any;

  beforeEach(() => {
    svc = {
      exportList: jest.fn().mockResolvedValue([]),
      list: jest.fn().mockResolvedValue([]),
      bulkAction: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      addNote: jest.fn().mockResolvedValue({}),
      timeline: jest.fn().mockResolvedValue([]),
    };
    controller = new CustomersController(svc);
  });

  it('list/get/update/addNote/timeline/bulk delegate', () => {
    controller.list(LeadStage.hot, 'vip', 'b');
    controller.get('c1');
    controller.update('c1', { name: 'X' } as any);
    controller.addNote('c1', { note: 'n' } as any, { id: 'u1' } as any);
    controller.timeline('c1');
    controller.bulkAction({ customerIds: ['c1'] } as any, { id: 'u1' } as any);
    expect(svc.list).toHaveBeenCalledWith({ stage: LeadStage.hot, tag: 'vip', search: 'b' });
    expect(svc.get).toHaveBeenCalledWith('c1');
    expect(svc.update).toHaveBeenCalled();
    expect(svc.addNote).toHaveBeenCalledWith('c1', 'n', 'u1');
    expect(svc.timeline).toHaveBeenCalledWith('c1');
    expect(svc.bulkAction).toHaveBeenCalled();
  });

  it('export writes CSV with escaping', async () => {
    svc.exportList.mockResolvedValue([
      { id: 'c1', name: 'A"B', phoneNumber: '628', leadStage: 'hot', leadScore: 70,
        tags: ['x', 'y'], lastMessageAt: new Date('2024-01-01'), notes: null,
        createdAt: new Date('2024-01-01') },
    ]);
    const res: any = { setHeader: jest.fn(), send: jest.fn() };
    await controller.export(undefined, undefined, undefined, res);
    expect(res.send.mock.calls[0][0]).toContain('x;y');
  });
});

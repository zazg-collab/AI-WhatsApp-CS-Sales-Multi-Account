import { AiMode } from '@hermes/database';

jest.mock('../wa/wa.service', () => ({ WaService: class {} }));

import { ConversationsController } from './conversations.controller';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let svc: any;

  beforeEach(() => {
    svc = {
      exportList: jest.fn().mockResolvedValue([]),
      list: jest.fn().mockResolvedValue({}),
      get: jest.fn().mockResolvedValue({}),
      send: jest.fn().mockResolvedValue({}),
      takeover: jest.fn().mockResolvedValue({}),
      returnToAi: jest.fn().mockResolvedValue({}),
      setAiMode: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      sendMedia: jest.fn().mockResolvedValue({}),
    };
    controller = new ConversationsController(svc);
  });

  it('list parses query params', () => {
    controller.list('a1', AiMode.ai_on, 'budi', 'true', '2', '10');
    expect(svc.list).toHaveBeenCalledWith({
      accountId: 'a1', aiMode: AiMode.ai_on, search: 'budi',
      needsAttention: true, page: 2, limit: 10,
    });
  });

  it('list defaults page/limit', () => {
    controller.list();
    expect(svc.list.mock.calls[0][0].page).toBe(1);
    expect(svc.list.mock.calls[0][0].limit).toBe(50);
  });

  it('get parses message paging', () => {
    controller.get('c1', '2', '20');
    expect(svc.get).toHaveBeenCalledWith('c1', 2, 20);
  });

  it('send + sendLegacy delegate', () => {
    controller.send('c1', { text: 'hi' } as any, { id: 'u1' } as any);
    controller.sendLegacy('c1', { text: 'yo' } as any, { id: 'u1' } as any);
    expect(svc.send).toHaveBeenCalledTimes(2);
  });

  it('takeover/returnToAi/setAiMode/update/sendMedia delegate', () => {
    controller.takeover('c1', { id: 'u1' } as any);
    controller.returnToAi('c1');
    controller.setAiMode('c1', { aiMode: AiMode.ai_off } as any);
    controller.update('c1', { aiMode: AiMode.ai_on });
    controller.sendMedia('c1', { mediaType: 'image', url: 'u' } as any, { id: 'u1' } as any);
    expect(svc.takeover).toHaveBeenCalled();
    expect(svc.returnToAi).toHaveBeenCalled();
    expect(svc.setAiMode).toHaveBeenCalled();
    expect(svc.update).toHaveBeenCalled();
    expect(svc.sendMedia).toHaveBeenCalled();
  });

  it('export writes CSV', async () => {
    svc.exportList.mockResolvedValue([
      { id: 'c1', customer: { name: 'A"B', phoneNumber: '628', leadStage: 'hot' },
        aiMode: 'ai_on', takeoverStatus: 'none', _count: { messages: 3 },
        lastMessageAt: new Date('2024-01-01') },
    ]);
    const res: any = { setHeader: jest.fn(), send: jest.fn() };
    await controller.export(undefined, undefined, undefined, undefined, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.send.mock.calls[0][0]).toContain('A""B');
  });
});

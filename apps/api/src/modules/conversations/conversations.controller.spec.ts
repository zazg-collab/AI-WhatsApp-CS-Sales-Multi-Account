import { AiMode, ConversationStatus } from '@sentinel/database';

jest.mock('../wa/wa.service', () => ({ WaService: class {} }));

import { ConversationsController } from './conversations.controller';
import { ConversationMessagesController } from './conversation-messages.controller';
import { ConversationChatOpsController } from './conversation-chat-ops.controller';

describe('ConversationsController', () => {
  let controller: ConversationsController;
  let messages: ConversationMessagesController;
  let chatOps: ConversationChatOpsController;
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
    // All three controllers share the same ConversationsService.
    controller = new ConversationsController(svc);
    messages = new ConversationMessagesController(svc);
    chatOps = new ConversationChatOpsController(svc);
  });

  const USER = { id: 'u1', role: 'owner' } as any;

  it('list parses query params', () => {
    controller.list(USER, 'a1', AiMode.ai_on, ConversationStatus.open, 'u1', 'vip', 'budi', 'true', '2', '10');
    expect(svc.list).toHaveBeenCalledWith({
      accountId: 'a1', aiMode: AiMode.ai_on, status: ConversationStatus.open,
      assignedAdminId: 'u1', label: 'vip', search: 'budi',
      needsAttention: true, page: 2, limit: 10, user: USER,
    });
  });

  it('setLabels delegates', () => {
    svc.setLabels = jest.fn().mockResolvedValue({});
    controller.setLabels('c1', { labels: ['vip', 'refund'] }, { id: 'u1' } as any);
    expect(svc.setLabels).toHaveBeenCalledWith('c1', ['vip', 'refund'], 'u1', { id: 'u1' });
  });

  it('list rejects an invalid status', () => {
    expect(() => controller.list(USER, undefined, undefined, 'bogus' as any)).toThrow();
  });

  it('searchMessages delegates with defaults', () => {
    svc.searchMessages = jest.fn().mockResolvedValue({ items: [] });
    controller.searchMessages(USER, 'c1', 'harga');
    expect(svc.searchMessages).toHaveBeenCalledWith('c1', 'harga', 50, USER);
  });

  it('setStatus and assign delegate', () => {
    svc.setStatus = jest.fn().mockResolvedValue({});
    svc.assign = jest.fn().mockResolvedValue({});
    controller.setStatus('c1', { status: ConversationStatus.resolved }, { id: 'u1' } as any);
    controller.assign('c1', { adminId: 'u1' }, { id: 'u1' } as any);
    controller.assign('c1', {}, { id: 'u1' } as any);
    expect(svc.setStatus).toHaveBeenCalledWith('c1', ConversationStatus.resolved, 'u1', { id: 'u1' });
    expect(svc.assign).toHaveBeenCalledWith('c1', 'u1', 'u1', { id: 'u1' });
    expect(svc.assign).toHaveBeenCalledWith('c1', null, 'u1', { id: 'u1' });
  });

  it('list defaults page/limit', () => {
    controller.list(USER);
    expect(svc.list.mock.calls[0][0].page).toBe(1);
    expect(svc.list.mock.calls[0][0].limit).toBe(50);
  });

  it('get parses message limit', () => {
    controller.get(USER, 'c1', '20');
    expect(svc.get).toHaveBeenCalledWith('c1', 20, USER);
  });

  it('getMessages forwards the cursor + limit', () => {
    svc.getMessages = jest.fn().mockResolvedValue({ messages: [] });
    controller.getMessages(USER, 'c1', '2024-06-01T00:00:00.000Z', '30');
    expect(svc.getMessages).toHaveBeenCalledWith('c1', { before: '2024-06-01T00:00:00.000Z', limit: 30 }, USER);
  });

  it('send + sendLegacy delegate', () => {
    messages.send('c1', { text: 'hi' } as any, { id: 'u1' } as any);
    messages.sendLegacy('c1', { text: 'yo' } as any, { id: 'u1' } as any);
    expect(svc.send).toHaveBeenCalledTimes(2);
  });

  it('takeover/returnToAi/setAiMode/update/sendMedia delegate', () => {
    chatOps.takeover('c1', { id: 'u1' } as any);
    chatOps.returnToAi('c1', { id: 'u1' } as any);
    controller.setAiMode('c1', { aiMode: AiMode.ai_off } as any, { id: 'u1' } as any);
    controller.update('c1', { aiMode: AiMode.ai_on }, { id: 'u1' } as any);
    messages.sendMedia('c1', { mediaType: 'image', url: 'u' } as any, { id: 'u1' } as any);
    expect(svc.takeover).toHaveBeenCalled();
    expect(svc.returnToAi).toHaveBeenCalled();
    expect(svc.setAiMode).toHaveBeenCalled();
    expect(svc.update).toHaveBeenCalled();
    expect(svc.sendMedia).toHaveBeenCalled();
  });

  it('start delegates with the current user', () => {
    svc.startConversation = jest.fn().mockResolvedValue({ id: 'c1' });
    const authUser = { id: 'u1' } as any;
    chatOps.start({ accountId: 'a1', phoneNumber: '0812345678', name: 'Budi' } as any, authUser);
    expect(svc.startConversation).toHaveBeenCalledWith('a1', '0812345678', 'Budi', 'u1', authUser);
  });

  it('export writes CSV', async () => {
    svc.exportList.mockResolvedValue([
      { id: 'c1', customer: { name: 'A"B', phoneNumber: '628', leadStage: 'hot' },
        aiMode: 'ai_on', takeoverStatus: 'none', _count: { messages: 3 },
        lastMessageAt: new Date('2024-01-01') },
    ]);
    const res: any = { setHeader: jest.fn(), send: jest.fn() };
    await controller.export(USER, undefined, undefined, undefined, undefined, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.send.mock.calls[0][0]).toContain('A""B');
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiMode, ConversationStatus, TakeoverStatus } from '@hermes/database';
import { ConversationsService } from './conversations.service';
import { ConversationMessagingService } from './conversation-messaging.service';
import { ConversationChatOpsService } from './conversation-chat-ops.service';

jest.mock('../wa/wa.service', () => ({ WaService: class {} }));

describe('ConversationsService', () => {
  let service: ConversationsService;
  let messaging: ConversationMessagingService;
  let chatOps: ConversationChatOpsService;
  let prisma: any;
  let wa: any;
  let events: any;
  let storage: any;
  let config: any;
  let learningMiner: any;

  beforeEach(() => {
    prisma = {
      conversation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'c1', status: 'open' }),
        update: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'm1', status: 'sent' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: jest.fn(),
      },
      customer: {
        upsert: jest.fn().mockResolvedValue({ id: 'cu1', phoneNumber: '628123' }),
        update: jest.fn().mockResolvedValue({}),
      },
      bot: {
        findUnique: jest.fn(),
      },
      whatsappAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: 'a1', assignedBotId: null, assignedAdminId: null, aiMode: 'ai_draft' }),
      },
    };
    wa = {
      sendText: jest.fn().mockResolvedValue('ext1'),
      sendMedia: jest.fn().mockResolvedValue('ext2'),
      sendMediaBuffer: jest.fn().mockResolvedValue('ext3'),
      markRead: jest.fn().mockResolvedValue(undefined),
      fetchAvatar: jest.fn().mockResolvedValue(null),
      isOnWhatsApp: jest.fn().mockResolvedValue(true),
      sendReaction: jest.fn().mockResolvedValue(undefined),
      editMessage: jest.fn().mockResolvedValue(undefined),
      deleteMessage: jest.fn().mockResolvedValue(undefined),
      setContactBlocked: jest.fn().mockResolvedValue(undefined),
      setChatMuted: jest.fn().mockResolvedValue(undefined),
      setChatArchived: jest.fn().mockResolvedValue(undefined),
      setChatPinned: jest.fn().mockResolvedValue(undefined),
      setDisappearingMessages: jest.fn().mockResolvedValue(undefined),
      setMessageStarred: jest.fn().mockResolvedValue(undefined),
      sendTyping: jest.fn().mockResolvedValue(undefined),
    };
    events = { emit: jest.fn(), emitToAccount: jest.fn() };
    storage = { save: jest.fn().mockResolvedValue({ key: 'k.png', url: '/media/k.png' }), read: jest.fn() };
    config = { get: jest.fn((k: string) => (k === 'CSAT_ENABLED' ? 'true' : undefined)) };
    learningMiner = { mineConversation: jest.fn().mockResolvedValue({ knowledge: 0, customerMemory: 0, skipped: 0 }) };
    service = new ConversationsService(prisma, wa, events, learningMiner, config);
    messaging = new ConversationMessagingService(prisma, wa, events, storage);
    chatOps = new ConversationChatOpsService(prisma, wa, events);
  });

  describe('list', () => {
    it('applies filters', async () => {
      await service.list({ accountId: 'a1', aiMode: AiMode.ai_on, search: 'budi', needsAttention: true });
      const where = prisma.conversation.findMany.mock.calls[0][0].where;
      expect(where.whatsappAccountId).toBe('a1');
      expect(where.aiMode).toBe(AiMode.ai_on);
      expect(where.AND).toBeDefined();
      expect(where.AND[1].OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ groupSubject: expect.any(Object) }),
          expect.objectContaining({ chatJid: expect.any(Object) }),
          expect.objectContaining({ customer: expect.any(Object) }),
        ]),
      );
    });
  });

  describe('get', () => {
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.get('c1')).rejects.toThrow(NotFoundException);
    });
    it('returns the conversation with its most recent message page + cursor', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.message.findMany.mockResolvedValue([
        { id: 'm2', createdAt: new Date('2024-01-02') },
        { id: 'm1', createdAt: new Date('2024-01-01') },
      ]);
      const r: any = await service.get('c1', 50);
      expect(r.id).toBe('c1');
      // newest-first query result reversed to chronological order
      expect(r.messages.map((m: any) => m.id)).toEqual(['m1', 'm2']);
      expect(r.hasMoreMessages).toBe(false);
      expect(r.oldestCursor).toEqual(new Date('2024-01-01'));
    });
  });

  describe('getMessages', () => {
    it('reverses the newest-first window and flags more pages', async () => {
      // take=2 → service fetches 3 rows; extra row means hasMore=true
      prisma.message.findMany.mockResolvedValue([
        { id: 'm3', createdAt: new Date('2024-01-03') },
        { id: 'm2', createdAt: new Date('2024-01-02') },
        { id: 'm1', createdAt: new Date('2024-01-01') },
      ]);
      const r = await service.getMessages('c1', { limit: 2 });
      expect(prisma.message.findMany.mock.calls[0][0].take).toBe(3);
      expect(r.messages.map((m: any) => m.id)).toEqual(['m2', 'm3']);
      expect(r.hasMore).toBe(true);
      expect(r.oldestCursor).toEqual(new Date('2024-01-02'));
    });
    it('applies the before cursor and caps the limit at 100', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      await service.getMessages('c1', { before: '2024-06-01T00:00:00.000Z', limit: 5000 });
      const args = prisma.message.findMany.mock.calls[0][0];
      expect(args.take).toBe(101);
      expect(args.where.createdAt).toEqual({ lt: new Date('2024-06-01T00:00:00.000Z') });
    });
  });

  describe('send', () => {
    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(messaging.send('c1', 'admin', 'hi')).rejects.toThrow(NotFoundException);
    });
    it('sends text, persists message, emits', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      await messaging.send('c1', 'admin', 'hello');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'hello', undefined);
      expect(prisma.message.create).toHaveBeenCalled();
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:new', expect.anything());
    });
    it('passes the quoted message to the gateway and persists the link', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue({
        externalId: 'wamid1', content: 'original', senderType: 'customer',
      });
      await messaging.send('c1', 'admin', 'reply', 'q1');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'reply', {
        externalId: 'wamid1', content: 'original', fromMe: false,
      });
      expect(prisma.message.create.mock.calls[0][0].data.quotedMessageId).toBe('q1');
    });
    it('rejects a quoted id from another conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(messaging.send('c1', 'admin', 'reply', 'q1')).rejects.toThrow(BadRequestException);
      expect(wa.sendText).not.toHaveBeenCalled();
    });
  });

  describe('setStatus', () => {
    it('updates status and emits conversation:updated', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1', status: 'open' });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'pending', assignedAdmin: null, customer: { phoneNumber: '628' } });
      await service.setStatus('c1', ConversationStatus.pending);
      expect(prisma.conversation.update.mock.calls[0][0].data.status).toBe(ConversationStatus.pending);
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'conversation:updated', expect.objectContaining({ conversationId: 'c1' }));
    });
    it('sends a CSAT request when first resolved (CSAT enabled)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1', status: 'open', csatRequestedAt: null });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'resolved', whatsappAccountId: 'a1', assignedAdmin: null, customer: { phoneNumber: '628' } });
      await service.setStatus('c1', ConversationStatus.resolved);
      expect(prisma.conversation.update.mock.calls[0][0].data.csatRequestedAt).toBeInstanceOf(Date);
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', expect.stringContaining('1'));
    });
    it('persists the CSAT request as a system message in the timeline (A4)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1', status: 'open', csatRequestedAt: null });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'resolved', whatsappAccountId: 'a1', assignedAdmin: null, customer: { phoneNumber: '628' } });
      await service.setStatus('c1', ConversationStatus.resolved);
      // the persist happens in a fire-and-forget chain — flush microtasks
      await new Promise((resolve) => setImmediate(resolve));
      const created = prisma.message.create.mock.calls[0][0].data;
      expect(created.senderType).toBe('system');
      expect(created.conversationId).toBe('c1');
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:new', expect.anything());
    });
    it('does not re-request CSAT when already resolved', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1', status: 'resolved', csatRequestedAt: new Date() });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'resolved', whatsappAccountId: 'a1', assignedAdmin: null, customer: { phoneNumber: '628' } });
      await service.setStatus('c1', ConversationStatus.resolved);
      expect(wa.sendText).not.toHaveBeenCalled();
    });
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.setStatus('c1', ConversationStatus.open)).rejects.toThrow(NotFoundException);
    });
  });

  describe('setLabels', () => {
    it('dedupes, trims, and persists labels + emits', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1' });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', labels: ['vip', 'refund'] });
      await service.setLabels('c1', [' vip ', 'vip', 'refund', '']);
      expect(prisma.conversation.update.mock.calls[0][0].data.labels).toEqual(['vip', 'refund']);
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'conversation:updated', expect.objectContaining({ labels: ['vip', 'refund'] }));
    });
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.setLabels('c1', ['x'])).rejects.toThrow(NotFoundException);
    });
  });

  describe('assign', () => {
    it('assigns to an existing admin and emits', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1' });
      prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'open', assignedAdmin: { id: 'u1', name: 'Ani' } });
      await service.assign('c1', 'u1');
      expect(prisma.conversation.update.mock.calls[0][0].data.assignedAdminId).toBe('u1');
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'conversation:updated', expect.anything());
    });
    it('unassigns with null', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1' });
      prisma.conversation.update.mockResolvedValue({ id: 'c1', status: 'open', assignedAdmin: null });
      await service.assign('c1', null);
      expect(prisma.user.findFirst).not.toHaveBeenCalled();
      expect(prisma.conversation.update.mock.calls[0][0].data.assignedAdminId).toBeNull();
    });
    it('rejects an unknown admin', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ whatsappAccountId: 'a1' });
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.assign('c1', 'ghost')).rejects.toThrow(BadRequestException);
    });
  });

  describe('searchMessages', () => {
    it('searches case-insensitively within the conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.message.findMany.mockResolvedValue([{ id: 'm1', content: 'Harga 100rb' }]);
      const r = await service.searchMessages('c1', 'harga');
      const where = prisma.message.findMany.mock.calls[0][0].where;
      expect(where.conversationId).toBe('c1');
      expect(where.content).toEqual({ contains: 'harga', mode: 'insensitive' });
      expect(r.items).toHaveLength(1);
    });
    it('returns empty for a blank query without hitting the db', async () => {
      const r = await service.searchMessages('c1', '   ');
      expect(r.items).toEqual([]);
      expect(prisma.message.findMany).not.toHaveBeenCalled();
    });
    it('caps the limit at 100', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      await service.searchMessages('c1', 'x', 5000);
      expect(prisma.message.findMany.mock.calls[0][0].take).toBe(100);
    });
    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.searchMessages('c1', 'x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('approveDraft', () => {
    it('claims the draft atomically before sending, then emits', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'draft text', status: 'pending' });
      await messaging.approveDraft('c1', 'd1', 'admin');
      // A2: the pending→sent flip happens via a conditional updateMany claim.
      const claim = prisma.message.updateMany.mock.calls[0][0];
      expect(claim.where).toEqual({ id: 'd1', status: 'pending' });
      expect(claim.data.status).toBe('sent');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'draft text');
      const update = prisma.message.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'd1' });
      expect(update.data.externalId).toBe('ext1');
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:new', expect.anything());
    });
    it('uses edited text when provided', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'old', status: 'pending' });
      await messaging.approveDraft('c1', 'd1', 'admin', 'edited reply');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'edited reply');
    });
    it('never double-sends when a concurrent approve already claimed the draft (A2)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'x', status: 'pending' });
      prisma.message.updateMany.mockResolvedValue({ count: 0 }); // lost the race
      await expect(messaging.approveDraft('c1', 'd1', 'admin')).rejects.toThrow(NotFoundException);
      expect(wa.sendText).not.toHaveBeenCalled();
    });
    it('rolls the claim back when the gateway send fails (A2)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'x', status: 'pending' });
      wa.sendText.mockRejectedValue(new Error('gateway down'));
      await expect(messaging.approveDraft('c1', 'd1', 'admin')).rejects.toThrow('gateway down');
      // rollback: the row is put back to pending so a retry stays possible
      const rollback = prisma.message.update.mock.calls[0][0];
      expect(rollback.where).toEqual({ id: 'd1' });
      expect(rollback.data.status).toBe('pending');
    });
    it('throws when the draft is missing or already handled', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' } });
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(messaging.approveDraft('c1', 'd1', 'admin')).rejects.toThrow(NotFoundException);
      expect(wa.sendText).not.toHaveBeenCalled();
    });
  });

  describe('blockDraft', () => {
    it('marks the draft failed atomically and never sends', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1' });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'x', status: 'pending' });
      await messaging.blockDraft('c1', 'd1');
      const claim = prisma.message.updateMany.mock.calls[0][0];
      expect(claim.where).toEqual({ id: 'd1', status: 'pending' });
      expect(claim.data.status).toBe('failed');
      expect(wa.sendText).not.toHaveBeenCalled();
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:draft-removed', expect.anything());
    });
    it('throws when a concurrent approve already claimed the draft (A2)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1' });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'x', status: 'pending' });
      prisma.message.updateMany.mockResolvedValue({ count: 0 });
      await expect(messaging.blockDraft('c1', 'd1')).rejects.toThrow(NotFoundException);
    });
    it('throws when the draft is missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1' });
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(messaging.blockDraft('c1', 'd1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markRead', () => {
    it('forwards recent inbound external ids to the gateway', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findMany.mockResolvedValue([{ externalId: 'x1' }, { externalId: 'x2' }]);
      const r = await messaging.markRead('c1');
      expect(wa.markRead).toHaveBeenCalledWith('a1', '628', ['x1', 'x2']);
      expect(r).toEqual({ marked: 2 });
    });
    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(messaging.markRead('c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendUploadedMedia', () => {
    it('stores bytes, sends via buffer, persists with the storage url', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      const file = { buffer: Buffer.from('img'), mimetype: 'image/png', originalname: 'p.png' };
      await messaging.sendUploadedMedia('c1', 'admin', file, 'hi');
      expect(storage.save).toHaveBeenCalledWith(file.buffer, 'png');
      expect(wa.sendMediaBuffer).toHaveBeenCalledWith('a1', '628', 'image', file.buffer, 'image/png', 'hi', 'p.png');
      expect(prisma.message.create.mock.calls[0][0].data.mediaUrl).toBe('/media/k.png');
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:new', expect.anything());
    });
    it('maps mimetype to the right media category', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      await messaging.sendUploadedMedia('c1', 'admin', { buffer: Buffer.from('d'), mimetype: 'application/pdf', originalname: 'f.pdf' });
      expect(wa.sendMediaBuffer.mock.calls[0][2]).toBe('document');
    });
    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        messaging.sendUploadedMedia('c1', 'admin', { buffer: Buffer.from('x'), mimetype: 'image/png' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMedia', () => {
    it('sends media and persists', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      await messaging.sendMedia('c1', 'admin', 'image', 'http://x/y.png', 'cap');
      expect(wa.sendMedia).toHaveBeenCalled();
      expect(events.emitToAccount).toHaveBeenCalled();
    });
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(messaging.sendMedia('c1', 'a', 'image', 'https://cdn.example.com/u.png')).rejects.toThrow(NotFoundException);
    });
  });

  it('takeover sets admin_takeover + ai_off and remembers previous mode', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ aiMode: AiMode.ai_supervised });
    await chatOps.takeover('c1', 'admin');
    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.takeoverStatus).toBe(TakeoverStatus.admin_takeover);
    expect(data.aiMode).toBe(AiMode.ai_off);
    expect(data.previousAiMode).toBe(AiMode.ai_supervised);
  });

  it('returnToAi restores the previous mode (DR1), not ai_on', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ previousAiMode: AiMode.ai_supervised });
    await chatOps.returnToAi('c1');
    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.aiMode).toBe(AiMode.ai_supervised);
    expect(data.previousAiMode).toBeNull();
  });

  it('returnToAi defaults to ai_draft when no previous mode recorded', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ previousAiMode: null });
    await chatOps.returnToAi('c1');
    expect(prisma.conversation.update.mock.calls[0][0].data.aiMode).toBe(AiMode.ai_draft);
  });

  it('setAiMode updates mode', async () => {
    await service.setAiMode('c1', AiMode.ai_draft);
    expect(prisma.conversation.update.mock.calls[0][0].data.aiMode).toBe(AiMode.ai_draft);
  });

  describe('update', () => {
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.update('c1', {})).rejects.toThrow(NotFoundException);
    });
    it('updates when found', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      await service.update('c1', { aiMode: AiMode.ai_on });
      expect(prisma.conversation.update).toHaveBeenCalled();
    });
    it('drops unexpected fields — no mass assignment (A1)', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      await service.update('c1', { aiMode: AiMode.ai_on, csatScore: 5, unreadCount: 0 } as any);
      const data = prisma.conversation.update.mock.calls[0][0].data;
      expect(data).toEqual({ aiMode: AiMode.ai_on });
    });
  });

  describe('message actions', () => {
    function routeMocks(msg: any) {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' } });
      prisma.message.findFirst.mockResolvedValue(msg);
    }
    it('reactToMessage sends the emoji + persists under "me"', async () => {
      routeMocks({ id: 'm1', externalId: 'wamid1', reactions: null, senderType: 'customer' });
      prisma.message.update.mockResolvedValue({ id: 'm1', reactions: { '👍': ['me'] } });
      await messaging.reactToMessage('c1', 'm1', '👍', 'admin');
      expect(wa.sendReaction).toHaveBeenCalledWith('a1', '628', 'wamid1', '👍');
      expect(prisma.message.update.mock.calls[0][0].data.reactions['👍']).toContain('me');
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:reaction', expect.anything());
    });
    it('editMessage rejects editing a customer message', async () => {
      routeMocks({ id: 'm1', externalId: 'x', senderType: 'customer' });
      await expect(messaging.editMessage('c1', 'm1', 'baru', 'admin')).rejects.toThrow(BadRequestException);
      expect(wa.editMessage).not.toHaveBeenCalled();
    });
    it('editMessage updates an admin message via the gateway', async () => {
      routeMocks({ id: 'm1', externalId: 'x', senderType: 'admin' });
      prisma.message.update.mockResolvedValue({ id: 'm1', content: 'baru' });
      await messaging.editMessage('c1', 'm1', 'baru', 'admin');
      expect(wa.editMessage).toHaveBeenCalledWith('a1', '628', 'x', 'baru');
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:edited', expect.anything());
    });
    it('deleteMessage revokes for everyone (fromMe for admin msgs)', async () => {
      routeMocks({ id: 'm1', externalId: 'x', senderType: 'admin' });
      prisma.message.update.mockResolvedValue({ id: 'm1', deletedAt: new Date() });
      await messaging.deleteMessage('c1', 'm1', 'admin');
      expect(wa.deleteMessage).toHaveBeenCalledWith('a1', '628', 'x', true);
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:deleted', expect.anything());
    });
    it('validateNumber normalises and checks onWhatsApp', async () => {
      wa.isOnWhatsApp.mockResolvedValue(true);
      const r = await chatOps.validateNumber('a1', '0812-345');
      expect(wa.isOnWhatsApp).toHaveBeenCalledWith('a1', '62812345');
      expect(r).toEqual({ phoneNumber: '62812345', exists: true });
    });
    it('throws when the message is not in the conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' } });
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(messaging.deleteMessage('c1', 'm1', 'admin')).rejects.toThrow(NotFoundException);
    });
  });

  describe('startConversation', () => {
    it('normalises 08xx to 628xx, upserts customer, creates an ai_off conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue(null);
      prisma.conversation.create.mockResolvedValue({ id: 'c9', status: 'open' });
      const r = await chatOps.startConversation('a1', '0812-345 678', 'Budi', 'admin1');
      const up = prisma.customer.upsert.mock.calls[0][0];
      expect(up.where.phoneNumber_sourceAccountId.phoneNumber).toBe('62812345678');
      expect(prisma.conversation.create.mock.calls[0][0].data.aiMode).toBe('ai_off');
      expect(prisma.conversation.create.mock.calls[0][0].data.assignedAdminId).toBe('admin1');
      expect(r).toEqual({ id: 'c9', customerId: 'cu1' });
    });
    it('reuses an existing conversation', async () => {
      prisma.conversation.findFirst.mockResolvedValue({ id: 'c5' });
      const r = await chatOps.startConversation('a1', '628123456789', undefined, 'admin1');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
      expect(r.id).toBe('c5');
    });
    it('rejects an invalid phone number', async () => {
      await expect(chatOps.startConversation('a1', '12', undefined, 'admin1')).rejects.toThrow(BadRequestException);
    });
    it('throws when the account is unknown', async () => {
      prisma.whatsappAccount.findUnique.mockResolvedValue(null);
      await expect(chatOps.startConversation('a1', '628123456789', undefined, 'admin1')).rejects.toThrow(NotFoundException);
    });
  });

  it('exportList applies date filters', async () => {
    await service.exportList({ from: '2024-01-01', to: '2024-12-31' });
    const where = prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toHaveProperty('gte');
    expect(where.createdAt).toHaveProperty('lte');
  });
});

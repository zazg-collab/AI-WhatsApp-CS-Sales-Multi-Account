import { NotFoundException } from '@nestjs/common';
import { AiMode, TakeoverStatus } from '@hermes/database';

jest.mock('../wa/wa.service', () => ({ WaService: class {} }));

import { ConversationsService } from './conversations.service';

describe('ConversationsService', () => {
  let service: ConversationsService;
  let prisma: any;
  let wa: any;
  let events: any;

  beforeEach(() => {
    prisma = {
      conversation: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'c1' }),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'm1' }),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'm1', status: 'sent' }),
      },
    };
    wa = {
      sendText: jest.fn().mockResolvedValue('ext1'),
      sendMedia: jest.fn().mockResolvedValue('ext2'),
    };
    events = { emit: jest.fn(), emitToAccount: jest.fn() };
    service = new ConversationsService(prisma, wa, events);
  });

  describe('list', () => {
    it('applies filters', async () => {
      await service.list({ accountId: 'a1', aiMode: AiMode.ai_on, search: 'budi', needsAttention: true });
      const where = prisma.conversation.findMany.mock.calls[0][0].where;
      expect(where.whatsappAccountId).toBe('a1');
      expect(where.aiMode).toBe(AiMode.ai_on);
      expect(where.OR).toBeDefined();
      expect(where.customer).toBeDefined();
    });
  });

  describe('get', () => {
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.get('c1')).rejects.toThrow(NotFoundException);
    });
    it('returns conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1' });
      expect(await service.get('c1')).toEqual({ id: 'c1' });
    });
  });

  describe('send', () => {
    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.send('c1', 'admin', 'hi')).rejects.toThrow(NotFoundException);
    });
    it('sends text, persists message, emits', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      await service.send('c1', 'admin', 'hello');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'hello');
      expect(prisma.message.create).toHaveBeenCalled();
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:new', expect.anything());
    });
  });

  describe('approveDraft', () => {
    it('sends the draft, flips it to sent in place, emits', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'draft text', status: 'pending' });
      await service.approveDraft('c1', 'd1', 'admin');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'draft text');
      const update = prisma.message.update.mock.calls[0][0];
      expect(update.where).toEqual({ id: 'd1' });
      expect(update.data.status).toBe('sent');
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:new', expect.anything());
    });
    it('uses edited text when provided', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'old', status: 'pending' });
      await service.approveDraft('c1', 'd1', 'admin', 'edited reply');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'edited reply');
    });
    it('throws when the draft is missing or already handled', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' } });
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(service.approveDraft('c1', 'd1', 'admin')).rejects.toThrow(NotFoundException);
      expect(wa.sendText).not.toHaveBeenCalled();
    });
  });

  describe('blockDraft', () => {
    it('marks the draft failed and never sends', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1' });
      prisma.message.findFirst.mockResolvedValue({ id: 'd1', content: 'x', status: 'pending' });
      await service.blockDraft('c1', 'd1');
      expect(prisma.message.update.mock.calls[0][0].data.status).toBe('failed');
      expect(wa.sendText).not.toHaveBeenCalled();
      expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:draft-removed', expect.anything());
    });
    it('throws when the draft is missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', whatsappAccountId: 'a1' });
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(service.blockDraft('c1', 'd1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sendMedia', () => {
    it('sends media and persists', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      await service.sendMedia('c1', 'admin', 'image', 'http://x/y.png', 'cap');
      expect(wa.sendMedia).toHaveBeenCalled();
      expect(events.emitToAccount).toHaveBeenCalled();
    });
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.sendMedia('c1', 'a', 'image', 'https://cdn.example.com/u.png')).rejects.toThrow(NotFoundException);
    });
  });

  it('takeover sets admin_takeover + ai_off and remembers previous mode', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ aiMode: AiMode.ai_supervised });
    await service.takeover('c1', 'admin');
    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.takeoverStatus).toBe(TakeoverStatus.admin_takeover);
    expect(data.aiMode).toBe(AiMode.ai_off);
    expect(data.previousAiMode).toBe(AiMode.ai_supervised);
  });

  it('returnToAi restores the previous mode (DR1), not ai_on', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ previousAiMode: AiMode.ai_supervised });
    await service.returnToAi('c1');
    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.aiMode).toBe(AiMode.ai_supervised);
    expect(data.previousAiMode).toBeNull();
  });

  it('returnToAi defaults to ai_draft when no previous mode recorded', async () => {
    prisma.conversation.findUnique.mockResolvedValue({ previousAiMode: null });
    await service.returnToAi('c1');
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
  });

  it('exportList applies date filters', async () => {
    await service.exportList({ from: '2024-01-01', to: '2024-12-31' });
    const where = prisma.conversation.findMany.mock.calls[0][0].where;
    expect(where.createdAt).toHaveProperty('gte');
    expect(where.createdAt).toHaveProperty('lte');
  });
});

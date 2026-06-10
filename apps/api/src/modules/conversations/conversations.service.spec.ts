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
      message: { create: jest.fn().mockResolvedValue({ id: 'm1' }) },
    };
    wa = {
      sendText: jest.fn().mockResolvedValue('ext1'),
      sendMedia: jest.fn().mockResolvedValue('ext2'),
    };
    events = { emit: jest.fn() };
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
      expect(events.emit).toHaveBeenCalledWith('message:new', expect.anything());
    });
  });

  describe('sendMedia', () => {
    it('sends media and persists', async () => {
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'c1', whatsappAccountId: 'a1', customer: { phoneNumber: '628' },
      });
      await service.sendMedia('c1', 'admin', 'image', 'http://x/y.png', 'cap');
      expect(wa.sendMedia).toHaveBeenCalled();
      expect(events.emit).toHaveBeenCalled();
    });
    it('throws when missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.sendMedia('c1', 'a', 'image', 'https://cdn.example.com/u.png')).rejects.toThrow(NotFoundException);
    });
  });

  it('takeover sets admin_takeover + ai_off', async () => {
    await service.takeover('c1', 'admin');
    const data = prisma.conversation.update.mock.calls[0][0].data;
    expect(data.takeoverStatus).toBe(TakeoverStatus.admin_takeover);
    expect(data.aiMode).toBe(AiMode.ai_off);
  });

  it('returnToAi sets ai_on', async () => {
    await service.returnToAi('c1');
    expect(prisma.conversation.update.mock.calls[0][0].data.aiMode).toBe(AiMode.ai_on);
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

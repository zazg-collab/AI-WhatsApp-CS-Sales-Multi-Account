import { LeadStage } from '@hermes/database';
import { AiService } from './ai.service';

describe('AiService', () => {
  let service: AiService;
  let prisma: any;
  let provider: any;
  let prompts: any;
  let notifications: any;

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn() },
      customer: { update: jest.fn() },
    };
    provider = {
      chat: jest.fn(),
      listModels: jest.fn().mockResolvedValue(['m1']),
      getConfig: jest.fn().mockReturnValue({ baseUrl: 'x', defaultModel: 'm' }),
      model: 'default-model',
    };
    prompts = { buildForConversation: jest.fn().mockResolvedValue([]) };
    notifications = { send: jest.fn() };
    service = new AiService(prisma, provider, prompts, notifications);
  });

  it('listModels + config delegate to provider', () => {
    service.listModels();
    expect(provider.listModels).toHaveBeenCalled();
    expect(service.config()).toEqual({ baseUrl: 'x', defaultModel: 'm' });
  });

  describe('generateReply', () => {
    it('returns text + model', async () => {
      provider.chat.mockResolvedValue('hi there');
      const r = await service.generateReply('c1');
      expect(r).toEqual({ text: 'hi there', model: 'default-model' });
    });
    it('uses provided model name', async () => {
      provider.chat.mockResolvedValue('x');
      const r = await service.generateReply('c1', 'gpt-foo');
      expect(r.model).toBe('gpt-foo');
    });
  });

  describe('summarizeChat', () => {
    it('returns summary from provider', async () => {
      prompts.buildForConversation.mockResolvedValue([
        { role: 'system', content: 's' },
        { role: 'user', content: 'u' },
      ]);
      provider.chat.mockResolvedValue('ringkasan');
      expect(await service.summarizeChat('c1')).toBe('ringkasan');
    });
  });

  describe('leadScore', () => {
    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({ customerId: 'cust1' });
      prisma.customer.update.mockResolvedValue({ name: 'Budi', phoneNumber: '628' });
    });

    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.leadScore('c1')).rejects.toThrow('Conversation not found');
    });

    it('parses plain JSON and persists', async () => {
      provider.chat.mockResolvedValue('{"score": 75, "stage": "hot", "reasons": ["tanya harga"]}');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(75);
      expect(r.stage).toBe(LeadStage.hot);
      expect(r.reasons).toEqual(['tanya harga']);
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'cust1' },
        data: { leadScore: 75, leadStage: LeadStage.hot },
      });
    });

    it('tolerates fenced ```json blocks', async () => {
      provider.chat.mockResolvedValue('```json\n{"score": 20, "stage": "cold", "reasons": []}\n```');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(20);
      expect(r.stage).toBe(LeadStage.cold);
    });

    it('tolerates prose-wrapped JSON', async () => {
      provider.chat.mockResolvedValue('Here is my analysis: {"score": 90, "stage": "very_hot", "reasons": ["DP"]} done.');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(90);
      expect(r.stage).toBe(LeadStage.very_hot);
    });

    it('derives stage from score when stage invalid', async () => {
      provider.chat.mockResolvedValue('{"score": 50, "reasons": []}');
      const r = await service.leadScore('c1');
      expect(r.stage).toBe(LeadStage.warm);
    });

    it('clamps score to 0-100', async () => {
      provider.chat.mockResolvedValue('{"score": 999, "stage": "very_hot", "reasons": []}');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(100);
    });

    it('falls back to cold on unparseable output', async () => {
      provider.chat.mockResolvedValue('totally not json');
      const r = await service.leadScore('c1');
      expect(r.score).toBe(0);
      expect(r.stage).toBe(LeadStage.cold);
    });

    it('notifies on hot leads', async () => {
      provider.chat.mockResolvedValue('{"score": 70, "stage": "hot", "reasons": ["a","b"]}');
      await service.leadScore('c1');
      expect(notifications.send).toHaveBeenCalled();
    });

    it('does not notify on cold leads', async () => {
      provider.chat.mockResolvedValue('{"score": 10, "stage": "cold", "reasons": []}');
      await service.leadScore('c1');
      expect(notifications.send).not.toHaveBeenCalled();
    });
  });
});

import { NotFoundException } from '@nestjs/common';
import { BotsService } from './bots.service';

describe('BotsService', () => {
  let service: BotsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      bot: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'b1' }),
        update: jest.fn().mockResolvedValue({ id: 'b1' }),
        delete: jest.fn().mockResolvedValue({ id: 'b1' }),
      },
      persona: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'p1' }),
        update: jest.fn().mockResolvedValue({ id: 'p1' }),
      },
      whatsappAccount: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'acc1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      conversation: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    // delete() runs inside a transaction; pass the same mock through as `tx`.
    prisma.$transaction = jest.fn((fn: any) => fn(prisma));
    service = new BotsService(prisma);
  });

  it('list returns bots', async () => {
    await service.list();
    expect(prisma.bot.findMany).toHaveBeenCalled();
  });

  describe('get', () => {
    it('returns bot', async () => {
      prisma.bot.findUnique.mockResolvedValue({ id: 'b1' });
      expect(await service.get('b1')).toEqual({ id: 'b1' });
    });
    it('throws when missing', async () => {
      prisma.bot.findUnique.mockResolvedValue(null);
      await expect(service.get('b1')).rejects.toThrow(NotFoundException);
    });
  });

  it('create maps defaults', async () => {
    await service.create({ botName: 'Bot' } as any);
    const data = prisma.bot.create.mock.calls[0][0].data;
    expect(data.language).toBe('id');
    expect(data.status).toBe('draft');
  });

  describe('update', () => {
    it('updates after existence check', async () => {
      prisma.bot.findUnique.mockResolvedValue({ id: 'b1' });
      await service.update('b1', { botName: 'New' } as any);
      expect(prisma.bot.update).toHaveBeenCalled();
    });
    it('throws when bot missing', async () => {
      prisma.bot.findUnique.mockResolvedValue(null);
      await expect(service.update('b1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  it('delete removes bot', async () => {
    prisma.bot.findUnique.mockResolvedValue({ id: 'b1' });
    await service.delete('b1');
    expect(prisma.bot.delete).toHaveBeenCalled();
  });

  it('listPersonas + createPersona', async () => {
    await service.listPersonas();
    await service.createPersona({ name: 'P' } as any);
    expect(prisma.persona.create).toHaveBeenCalled();
  });

  describe('updatePersona', () => {
    it('throws when missing', async () => {
      prisma.persona.findUnique.mockResolvedValue(null);
      await expect(service.updatePersona('p1', {} as any)).rejects.toThrow(NotFoundException);
    });
    it('updates when found', async () => {
      prisma.persona.findUnique.mockResolvedValue({ id: 'p1' });
      await service.updatePersona('p1', { name: 'X' } as any);
      expect(prisma.persona.update).toHaveBeenCalled();
    });
  });

  describe('assignToAccount', () => {
    it('throws when account missing', async () => {
      prisma.bot.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.whatsappAccount.findUnique.mockResolvedValue(null);
      await expect(service.assignToAccount('b1', 'acc1')).rejects.toThrow(NotFoundException);
    });
    it('assigns bot to account', async () => {
      prisma.bot.findUnique.mockResolvedValue({ id: 'b1' });
      prisma.whatsappAccount.findUnique.mockResolvedValue({ id: 'acc1' });
      await service.assignToAccount('b1', 'acc1');
      expect(prisma.whatsappAccount.update.mock.calls[0][0].data.assignedBotId).toBe('b1');
    });
  });
});

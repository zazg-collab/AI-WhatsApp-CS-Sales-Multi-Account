import { NotFoundException } from '@nestjs/common';

// Avoid loading the real WaService (it imports the Baileys ESM bundle).
jest.mock('../wa/wa.service', () => ({ WaService: class {} }));

import { FollowUpsService } from './followups.service';

describe('FollowUpsService', () => {
  let service: FollowUpsService;
  let prisma: any;
  let queue: any;
  let wa: any;

  beforeEach(() => {
    prisma = {
      conversation: { findUnique: jest.fn() },
      followUp: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'f1' }),
      },
    };
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job1' }),
      getJob: jest.fn(),
    };
    wa = { sendText: jest.fn().mockResolvedValue(undefined) };
    service = new FollowUpsService(prisma, queue, wa);
  });

  describe('schedule', () => {
    it('throws when conversation missing', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(
        service.schedule({ conversationId: 'c1', scheduledAt: new Date().toISOString(), message: 'hi' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates record and queues a delayed job', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'c1', customerId: 'cust1' });
      prisma.followUp.create.mockResolvedValue({ id: 'f1' });
      const future = new Date(Date.now() + 60000).toISOString();
      await service.schedule({ conversationId: 'c1', scheduledAt: future, message: 'hi' } as any);
      expect(prisma.followUp.create).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalledWith(
        'send-followup',
        { followUpId: 'f1' },
        expect.objectContaining({ jobId: 'followup-f1' }),
      );
      expect(queue.add.mock.calls[0][2].delay).toBeGreaterThan(0);
    });
  });

  describe('cancel', () => {
    it('throws when missing', async () => {
      prisma.followUp.findUnique.mockResolvedValue(null);
      await expect(service.cancel('f1')).rejects.toThrow(NotFoundException);
    });
    it('removes job and marks cancelled', async () => {
      prisma.followUp.findUnique.mockResolvedValue({ id: 'f1' });
      const remove = jest.fn();
      queue.getJob.mockResolvedValue({ remove });
      await service.cancel('f1');
      expect(remove).toHaveBeenCalled();
      expect(prisma.followUp.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { status: 'cancelled' },
      });
    });
    it('still cancels if job removal fails', async () => {
      prisma.followUp.findUnique.mockResolvedValue({ id: 'f1' });
      queue.getJob.mockRejectedValue(new Error('redis down'));
      await service.cancel('f1');
      expect(prisma.followUp.update).toHaveBeenCalled();
    });
  });

  describe('processJob', () => {
    it('no-ops when follow-up missing', async () => {
      prisma.followUp.findUnique.mockResolvedValue(null);
      await service.processJob('f1');
      expect(wa.sendText).not.toHaveBeenCalled();
    });
    it('skips when not scheduled', async () => {
      prisma.followUp.findUnique.mockResolvedValue({ id: 'f1', status: 'cancelled' });
      await service.processJob('f1');
      expect(wa.sendText).not.toHaveBeenCalled();
    });
    it('sends and marks sent', async () => {
      prisma.followUp.findUnique.mockResolvedValue({
        id: 'f1',
        status: 'scheduled',
        messageTemplate: 'hello',
        conversation: {
          whatsappAccount: { id: 'acc1' },
          customer: { phoneNumber: '628' },
        },
      });
      await service.processJob('f1');
      expect(wa.sendText).toHaveBeenCalledWith('acc1', '628', 'hello');
      expect(prisma.followUp.update).toHaveBeenCalledWith({
        where: { id: 'f1' },
        data: { status: 'sent' },
      });
    });
    it('rethrows on send failure', async () => {
      prisma.followUp.findUnique.mockResolvedValue({
        id: 'f1',
        status: 'scheduled',
        messageTemplate: 'x',
        conversation: { whatsappAccount: { id: 'a' }, customer: { phoneNumber: '6' } },
      });
      wa.sendText.mockRejectedValue(new Error('boom'));
      await expect(service.processJob('f1')).rejects.toThrow('boom');
    });
  });
});

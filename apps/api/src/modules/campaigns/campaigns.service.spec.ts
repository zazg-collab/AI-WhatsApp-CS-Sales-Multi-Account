import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CampaignStatus, CampaignRecipientStatus } from '@sentinel/database';

jest.mock('../wa/wa.service', () => ({ WaService: class {} }));

import { CampaignsService } from './campaigns.service';
import { CampaignCrudService } from './campaign-crud.service';
import { CampaignQueueService } from './campaign-queue.service';
import { CampaignSendService } from './campaign-send.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: any;
  let audit: any;
  let wa: any;
  let storage: any;
  let events: any;
  let queue: any;
  let queueSvc: CampaignQueueService;

  beforeEach(() => {
    prisma = {
      campaign: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'cmp1', name: 'C' }),
        update: jest.fn().mockResolvedValue({ id: 'cmp1', name: 'C' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      campaignRecipient: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      customer: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), update: jest.fn() },
      whatsappAccount: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((ps: any[]) => Promise.all(ps)),
    };
    audit = { log: jest.fn().mockResolvedValue({}) };
    wa = { sendText: jest.fn().mockResolvedValue('ext1'), sendMediaBuffer: jest.fn().mockResolvedValue('ext1') };
    storage = { read: jest.fn().mockResolvedValue(Buffer.from('x')) };
    events = { emit: jest.fn(), emitToAccount: jest.fn() };
    queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn(), remove: jest.fn().mockResolvedValue(0) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const settings = { campaign: jest.fn().mockResolvedValue({ defaultRateLimitPerMinute: 6, requireApproval: true }) };
    const crud = new CampaignCrudService(prisma, audit, queue, settings as any, config as any);
    queueSvc = new CampaignQueueService(crud, audit);
    const sendSvc = new CampaignSendService(crud, wa, storage, events, audit);
    service = new CampaignsService(crud, queueSvc, sendSvc);
  });

  describe('list', () => {
    it('rejects invalid status', async () => {
      await expect(service.list('bogus')).rejects.toThrow(BadRequestException);
    });
    it('returns campaigns with stats', async () => {
      prisma.campaign.findMany.mockResolvedValue([{ id: 'cmp1' }]);
      const r = await service.list();
      expect(r[0]).toHaveProperty('recipientStats');
    });
  });

  describe('get', () => {
    it('throws when missing', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);
      await expect(service.get('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('rejects min>max delay', async () => {
      await expect(
        service.create({ name: 'C', humanDelayMinMs: 100, humanDelayMaxMs: 10 } as any, 'u1'),
      ).rejects.toThrow(BadRequestException);
    });
    it('throws when account missing', async () => {
      prisma.whatsappAccount.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ name: 'C', whatsappAccountId: 'a1' } as any, 'u1'),
      ).rejects.toThrow(NotFoundException);
    });
    it('creates campaign', async () => {
      prisma.whatsappAccount.findUnique.mockResolvedValue({ id: 'a1' });
      const r = await service.create({ name: 'C', whatsappAccountId: 'a1', messageTemplate: 'hi' } as any, 'u1');
      expect(r.id).toBe('cmp1');
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('approve', () => {
    it('rejects when not pending_approval', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'cmp1', status: CampaignStatus.draft });
      await expect(service.approve('cmp1', 'u1')).rejects.toThrow(BadRequestException);
    });
    it('approves pending campaign atomically', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'cmp1', status: CampaignStatus.pending_approval, createdById: 'creator',
      });
      await service.approve('cmp1', 'u1');
      expect(prisma.campaign.updateMany).toHaveBeenCalledWith({
        where: { id: 'cmp1', status: CampaignStatus.pending_approval },
        data: { status: CampaignStatus.approved, approvedById: 'u1' },
      });
    });
    it('rejects self-approval by the creator', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'cmp1', status: CampaignStatus.pending_approval, createdById: 'u1',
      });
      await expect(service.approve('cmp1', 'u1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('start', () => {
    it('rejects wrong status', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'cmp1', status: CampaignStatus.draft });
      await expect(service.start('cmp1', 'u1')).rejects.toThrow(BadRequestException);
    });
    it('rejects when no pending recipients', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'cmp1', status: CampaignStatus.approved });
      prisma.campaignRecipient.findMany.mockResolvedValue([]);
      await expect(service.start('cmp1', 'u1')).rejects.toThrow(BadRequestException);
    });
    it('queues jobs for recipients', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'cmp1', status: CampaignStatus.approved, scheduledAt: null,
        rateLimitPerMinute: 6, humanDelayMinMs: 100, humanDelayMaxMs: 200,
      });
      prisma.campaignRecipient.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
      await service.start('cmp1', 'u1');
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(prisma.campaign.update.mock.calls[0][0].data.status).toBe(CampaignStatus.running);
      // Only `pending` recipients — never auto-requeue `failed` (reaped ones may
      // have already delivered; retry-failed is the explicit human path).
      expect(prisma.campaignRecipient.findMany.mock.calls[0][0].where.status).toBe(CampaignRecipientStatus.pending);
    });
    it('clears any stale job under the same jobId before re-adding (H1 retry-after-fail regression)', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'cmp1', status: CampaignStatus.approved, scheduledAt: null,
        rateLimitPerMinute: 6, humanDelayMinMs: 100, humanDelayMaxMs: 200,
      });
      prisma.campaignRecipient.findMany.mockResolvedValue([{ id: 'r1' }]);
      await service.start('cmp1', 'u1');
      expect(queue.remove).toHaveBeenCalledWith('campaign-recipient-r1');
      const removeOrder = queue.remove.mock.invocationCallOrder[0];
      const addOrder = queue.add.mock.invocationCallOrder[0];
      expect(removeOrder).toBeLessThan(addOrder);
    });
    it('marks recipients queued before enqueueing jobs (H2 race regression)', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'cmp1', status: CampaignStatus.approved, scheduledAt: null,
        rateLimitPerMinute: 6, humanDelayMinMs: 100, humanDelayMaxMs: 200,
      });
      prisma.campaignRecipient.findMany.mockResolvedValue([{ id: 'r1' }]);
      await service.start('cmp1', 'u1');
      const updateManyOrder = prisma.campaignRecipient.updateMany.mock.invocationCallOrder[0];
      const addOrder = queue.add.mock.invocationCallOrder[0];
      expect(updateManyOrder).toBeLessThan(addOrder);
    });
    it('rejects a concurrent campaign on the same account (M8)', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'cmp1', status: CampaignStatus.approved, whatsappAccountId: 'a1',
      });
      prisma.campaign.findFirst.mockResolvedValue({ id: 'cmp2', name: 'Other' });
      await expect(service.start('cmp1', 'u1')).rejects.toThrow(/running\/scheduled campaign/);
    });
    it('enforces the env-configured daily send cap (M8)', async () => {
      const config = { get: (k: string) => (k === 'CAMPAIGN_MAX_DAILY_SENDS' ? '2' : undefined) };
      const settings = { campaign: jest.fn().mockResolvedValue({ defaultRateLimitPerMinute: 6, requireApproval: true }) };
      const cappedCrud = new CampaignCrudService(prisma, audit, queue, settings as any, config as any);
      const cappedQueue = new CampaignQueueService(cappedCrud, audit);
      const cappedSend = new CampaignSendService(cappedCrud, wa, storage, events, audit);
      const capped = new CampaignsService(cappedCrud, cappedQueue, cappedSend);
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'cmp1', status: CampaignStatus.approved, whatsappAccountId: 'a1',
      });
      prisma.campaignRecipient.count.mockResolvedValue(2);
      await expect(capped.start('cmp1', 'u1')).rejects.toThrow(/Daily send cap reached.*\(2\/24h\)/);
    });
  });

  describe('pause/cancel/retryFailed', () => {
    beforeEach(() => prisma.campaign.findUnique.mockResolvedValue({ id: 'cmp1', status: CampaignStatus.running }));
    it('pause sets paused', async () => {
      await service.pause('cmp1', 'u1');
      expect(prisma.campaign.update.mock.calls[0][0].data.status).toBe(CampaignStatus.paused);
    });
    it('cancel sets cancelled', async () => {
      await service.cancel('cmp1', 'u1');
      expect(prisma.campaign.update.mock.calls[0][0].data.status).toBe(CampaignStatus.cancelled);
    });
    it('pause rejects a campaign that is already completed', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'cmp1', status: CampaignStatus.completed });
      await expect(service.pause('cmp1', 'u1')).rejects.toThrow(BadRequestException);
    });
    it('retryFailed resets failed recipients', async () => {
      await service.retryFailed('cmp1', 'u1');
      expect(prisma.campaignRecipient.updateMany).toHaveBeenCalled();
    });
  });

  describe('processRecipient', () => {
    it('throws when recipient missing', async () => {
      prisma.campaignRecipient.findUnique.mockResolvedValue(null);
      await expect(service.processRecipient('r1')).rejects.toThrow(NotFoundException);
    });
    it('skips already-sent', async () => {
      prisma.campaignRecipient.findUnique.mockResolvedValue({ id: 'r1', status: CampaignRecipientStatus.sent });
      await service.processRecipient('r1');
      expect(wa.sendText).not.toHaveBeenCalled();
    });
    const queuedRecipient = () => ({
      id: 'r1', status: CampaignRecipientStatus.queued, campaignId: 'cmp1',
      phoneNumber: '628', conversationId: 'conv1',
      customer: { tags: [], status: 'active' },
      conversation: { takeoverStatus: 'ai_active' },
      campaign: { status: CampaignStatus.running, whatsappAccountId: 'a1', messageTemplate: 'hi', createdById: 'u1' },
    });
    it('sends queued recipient on running campaign', async () => {
      prisma.campaignRecipient.findUnique.mockResolvedValue(queuedRecipient());
      prisma.message = { create: jest.fn().mockResolvedValue({ id: 'm1' }) };
      prisma.conversation = { update: jest.fn().mockResolvedValue({}) };
      await service.processRecipient('r1');
      expect(wa.sendText).toHaveBeenCalledWith('a1', '628', 'hi');
      // Claims queued→sending atomically before sending (H3).
      expect(prisma.campaignRecipient.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: CampaignRecipientStatus.queued },
        data: { status: CampaignRecipientStatus.sending, error: null },
      });
      expect(prisma.campaignRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CampaignRecipientStatus.sent }) }),
      );
    });
    it('skips when another worker already claimed the recipient', async () => {
      prisma.campaignRecipient.findUnique.mockResolvedValue(queuedRecipient());
      prisma.campaignRecipient.updateMany.mockResolvedValue({ count: 0 });
      await service.processRecipient('r1');
      expect(wa.sendText).not.toHaveBeenCalled();
    });
    it('marks failed and rethrows when the send itself fails', async () => {
      prisma.campaignRecipient.findUnique.mockResolvedValue(queuedRecipient());
      wa.sendText.mockRejectedValue(new Error('socket closed'));
      await expect(service.processRecipient('r1')).rejects.toThrow('socket closed');
      expect(prisma.campaignRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CampaignRecipientStatus.failed }) }),
      );
    });
    it('still marks sent (never failed) when persistence fails after delivery', async () => {
      prisma.campaignRecipient.findUnique.mockResolvedValue(queuedRecipient());
      prisma.message = { create: jest.fn().mockRejectedValue(new Error('db down')) };
      prisma.conversation = { update: jest.fn() };
      // Must not throw — a job retry would re-send the delivered message.
      await service.processRecipient('r1');
      expect(prisma.campaignRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CampaignRecipientStatus.sent }) }),
      );
      const statuses = prisma.campaignRecipient.update.mock.calls.map((c: any) => c[0].data.status);
      expect(statuses).not.toContain(CampaignRecipientStatus.failed);
    });
    it('skips a recipient who opted out after approval', async () => {
      prisma.campaignRecipient.findUnique.mockResolvedValue({
        id: 'r1', status: CampaignRecipientStatus.queued, campaignId: 'cmp1',
        phoneNumber: '628', conversationId: 'conv1',
        customer: { tags: ['opt_out'], status: 'active' },
        conversation: { takeoverStatus: 'ai_active' },
        campaign: { status: CampaignStatus.running, whatsappAccountId: 'a1', messageTemplate: 'hi', createdById: 'u1' },
      });
      await service.processRecipient('r1');
      expect(wa.sendText).not.toHaveBeenCalled();
      expect(prisma.campaignRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CampaignRecipientStatus.skipped }) }),
      );
    });
    it('skips a recipient whose optedOut boolean was set after enqueue (no tag)', async () => {
      // Keyword auto-detect and the opt-out endpoint set only customer.optedOut,
      // not the opt_out tag — the send-time guard must honor the boolean too.
      const r = queuedRecipient() as any;
      r.customer = { tags: [], status: 'active', optedOut: true };
      prisma.campaignRecipient.findUnique.mockResolvedValue(r);
      await service.processRecipient('r1');
      expect(wa.sendText).not.toHaveBeenCalled();
      expect(prisma.campaignRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: CampaignRecipientStatus.skipped }) }),
      );
    });
  });

  describe('duplicate', () => {
    it('clones a campaign as a new draft and audits', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        id: 'src', name: 'Promo', status: CampaignStatus.completed,
        messageTemplate: 'hi', whatsappAccountId: 'a1', targetFilter: {},
        rateLimitPerMinute: 6, humanDelayMinMs: 100, humanDelayMaxMs: 200,
      });
      prisma.campaign.create.mockResolvedValue({ id: 'copy1', name: 'Promo (copy)' });
      const r = await service.duplicate('src', 'u1');
      expect(r.id).toBe('copy1');
      const data = prisma.campaign.create.mock.calls[0][0].data;
      expect(data.name).toBe('Promo (copy)');
      expect(data.status).toBe(CampaignStatus.draft);
      expect(audit.log).toHaveBeenCalled();
    });
  });

  describe('runScheduledCampaigns', () => {
    it('starts due scheduled campaigns', async () => {
      prisma.campaign.findMany.mockResolvedValueOnce([{ id: 'cmp1', createdById: 'u1' }]);
      const startSpy = jest.spyOn(queueSvc, 'start').mockResolvedValue({} as any);
      await service.runScheduledCampaigns();
      expect(startSpy).toHaveBeenCalledWith('cmp1', 'u1');
    });
    it('never throws when start fails', async () => {
      prisma.campaign.findMany.mockResolvedValueOnce([{ id: 'cmp1', createdById: 'u1' }]);
      jest.spyOn(queueSvc, 'start').mockRejectedValue(new Error('boom'));
      await expect(service.runScheduledCampaigns()).resolves.toBeUndefined();
    });
  });

  describe('optOut/optIn', () => {
    it('optOut marks customer opted out', async () => {
      prisma.customer.findUnique = jest.fn().mockResolvedValue({ id: 'c1' });
      prisma.customer.update = jest.fn().mockResolvedValue({ id: 'c1', optedOut: true });
      await service.optOut('c1', 'u1');
      expect(prisma.customer.update.mock.calls[0][0].data.optedOut).toBe(true);
      expect(audit.log).toHaveBeenCalled();
    });
    it('optIn clears opt-out', async () => {
      prisma.customer.findUnique = jest.fn().mockResolvedValue({ id: 'c1' });
      prisma.customer.update = jest.fn().mockResolvedValue({ id: 'c1', optedOut: false });
      await service.optIn('c1', 'u1');
      expect(prisma.customer.update.mock.calls[0][0].data.optedOut).toBe(false);
    });
    it('optOut throws when customer missing', async () => {
      prisma.customer.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.optOut('x', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('preview', () => {
    it('builds eligible targets, skipping opt-out & risky', async () => {
      prisma.whatsappAccount.findUnique.mockResolvedValue({ id: 'a1' });
      prisma.customer.findMany.mockResolvedValue([
        { id: 'cust1', phoneNumber: '628', name: 'A', tags: [], status: 'active',
          conversations: [{ id: 'conv1', aiMode: 'ai_on', takeoverStatus: 'none' }] },
        { id: 'cust2', phoneNumber: '629', name: 'B', tags: ['opt_out'], status: 'active', conversations: [] },
        { id: 'cust3', phoneNumber: '', name: 'C', tags: [], status: 'active', conversations: [] },
      ]);
      const r = await service.preview('a1', {} as any);
      expect(r.eligibleCount).toBe(1);
      expect(r.skipped.optOut).toBe(1);
      expect(r.skipped.invalidPhone).toBe(1);
    });
    it('rejects an admin scoped to a different account (broken-access-control regression)', async () => {
      prisma.whatsappAccount.findUnique.mockResolvedValue({ id: 'a1' });
      prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'a2' }]);
      const scopedAdmin = { id: 'admin1', role: 'admin' };
      await expect(service.preview('a1', {} as any, scopedAdmin as never)).rejects.toThrow(NotFoundException);
      expect(prisma.customer.findMany).not.toHaveBeenCalled();
    });
  });

  describe('update/submit/duplicate/optOut scope', () => {
    it('update rejects an admin scoped to a different account', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'cmp1', status: 'draft', whatsappAccountId: 'a1' });
      prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'a2' }]);
      const scopedAdmin = { id: 'admin1', role: 'admin' };
      await expect(
        service.update('cmp1', {} as any, 'admin1', scopedAdmin as never),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });
    it('optOut rejects an admin scoped to a different account', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'cust1', sourceAccountId: 'a1', assignedAdminId: null });
      prisma.whatsappAccount.findMany.mockResolvedValue([{ id: 'a2' }]);
      const scopedAdmin = { id: 'admin1', role: 'admin' };
      await expect(service.optOut('cust1', 'admin1', scopedAdmin as never)).rejects.toThrow(NotFoundException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });
});

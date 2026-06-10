import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WaService } from '../wa/wa.service';
import { CreateFollowUpDto } from './dto/create-followup.dto';
import { convertToUTC } from '../../common/timezone.util';

@Injectable()
export class FollowUpsService {
  private readonly logger = new Logger(FollowUpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('follow-ups') private readonly followUpsQueue: Queue,
    private readonly waService: WaService,
  ) {}

  async schedule(dto: CreateFollowUpDto) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    let scheduledAt = new Date(dto.scheduledAt);
    if (dto.timezone) {
      scheduledAt = convertToUTC(dto.scheduledAt, dto.timezone);
    }
    const delay = Math.max(0, scheduledAt.getTime() - Date.now());

    const followUp = await this.prisma.followUp.create({
      data: {
        conversationId: dto.conversationId,
        customerId: conversation.customerId,
        scheduledAt,
        messageTemplate: dto.message,
        status: 'scheduled',
      },
    });

    const job = await this.followUpsQueue.add(
      'send-followup',
      { followUpId: followUp.id },
      { delay, jobId: `followup-${followUp.id}` },
    );

    this.logger.log(`Scheduled follow-up ${followUp.id}, job ${job.id}, delay ${delay}ms`);
    return followUp;
  }

  async list(conversationId: string) {
    return this.prisma.followUp.findMany({
      where: { conversationId },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async cancel(id: string) {
    const followUp = await this.prisma.followUp.findUnique({ where: { id } });
    if (!followUp) throw new NotFoundException('Follow-up not found');

    // Try to remove job from queue
    try {
      const job = await this.followUpsQueue.getJob(`followup-${id}`);
      if (job) await job.remove();
    } catch (e) {
      this.logger.warn(`Could not remove job for follow-up ${id}: ${e}`);
    }

    return this.prisma.followUp.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  async processJob(followUpId: string) {
    const followUp = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      include: {
        conversation: {
          include: {
            whatsappAccount: true,
            customer: true,
          },
        },
      },
    });

    if (!followUp) {
      this.logger.warn(`Follow-up ${followUpId} not found`);
      return;
    }

    if (followUp.status !== 'scheduled') {
      this.logger.log(`Follow-up ${followUpId} is ${followUp.status}, skipping`);
      return;
    }

    const conv = followUp.conversation;
    if (!conv) {
      this.logger.warn(`Follow-up ${followUpId} has no conversation, cancelling`);
      await this.prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'cancelled' },
      });
      return;
    }

    // State re-checks (H6): conditions may have changed between scheduling and
    // firing. Don't message opted-out customers, conversations an admin has
    // taken over, or accounts that aren't connected.
    const customer = conv.customer;
    const blockedTags = ['opt_out', 'blocked', 'do_not_contact'];
    const normalizedTags = (customer.tags ?? []).map((tag) => tag.toLowerCase());
    const optedOut =
      blockedTags.some((tag) => normalizedTags.includes(tag)) ||
      blockedTags.includes((customer.status ?? '').toLowerCase());
    if (optedOut) {
      this.logger.warn(`Follow-up ${followUpId} customer opted out, cancelling`);
      await this.prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'cancelled' },
      });
      return;
    }
    if (
      conv.takeoverStatus === 'admin_takeover' ||
      conv.takeoverStatus === 'waiting_admin'
    ) {
      this.logger.warn(`Follow-up ${followUpId} conversation under admin handling, cancelling`);
      await this.prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'cancelled' },
      });
      return;
    }
    if (!this.waService.isConnected(conv.whatsappAccount.id)) {
      // Account offline — reschedule a short retry instead of dropping/duplicating.
      this.logger.warn(`Follow-up ${followUpId} account not connected, will retry`);
      throw new Error('WhatsApp account not connected; retrying follow-up later');
    }

    // Claim the follow-up atomically (H6): flip scheduled→sent before sending so
    // a concurrent/stalled-recovery job cannot double-send.
    const claim = await this.prisma.followUp.updateMany({
      where: { id: followUpId, status: 'scheduled' },
      data: { status: 'sent' },
    });
    if (claim.count === 0) {
      this.logger.log(`Follow-up ${followUpId} already claimed, skipping`);
      return;
    }

    try {
      await this.waService.sendText(
        conv.whatsappAccount.id,
        customer.phoneNumber,
        followUp.messageTemplate ?? '',
      );
      this.logger.log(`Follow-up ${followUpId} sent successfully`);
    } catch (e) {
      // Roll back the claim so a retry can re-attempt the send.
      await this.prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'scheduled' },
      });
      this.logger.error(`Failed to send follow-up ${followUpId}: ${e}`);
      throw e;
    }
  }
}

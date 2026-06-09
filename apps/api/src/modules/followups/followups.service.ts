import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { WaService } from '../wa/wa.service';
import { CreateFollowUpDto } from './dto/create-followup.dto';

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

    const scheduledAt = new Date(dto.scheduledAt);
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

    try {
      const conv = followUp.conversation!;
      await this.waService.sendText(
        conv.whatsappAccount.id,
        conv.customer.phoneNumber,
        followUp.messageTemplate ?? '',
      );

      await this.prisma.followUp.update({
        where: { id: followUpId },
        data: { status: 'sent' },
      });

      this.logger.log(`Follow-up ${followUpId} sent successfully`);
    } catch (e) {
      this.logger.error(`Failed to send follow-up ${followUpId}: ${e}`);
      throw e;
    }
  }
}

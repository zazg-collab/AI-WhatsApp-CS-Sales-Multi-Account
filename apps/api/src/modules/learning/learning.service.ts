import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MineResult } from './learning.types';
import { LearningMinerService } from './learning-miner.service';
import { LearningReviewService } from './learning-review.service';
import { currentContext } from '../../common/request-context';

/** Thin facade — controller and external modules depend on this. */
@Injectable()
export class LearningService {
  constructor(
    @InjectQueue('learning-mine') private readonly mineQueue: Queue,
    private readonly miner: LearningMinerService,
    private readonly review: LearningReviewService,
  ) {}

  /** Mining a bot's full history can take minutes (sequential LLM calls) —
   *  queued so it survives a dropped HTTP connection and doesn't tie up the
   *  request. Poll via getMineJob(jobId). */
  async queueMineAll(botId: string): Promise<{ jobId: string }> {
    const job = await this.mineQueue.add('mine-bot', { botId, requestId: currentContext().requestId });
    return { jobId: job.id! };
  }

  async getMineJob(jobId: string): Promise<{ status: string; result?: MineResult }> {
    const job = await this.mineQueue.getJob(jobId);
    if (!job) throw new NotFoundException('Mine job not found');
    const state = await job.getState();
    if (state === 'completed') return { status: state, result: job.returnvalue as MineResult };
    if (state === 'failed') throw new NotFoundException(`Mine job failed: ${job.failedReason}`);
    return { status: state };
  }

  mineAll(botId: string): Promise<MineResult> { return this.miner.mineAll(botId); }
  mineKnowledge(botId: string) { return this.miner.mineKnowledge(botId); }
  minePersona(botId: string) { return this.miner.minePersona(botId); }
  minePlaybook(botId: string) { return this.miner.minePlaybook(botId); }
  mineCustomerMemory(botId: string, limit?: number) { return this.miner.mineCustomerMemory(botId, limit); }
  suggestBot(conversationId: string) { return this.miner.suggestBot(conversationId); }

  listProposals(filter: { status?: string; type?: string; botId?: string }) { return this.review.listProposals(filter); }
  getProposal(id: string) { return this.review.getProposal(id); }
  editProposal(id: string, payload: object, title?: string) { return this.review.editProposal(id, payload, title); }
  approve(id: string, userId: string) { return this.review.approve(id, userId); }
  reject(id: string, userId: string) { return this.review.reject(id, userId); }
}

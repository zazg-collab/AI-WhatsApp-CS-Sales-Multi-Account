import { Injectable } from '@nestjs/common';
import { MineResult } from './learning.types';
import { LearningMinerService } from './learning-miner.service';
import { LearningReviewService } from './learning-review.service';

/** Thin facade — controller and external modules depend on this. */
@Injectable()
export class LearningService {
  constructor(
    private readonly miner: LearningMinerService,
    private readonly review: LearningReviewService,
  ) {}

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

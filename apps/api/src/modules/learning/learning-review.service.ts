import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { logAudit } from '../../common/audit.util';
import { CustomerMemoryPayload, KnowledgePayload, PersonaPayload } from './learning.types';

@Injectable()
export class LearningReviewService {
  constructor(private readonly prisma: PrismaService) {}

  listProposals(filter: { status?: string; type?: string; botId?: string }) {
    return this.prisma.learningProposal.findMany({
      where: {
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.botId ? { botId: filter.botId } : {}),
      },
      orderBy: [{ status: 'asc' }, { confidence: 'desc' }, { createdAt: 'desc' }],
      include: {
        bot: { select: { id: true, botName: true } },
        customer: { select: { id: true, name: true, phoneNumber: true } },
      },
    });
  }

  async getProposal(id: string) {
    const p = await this.prisma.learningProposal.findUnique({
      where: { id },
      include: {
        bot: { select: { id: true, botName: true, knowledgeBaseId: true } },
        customer: { select: { id: true, name: true, phoneNumber: true } },
      },
    });
    if (!p) throw new NotFoundException('Learning proposal not found');
    return p;
  }

  async editProposal(id: string, payload: object, title?: string) {
    const p = await this.getProposal(id);
    if (p.status !== 'pending') throw new BadRequestException('Hanya proposal pending yang bisa diedit');
    return this.prisma.learningProposal.update({ where: { id }, data: { payload, ...(title ? { title } : {}) } });
  }

  async approve(id: string, userId: string) {
    const p = await this.getProposal(id);
    if (p.status !== 'pending') throw new BadRequestException('Proposal sudah direview');

    let resultEntityId: string | null = null;

    if (p.type === 'knowledge' || p.type === 'playbook') {
      const kbId = p.bot?.knowledgeBaseId;
      if (!kbId) throw new BadRequestException('Bot belum punya knowledge base — tetapkan dulu sebelum approve.');
      const payload = p.payload as unknown as KnowledgePayload;
      const item = await this.prisma.knowledgeItem.create({
        data: { knowledgeBaseId: kbId, title: p.title, content: payload.content, category: payload.category ?? (p.type === 'playbook' ? 'playbook' : 'mined'), productName: payload.productName, status: 'active' },
      });
      resultEntityId = item.id;
    } else if (p.type === 'persona') {
      const payload = p.payload as unknown as PersonaPayload;
      const persona = await this.prisma.persona.create({
        data: { name: payload.name, soulMd: payload.soulMd, tone: payload.tone, style: payload.style, rules: payload.rules, forbiddenWords: payload.forbiddenWords ?? [] },
      });
      if (p.botId) await this.prisma.bot.update({ where: { id: p.botId }, data: { personaId: persona.id } });
      resultEntityId = persona.id;
    } else if (p.type === 'customer_memory') {
      if (!p.customerId) throw new BadRequestException('Proposal tanpa customer');
      const payload = p.payload as unknown as CustomerMemoryPayload;
      const customer = await this.prisma.customer.findUnique({ where: { id: p.customerId }, select: { notes: true } });
      const header = '— Dari riwayat (AI) —';
      const block = `${header}\n${payload.facts.map((f) => `• ${f}`).join('\n')}`;
      const notes = customer?.notes ? `${customer.notes}\n\n${block}` : block;
      await this.prisma.customer.update({ where: { id: p.customerId }, data: { notes } });
      resultEntityId = p.customerId;
    }

    const updated = await this.prisma.learningProposal.update({ where: { id }, data: { status: 'approved', reviewedById: userId, reviewedAt: new Date(), resultEntityId } });
    await logAudit(this.prisma, { userId, action: 'learning_approve', entityType: 'learning_proposal', entityId: id, newValue: { type: p.type, resultEntityId } });
    return updated;
  }

  async reject(id: string, userId: string) {
    const p = await this.getProposal(id);
    if (p.status !== 'pending') throw new BadRequestException('Proposal sudah direview');
    const updated = await this.prisma.learningProposal.update({ where: { id }, data: { status: 'rejected', reviewedById: userId, reviewedAt: new Date() } });
    await logAudit(this.prisma, { userId, action: 'learning_reject', entityType: 'learning_proposal', entityId: id });
    return updated;
  }
}

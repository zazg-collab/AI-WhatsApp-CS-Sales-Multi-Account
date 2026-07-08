import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuickReplyDto, UpdateQuickReplyDto } from './dto/quick-reply.dto';

@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List templates available when composing in a given account: that account's
   * own templates plus all global (account-less) ones. Without an accountId,
   * returns every template (management view).
   */
  list(accountId?: string) {
    const where: Prisma.QuickReplyWhereInput = accountId
      ? { OR: [{ whatsappAccountId: accountId }, { whatsappAccountId: null }] }
      : {};
    return this.prisma.quickReply.findMany({
      where,
      orderBy: [{ shortcut: 'asc' }, { title: 'asc' }],
      include: { whatsappAccount: { select: { id: true, accountName: true } } },
    });
  }

  async create(dto: CreateQuickReplyDto, userId: string) {
    return this.prisma.quickReply.create({
      data: {
        title: dto.title.trim(),
        content: dto.content,
        shortcut: dto.shortcut?.trim().replace(/^\//, '') || null,
        whatsappAccountId: dto.whatsappAccountId ?? null,
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateQuickReplyDto) {
    await this.getOrThrow(id);
    return this.prisma.quickReply.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.content !== undefined ? { content: dto.content } : {}),
        ...(dto.shortcut !== undefined
          ? { shortcut: dto.shortcut.trim().replace(/^\//, '') || null }
          : {}),
        ...(dto.whatsappAccountId !== undefined
          ? { whatsappAccountId: dto.whatsappAccountId }
          : {}),
      },
    });
  }

  async remove(id: string) {
    await this.getOrThrow(id);
    await this.prisma.quickReply.delete({ where: { id } });
    return { deleted: true };
  }

  private async getOrThrow(id: string) {
    const found = await this.prisma.quickReply.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Quick reply not found');
    return found;
  }
}

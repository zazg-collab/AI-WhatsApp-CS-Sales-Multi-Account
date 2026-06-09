import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  CreateKnowledgeItemDto,
  UpdateKnowledgeItemDto,
} from './dto/knowledge.dto';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  listBases() {
    return this.prisma.knowledgeBase.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
  }

  createBase(dto: CreateKnowledgeBaseDto, userId: string) {
    return this.prisma.knowledgeBase.create({
      data: { ...dto, createdById: userId },
    });
  }

  async getBase(id: string) {
    const base = await this.prisma.knowledgeBase.findUnique({
      where: { id },
      include: { items: { orderBy: { updatedAt: 'desc' } } },
    });
    if (!base) throw new NotFoundException('Knowledge base not found');
    return base;
  }

  updateBase(id: string, dto: UpdateKnowledgeBaseDto, userId: string) {
    return this.prisma.knowledgeBase.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.status === 'active' ? { approvedById: userId } : {}),
      },
    });
  }

  addItem(baseId: string, dto: CreateKnowledgeItemDto) {
    return this.prisma.knowledgeItem.create({
      data: {
        knowledgeBaseId: baseId,
        title: dto.title,
        content: dto.content,
        category: dto.category,
        productName: dto.productName,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        status: dto.status,
      },
    });
  }

  updateItem(id: string, dto: UpdateKnowledgeItemDto) {
    return this.prisma.knowledgeItem.update({
      where: { id },
      data: {
        ...dto,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });
  }
}

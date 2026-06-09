import { Injectable, NotFoundException } from '@nestjs/common';
import { LeadStage, Prisma } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateCustomerDto } from './dto/customers.dto';

interface ListFilters {
  stage?: LeadStage;
  tag?: string;
  search?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters: ListFilters) {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.stage) where.leadStage = filters.stage;
    if (filters.tag) where.tags = { has: filters.tag };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search } },
      ];
    }
    return this.prisma.customer.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        assignedAdmin: { select: { id: true, name: true } },
        sourceAccount: { select: { id: true, accountName: true } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  update(id: string, dto: UpdateCustomerDto) {
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  /** Append a timestamped internal note (PRD 7.10). */
  async addNote(id: string, note: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const entry = `[${stamp}] ${note}`;
    const notes = customer.notes ? `${customer.notes}\n${entry}` : entry;
    return this.prisma.customer.update({ where: { id }, data: { notes } });
  }

  async exportList(filters: ListFilters) {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.stage) where.leadStage = filters.stage;
    if (filters.tag) where.tags = { has: filters.tag };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search } },
      ];
    }
    return this.prisma.customer.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: 10000,
    });
  }

  /**
   * Unified customer timeline (PRD 14.7): messages, Hermes reviews and
   * follow-ups merged into one reverse-chronological feed.
   */
  async timeline(id: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { customerId: id },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);

    const [messages, reviews, followUps] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId: { in: conversationIds } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.hermesReview.findMany({
        where: { conversationId: { in: conversationIds } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.followUp.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const events = [
      ...messages.map((m) => ({
        type: 'message' as const,
        at: m.createdAt,
        data: m,
      })),
      ...reviews.map((r) => ({
        type: 'hermes_review' as const,
        at: r.createdAt,
        data: r,
      })),
      ...followUps.map((f) => ({
        type: 'follow_up' as const,
        at: f.createdAt,
        data: f,
      })),
    ];

    events.sort((a, b) => b.at.getTime() - a.at.getTime());
    return events;
  }
}

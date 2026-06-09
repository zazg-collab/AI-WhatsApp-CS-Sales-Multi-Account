import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface ListFilters {
  userId?: string;
  entity?: string;
  action?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string | undefined,
    action: string,
    entityType?: string,
    entityId?: string,
    meta?: Record<string, unknown>,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
        newValue: meta as never,
      },
    });
  }

  async list(filters: ListFilters) {
    const { userId, entity, action, from, to, limit = 20, offset = 0 } = filters;

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (entity) where.entityType = entity;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [total, data] = await Promise.all([
      this.prisma.auditLog.count({ where: where as never }),
      this.prisma.auditLog.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return { data, total };
  }
}

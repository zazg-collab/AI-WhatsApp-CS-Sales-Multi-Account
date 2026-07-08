import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LeadStage, Prisma } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BulkCustomerActionDto, UpdateCustomerDto } from './dto/customers.dto';
import { allowedAccountIds, type ScopedUser } from '../../common/account-scope.util';
import { MAX_EXPORT_ROWS } from '../../common/export-limits';
import { parseCsvRow } from '../../common/csv.util';

interface ListFilters {
  stage?: LeadStage;
  tag?: string;
  search?: string;
  page?: number;
  limit?: number;
  user?: ScopedUser;
}

/**
 * For a scoped (admin) user, restrict customers to those sourced from an
 * account they can access, plus unassigned-source and directly-assigned ones.
 */
function customerScopeWhere(scope: string[] | null, user?: ScopedUser): Prisma.CustomerWhereInput | null {
  if (scope === null) return null;
  return {
    OR: [
      { sourceAccountId: { in: scope } },
      { sourceAccountId: null },
      ...(user ? [{ assignedAdminId: user.id }] : []),
    ],
  };
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: ListFilters) {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.stage) where.leadStage = filters.stage;
    if (filters.tag) where.tags = { has: filters.tag };
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { phoneNumber: { contains: filters.search } },
      ];
    }
    const scope = await allowedAccountIds(this.prisma, filters.user);
    const scopeWhere = customerScopeWhere(scope, filters.user);
    if (scopeWhere) where.AND = scopeWhere;
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(Math.max(1, filters.limit ?? 50), 100);
    const [total, items] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          assignedAdmin: { select: { id: true, name: true, email: true } },
          whatsappContacts: { select: { name: true, notify: true, verifiedName: true, avatarUrl: true }, take: 1 },
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const mapped = items.map(({ whatsappContacts, ...c }) => {
      const wac = whatsappContacts?.[0];
      return {
        ...c,
        waName: wac?.name ?? wac?.notify ?? wac?.verifiedName ?? null,
        avatarUrl: c.avatarUrl ?? wac?.avatarUrl ?? null,
      };
    });
    return { total, page, limit, items: mapped };
  }

  async get(id: string, user?: ScopedUser) {
    const raw = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        assignedAdmin: { select: { id: true, name: true } },
        sourceAccount: { select: { id: true, accountName: true } },
        whatsappContacts: { select: { name: true, notify: true, verifiedName: true, avatarUrl: true }, take: 1 },
      },
    });
    if (!raw) throw new NotFoundException('Customer not found');
    const scope = await allowedAccountIds(this.prisma, user);
    if (
      scope !== null &&
      raw.sourceAccountId !== null &&
      !scope.includes(raw.sourceAccountId) &&
      raw.assignedAdminId !== user?.id
    ) {
      throw new NotFoundException('Customer not found');
    }
    const { whatsappContacts, ...customer } = raw;
    const wac = whatsappContacts?.[0];
    return {
      ...customer,
      waName: wac?.name ?? wac?.notify ?? wac?.verifiedName ?? null,
      avatarUrl: customer.avatarUrl ?? wac?.avatarUrl ?? null,
    };
  }

  update(id: string, dto: UpdateCustomerDto) {
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  /** Append a timestamped internal note (PRD 7.10). */
  async addNote(id: string, note: string, userId?: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    const notes = this.appendStampedNote(customer.notes, note);
    const updated = await this.prisma.customer.update({ where: { id }, data: { notes } });
    await this.audit.log(userId, 'customer_note_added', 'Customer', id, { note });
    return updated;
  }

  async bulkAction(dto: BulkCustomerActionDto, userId: string) {
    const customerIds = [...new Set(dto.customerIds.map((id) => id.trim()).filter(Boolean))];
    if (customerIds.length === 0) throw new BadRequestException('At least one customer is required');
    if (customerIds.length > 100) {
      throw new BadRequestException('Bulk actions are limited to 100 customers at a time');
    }

    const hasAssignedAdmin = Object.prototype.hasOwnProperty.call(dto, 'assignedAdminId');
    const hasTags = Array.isArray(dto.tags);
    const hasNote = typeof dto.note === 'string' && dto.note.trim().length > 0;
    if (!dto.leadStage && !hasTags && !hasAssignedAdmin && !hasNote) {
      throw new BadRequestException('Select at least one bulk action');
    }

    if (hasAssignedAdmin && dto.assignedAdminId) {
      const admin = await this.prisma.user.findUnique({ where: { id: dto.assignedAdminId } });
      if (!admin) throw new NotFoundException('Assigned admin not found');
      if (admin.role === 'viewer') {
        throw new BadRequestException('Viewer users cannot be assigned as customer admins');
      }
    }

    const customers = await this.prisma.customer.findMany({ where: { id: { in: customerIds } } });
    if (customers.length !== customerIds.length) {
      const found = new Set(customers.map((customer) => customer.id));
      const missing = customerIds.filter((id) => !found.has(id));
      throw new NotFoundException(`Customers not found: ${missing.join(', ')}`);
    }

    const normalizedTags = this.normalizeTags(dto.tags ?? []);
    if (hasTags && normalizedTags.length === 0) {
      throw new BadRequestException('At least one tag is required for tag bulk actions');
    }
    const tagMode = dto.tagMode ?? 'append';
    const note = hasNote ? dto.note!.trim() : undefined;

    const updated = await this.prisma.$transaction(
      customers.map((customer) => {
        const data: Prisma.CustomerUpdateInput = {};
        if (dto.leadStage) data.leadStage = dto.leadStage;
        if (hasAssignedAdmin) {
          data.assignedAdmin = dto.assignedAdminId
            ? { connect: { id: dto.assignedAdminId } }
            : { disconnect: true };
        }
        if (hasTags) data.tags = this.applyTagAction(customer.tags, normalizedTags, tagMode);
        if (note) data.notes = this.appendStampedNote(customer.notes, note);
        return this.prisma.customer.update({
          where: { id: customer.id },
          data,
          include: {
            assignedAdmin: { select: { id: true, name: true, email: true } },
          },
        });
      }),
    );

    await this.audit.log(userId, 'customers_bulk_updated', 'Customer', 'bulk', {
      customerIds,
      count: updated.length,
      leadStage: dto.leadStage,
      assignedAdminId: hasAssignedAdmin ? dto.assignedAdminId ?? null : undefined,
      tagMode: hasTags ? tagMode : undefined,
      tags: hasTags ? normalizedTags : undefined,
      noteAdded: Boolean(note),
    });

    return { updatedCount: updated.length, customers: updated };
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
    const rows = await this.prisma.customer.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      take: MAX_EXPORT_ROWS,
    });
    if (rows.length === MAX_EXPORT_ROWS) {
      this.logger.warn(
        `Customer export hit the ${MAX_EXPORT_ROWS}-row cap; narrow the filters to get a complete export.`,
      );
    }
    return rows;
  }

  /**
   * Unified customer timeline (PRD 14.7): messages, Sentinel reviews and
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
      this.prisma.sentinelReview.findMany({
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
        type: 'sentinel_review' as const,
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

  private appendStampedNote(existingNotes: string | null, note: string) {
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const entry = `[${stamp}] ${note}`;
    return existingNotes ? `${existingNotes}\n${entry}` : entry;
  }

  private normalizeTags(tags: string[]) {
    return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
  }

  private applyTagAction(
    currentTags: string[],
    tags: string[],
    mode: 'replace' | 'append' | 'remove',
  ) {
    if (mode === 'replace') return tags;
    if (mode === 'remove') return currentTags.filter((tag) => !tags.includes(tag));
    return this.normalizeTags([...currentTags, ...tags]);
  }

  async importCsv(buffer: Buffer): Promise<{ created: number; updated: number; skipped: number; errors: string[] }> {
    const MAX_IMPORT = 1000;
    const VALID_STAGES = new Set<string>(Object.values(LeadStage));
    const lines = buffer.toString('utf-8').replace(/\r/g, '').split('\n').filter(Boolean);
    if (lines.length < 2) throw new BadRequestException('CSV must have a header row and at least one data row');
    if (lines.length - 1 > MAX_IMPORT) throw new BadRequestException(`Import limit is ${MAX_IMPORT} rows`);

    const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase().trim());
    const col = (name: string) => header.indexOf(name);
    const phoneIdx = col('phone') !== -1 ? col('phone') : col('phonenumber');
    if (phoneIdx === -1) throw new BadRequestException('CSV must have a "phone" column');

    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvRow(lines[i]);
      const phone = fields[phoneIdx]?.trim();
      if (!phone) { skipped++; continue; }

      const name = col('name') !== -1 ? fields[col('name')]?.trim() || null : null;
      const notes = col('notes') !== -1 ? fields[col('notes')]?.trim() || null : null;
      const rawStage = col('leadstage') !== -1 ? fields[col('leadstage')]?.trim().toLowerCase() : undefined;
      const leadStage = rawStage && VALID_STAGES.has(rawStage) ? (rawStage as LeadStage) : undefined;
      const tagsRaw = col('tags') !== -1 ? fields[col('tags')]?.trim() : '';
      const tags = tagsRaw ? this.normalizeTags(tagsRaw.split(';').map((t) => t.trim()).filter(Boolean)) : undefined;

      try {
        const existing = await this.prisma.customer.findFirst({ where: { phoneNumber: phone }, select: { id: true } });
        if (existing) {
          await this.prisma.customer.update({
            where: { id: existing.id },
            data: { ...(name ? { name } : {}), ...(notes ? { notes } : {}), ...(leadStage ? { leadStage } : {}), ...(tags ? { tags } : {}) },
          });
          updated++;
        } else {
          await this.prisma.customer.create({ data: { phoneNumber: phone, name, notes, ...(leadStage ? { leadStage } : {}), ...(tags ? { tags } : {}) } });
          created++;
        }
      } catch {
        errors.push(`Row ${i + 1}: failed to upsert phone=${phone}`);
      }
    }

    this.logger.log(`CSV import: ${created} created, ${updated} updated, ${skipped} skipped, ${errors.length} errors`);
    return { created, updated, skipped, errors };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { isDirectChatJid, jidToPhone } from './wa.util';

type ContactLike = {
  id?: string;
  jid?: string;
  lid?: string;
  name?: string | null;
  notify?: string | null;
  verifiedName?: string | null;
  imgUrl?: string | null;
  status?: string | null;
};

@Injectable()
export class ContactSyncService {
  private readonly logger = new Logger(ContactSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Merge a duplicate customer into the canonical one (same person, e.g. an
   * @lid-keyed record and the real-phone record created by an admin-started
   * chat). Conversations are folded into the target's existing conversation on
   * the same account (messages re-pointed); otherwise the conversation is
   * re-assigned. Customer-scoped relations follow, then the duplicate is
   * deleted. No-op when from === to.
   */
  async mergeCustomerInto(fromId: string, toId: string) {
    if (fromId === toId) return;
    await this.prisma.$transaction(async (tx) => {
      const fromConvs = await tx.conversation.findMany({ where: { customerId: fromId } });
      for (const fc of fromConvs) {
        const target = await tx.conversation.findFirst({
          where: { customerId: toId, whatsappAccountId: fc.whatsappAccountId },
          orderBy: { createdAt: 'asc' },
        });
        if (target) {
          // The same WhatsApp message can exist in both conversations (same
          // externalId). Drop those duplicates from the source first, or the
          // move violates the unique (conversationId, externalId) constraint.
          const dup = await tx.message.findMany({
            where: { conversationId: target.id, externalId: { not: null } },
            select: { externalId: true },
          });
          const extIds = dup.map((m) => m.externalId).filter((e): e is string => !!e);
          if (extIds.length) {
            await tx.message.deleteMany({ where: { conversationId: fc.id, externalId: { in: extIds } } });
          }
          await tx.message.updateMany({ where: { conversationId: fc.id }, data: { conversationId: target.id } });
          await tx.followUp.updateMany({ where: { conversationId: fc.id }, data: { conversationId: target.id } }).catch(() => undefined);
          await tx.campaignRecipient.updateMany({ where: { conversationId: fc.id }, data: { conversationId: target.id } }).catch(() => undefined);
          await tx.conversation.delete({ where: { id: fc.id } });
        } else {
          await tx.conversation.update({ where: { id: fc.id }, data: { customerId: toId } });
        }
      }
      await tx.followUp.updateMany({ where: { customerId: fromId }, data: { customerId: toId } }).catch(() => undefined);
      await tx.whatsappContact.updateMany({ where: { customerId: fromId }, data: { customerId: toId } }).catch(() => undefined);
      await tx.learningProposal.updateMany({ where: { customerId: fromId }, data: { customerId: toId } }).catch(() => undefined);
      await tx.customer.delete({ where: { id: fromId } });
    });
    this.logger.log(`Merged duplicate customer ${fromId} into ${toId}`);
  }

  /**
   * Best-effort resolve a @lid JID to a real phone number by looking up the
   * whatsapp_contacts table. Returns the phone number if found, or the
   * original @lid string if unresolved.
   */
  async resolveLidPhone(accountId: string, lidJid: string): Promise<string> {
    if (!lidJid.endsWith('@lid')) return lidJid;
    const lid = lidJid.split('@')[0];
    try {
      const contact = await this.prisma.whatsappContact.findFirst({
        where: {
          whatsappAccountId: accountId,
          OR: [{ lid }, { jid: lidJid }],
          phoneNumber: { not: null, notIn: [''] },
          NOT: { phoneNumber: { contains: '@lid' } },
        },
        select: { phoneNumber: true },
        orderBy: { lastSyncedAt: 'desc' },
      });
      if (contact?.phoneNumber) {
        this.logger.debug(`Resolved LID ${lidJid} → ${contact.phoneNumber}`);
        return contact.phoneNumber;
      }
    } catch (err) {
      this.logger.warn(`LID resolution failed for ${lidJid}: ${err}`);
    }
    return lidJid;
  }

  /**
   * Persist a @lid → real phone mapping discovered from a message key, so
   * future lookups resolve without the key and the WA Contacts list shows a
   * real number. Also migrates an existing @lid-keyed customer to the number.
   */
  async recordLidMapping(accountId: string, lidJid: string, phoneNumber: string) {
    if (!lidJid.endsWith('@lid') || !phoneNumber || phoneNumber.endsWith('@lid')) return;
    const lid = lidJid.split('@')[0];

    // Migrate an existing customer that was stored under the raw @lid identifier
    // to the resolved phone, so historical conversations are not orphaned — but
    // only when no customer already owns the real number.
    const lidCustomer = await this.prisma.customer.findUnique({
      where: { phoneNumber_sourceAccountId: { phoneNumber: lidJid, sourceAccountId: accountId } },
      select: { id: true },
    });
    if (lidCustomer) {
      const realCustomer = await this.prisma.customer.findUnique({
        where: { phoneNumber_sourceAccountId: { phoneNumber, sourceAccountId: accountId } },
        select: { id: true },
      });
      if (!realCustomer) {
        // No real-number record yet → just relabel the @lid customer.
        await this.prisma.customer.update({
          where: { id: lidCustomer.id },
          data: { phoneNumber },
        });
        this.logger.log(`Migrated @lid customer ${lidCustomer.id} to phone ${phoneNumber}`);
      } else if (realCustomer.id !== lidCustomer.id) {
        // Both exist (e.g. admin-started chat by number + inbound arriving as
        // @lid): merge the @lid duplicate into the real-number customer.
        await this.mergeCustomerInto(lidCustomer.id, realCustomer.id);
      }
    }

    const customer = await this.prisma.customer.findUnique({
      where: { phoneNumber_sourceAccountId: { phoneNumber, sourceAccountId: accountId } },
      select: { id: true },
    });

    await this.prisma.whatsappContact.upsert({
      where: { whatsappAccountId_jid: { whatsappAccountId: accountId, jid: lidJid } },
      create: {
        whatsappAccountId: accountId,
        customerId: customer?.id,
        jid: lidJid,
        lid,
        phoneNumber,
        lastSyncedAt: new Date(),
      },
      update: {
        ...(customer?.id ? { customerId: customer.id } : {}),
        lid,
        phoneNumber,
        lastSyncedAt: new Date(),
      },
    });
  }

  /** imgUrl = 'unchanged' means Baileys has no update for this field — treat as absent. */
  private resolveImgUrl(raw: string | null | undefined): string | null {
    if (!raw || raw === 'unchanged') return null;
    return raw;
  }

  private async syncOneContact(accountId: string, contact: ContactLike): Promise<void> {
    const rawJid = contact.jid ?? contact.id;
    if (!rawJid) return;
    // Baileys multi-device: history contacts can arrive with device suffix
    // like `628123:20@s.whatsapp.net`. Strip it so isDirectChatJid accepts
    // the JID and the upsert key matches the phonebook entry.
    const jid = rawJid.replace(/^(\d+):\d+(@\S+)$/, '$1$2');
    if (!isDirectChatJid(jid)) return;

    let phoneNumber = jidToPhone(jid);

    if (phoneNumber.endsWith('@lid') && contact.lid) {
      const resolved = await this.prisma.whatsappContact.findFirst({
        where: {
          whatsappAccountId: accountId,
          lid: contact.lid,
          jid: { not: jid, contains: '@s.whatsapp.net' },
          phoneNumber: { not: null, notIn: [''] },
          NOT: { phoneNumber: { contains: '@lid' } },
        },
        select: { phoneNumber: true },
      });
      if (resolved?.phoneNumber) phoneNumber = resolved.phoneNumber;
    }

    const name = contact.name ?? contact.notify ?? contact.verifiedName ?? null;
    const avatarUrl = this.resolveImgUrl(contact.imgUrl);

    const customer = phoneNumber
      ? await this.prisma.customer.findUnique({
          where: { phoneNumber_sourceAccountId: { phoneNumber, sourceAccountId: accountId } },
          select: { id: true, name: true, avatarUrl: true },
        })
      : null;

    await this.prisma.whatsappContact.upsert({
      where: { whatsappAccountId_jid: { whatsappAccountId: accountId, jid } },
      create: {
        whatsappAccountId: accountId,
        customerId: customer?.id,
        jid,
        lid: contact.lid ?? (contact.id?.endsWith('@lid') ? contact.id : null),
        phoneNumber,
        name,
        notify: contact.notify ?? null,
        verifiedName: contact.verifiedName ?? null,
        avatarUrl,
        status: contact.status ?? null,
        raw: contact as Prisma.InputJsonObject,
      },
      update: {
        customerId: customer?.id,
        lid: contact.lid ?? (contact.id?.endsWith('@lid') ? contact.id : undefined),
        phoneNumber,
        name,
        notify: contact.notify ?? null,
        verifiedName: contact.verifiedName ?? null,
        // only overwrite avatarUrl when we actually received one
        ...(avatarUrl !== null ? { avatarUrl } : {}),
        status: contact.status ?? null,
        raw: contact as Prisma.InputJsonObject,
        lastSyncedAt: new Date(),
      },
    });

    if (customer?.id && (name || avatarUrl) && (!customer.name || !customer.avatarUrl)) {
      await this.prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(customer.name ? {} : { name }),
          ...(customer.avatarUrl || !avatarUrl ? {} : { avatarUrl }),
        },
      });
    }

    if (phoneNumber && !phoneNumber.endsWith('@lid') && jid.endsWith('@lid')) {
      const lidCustomer = await this.prisma.customer.findUnique({
        where: { phoneNumber_sourceAccountId: { phoneNumber: jid, sourceAccountId: accountId } },
        select: { id: true },
      });
      if (lidCustomer) {
        const realCustomer = await this.prisma.customer.findUnique({
          where: { phoneNumber_sourceAccountId: { phoneNumber, sourceAccountId: accountId } },
          select: { id: true },
        });
        if (!realCustomer) {
          await this.prisma.customer.update({ where: { id: lidCustomer.id }, data: { phoneNumber } });
          this.logger.log(`Migrated @lid customer ${lidCustomer.id} to phone ${phoneNumber}`);
        } else if (realCustomer.id !== lidCustomer.id) {
          await this.mergeCustomerInto(lidCustomer.id, realCustomer.id);
        }
      }
    }
  }

  async syncContacts(accountId: string, contacts: ContactLike[] = []) {
    // Normalize device-suffix before the isDirectChatJid filter — same as syncOneContact does.
    const valid = contacts.filter(c => {
      const raw = c.jid ?? c.id;
      if (!raw) return false;
      const jid = raw.replace(/^(\d+):\d+(@\S+)$/, '$1$2');
      return isDirectChatJid(jid);
    });
    const BATCH = 10;
    for (let i = 0; i < valid.length; i += BATCH) {
      await Promise.allSettled(
        valid.slice(i, i + BATCH).map(c =>
          this.syncOneContact(accountId, c).catch(err =>
            this.logger.warn(`Contact sync failed for ${c.jid ?? c.id}: ${err}`),
          ),
        ),
      );
    }
    return valid.length;
  }

  /**
   * Backfill profile-photo URLs for contacts that don't have one yet.
   * WA rate-limits this, so we fetch 1 per 1.5 s and cap at maxFetch per run.
   * Pass a fetchPhoto function that calls sock.profilePictureUrl(jid, 'image').
   */
  async backfillAvatars(
    accountId: string,
    fetchPhoto: (jid: string) => Promise<string | null | undefined>,
    maxFetch = 100,
  ): Promise<void> {
    const contacts = await this.prisma.whatsappContact.findMany({
      where: { whatsappAccountId: accountId, avatarUrl: null },
      select: { jid: true, customerId: true },
      take: maxFetch,
      orderBy: { lastSyncedAt: 'desc' },
    });
    this.logger.log(`Avatar backfill: ${contacts.length} contacts for account ${accountId}`);
    for (const c of contacts) {
      await new Promise(r => setTimeout(r, 1500));
      const url = await fetchPhoto(c.jid).catch(() => null);
      if (!url) continue;
      await this.prisma.whatsappContact.updateMany({
        where: { whatsappAccountId: accountId, jid: c.jid },
        data: { avatarUrl: url },
      });
      if (c.customerId) {
        await this.prisma.customer.updateMany({
          where: { id: c.customerId, avatarUrl: null },
          data: { avatarUrl: url },
        });
      }
    }
    this.logger.log(`Avatar backfill done for account ${accountId}`);
  }

  /**
   * Fill in customer.name for customers whose name is null but whose linked
   * whatsappContact has a name/notify/verifiedName. Runs after history sync.
   */
  async backfillNames(accountId: string): Promise<void> {
    const contacts = await this.prisma.whatsappContact.findMany({
      where: {
        whatsappAccountId: accountId,
        customerId: { not: null },
        OR: [
          { name: { not: null } },
          { notify: { not: null } },
          { verifiedName: { not: null } },
        ],
      },
      select: { customerId: true, name: true, notify: true, verifiedName: true },
    });
    const toUpdate = contacts
      .map(c => ({
        id: c.customerId as string,
        name: c.name ?? c.notify ?? c.verifiedName ?? null,
      }))
      .filter(c => c.name);
    if (!toUpdate.length) return;
    let filled = 0;
    await Promise.allSettled(
      toUpdate.map(async c => {
        const updated = await this.prisma.customer.updateMany({
          where: { id: c.id, name: null },
          data: { name: c.name },
        });
        if (updated.count > 0) filled++;
      }),
    );
    this.logger.log(`Name backfill: ${filled}/${toUpdate.length} customers updated for account ${accountId}`);
  }

  async list(params: {
    accountId?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(Math.max(1, params.limit ?? 50), 200);
    const where: Prisma.WhatsappContactWhereInput = {
      ...(params.accountId ? { whatsappAccountId: params.accountId } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { notify: { contains: params.search, mode: 'insensitive' } },
              { verifiedName: { contains: params.search, mode: 'insensitive' } },
              { phoneNumber: { contains: params.search } },
              { jid: { contains: params.search } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.whatsappContact.findMany({
        where,
        include: {
          whatsappAccount: { select: { id: true, accountName: true, phoneNumber: true } },
          customer: { select: { id: true, name: true, leadStage: true, tags: true } },
        },
        orderBy: [{ name: 'asc' }, { phoneNumber: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.whatsappContact.count({ where }),
    ]);
    return { items, total, page, limit };
  }
}

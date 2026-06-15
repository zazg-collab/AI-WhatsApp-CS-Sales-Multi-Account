import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MessageType, SenderType } from '@hermes/database';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaStorageService } from '../media/media-storage.service';
import { WaService } from '../wa/wa.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { extForMimetype } from '../wa/wa.util';
import { logAudit } from '../../common/audit.util';
import { CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';

type MediaKind = 'image' | 'video' | 'document';

/** Coarse media kind from a MIME type (audio is treated as a document here). */
function kindForMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Hesitation/skeptic cues. When a customer says these, a testimonial asset is
 * worth offering even if no explicit trigger keyword matched — that's exactly
 * when social proof helps convert.
 */
const HESITATION_CUES = [
  'ragu',
  'yakin',
  'beneran',
  'bener ga',
  'real',
  'asli',
  'penipuan',
  'penipu',
  'aman ga',
  'aman kah',
  'bukti',
  'testimoni',
  'terpercaya',
  'percaya',
  'takut',
];

const MAX_SUGGESTIONS = 4;

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
  ) {}

  list(filter: { purpose?: string; status?: string }) {
    return this.prisma.asset.findMany({
      where: {
        ...(filter.purpose ? { purpose: filter.purpose } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    dto: CreateAssetDto,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
    userId: string,
  ) {
    const { key, url } = await this.storage.save(file.buffer, extForMimetype(file.mimetype));
    const asset = await this.prisma.asset.create({
      data: {
        kind: kindForMime(file.mimetype),
        purpose: dto.purpose,
        title: dto.title,
        caption: dto.caption,
        marketplaceUrl: dto.marketplaceUrl,
        tags: dto.tags ?? [],
        triggerKeywords: dto.triggerKeywords ?? [],
        storageKey: key,
        mediaUrl: url,
        mimeType: file.mimetype,
        createdById: userId,
      },
    });
    await logAudit(this.prisma, {
      userId,
      action: 'asset_create',
      entityType: 'asset',
      entityId: asset.id,
      newValue: { title: asset.title, purpose: asset.purpose, kind: asset.kind },
    });
    return asset;
  }

  async update(id: string, dto: UpdateAssetDto) {
    await this.getOrThrow(id);
    return this.prisma.asset.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string) {
    await this.getOrThrow(id);
    await this.prisma.asset.delete({ where: { id } });
    await logAudit(this.prisma, {
      userId,
      action: 'asset_delete',
      entityType: 'asset',
      entityId: id,
    });
    return { ok: true };
  }

  /**
   * Send a library asset into a conversation. Bytes are read from storage and
   * streamed straight to WhatsApp (no admin-supplied URL → no SSRF surface).
   * For product assets the marketplace link is appended to the caption so the
   * customer gets a real, curated link (never one fabricated by the model).
   */
  async sendToConversation(assetId: string, conversationId: string, adminId: string) {
    const asset = await this.getOrThrow(assetId);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const buffer = await this.storage.read(asset.storageKey).catch(() => {
      throw new BadRequestException('Asset file is missing from storage');
    });

    let caption = asset.caption ?? asset.title;
    if (asset.purpose === 'product' && asset.marketplaceUrl) {
      caption = `${caption}\n${asset.marketplaceUrl}`;
    }

    const externalId = await this.wa.sendMediaBuffer(
      conversation.whatsappAccountId,
      conversation.customer.phoneNumber,
      asset.kind as MediaKind,
      buffer,
      asset.mimeType,
      caption,
      asset.title,
    );

    const typeMap: Record<MediaKind, MessageType> = {
      image: MessageType.image,
      video: MessageType.video,
      document: MessageType.document,
    };
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: SenderType.admin,
        senderId: adminId,
        messageType: typeMap[asset.kind as MediaKind] ?? MessageType.document,
        content: caption,
        mediaUrl: asset.mediaUrl,
        status: 'sent',
        externalId,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessage: `[${asset.kind}] ${asset.title}`, lastMessageAt: new Date() },
    });
    this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', {
      conversationId,
      message,
    });
    await logAudit(this.prisma, {
      userId: adminId,
      action: 'asset_send',
      entityType: 'conversation',
      entityId: conversationId,
      newValue: { assetId, title: asset.title },
    });
    return message;
  }

  /**
   * Suggest assets to send for a conversation, based on the customer's recent
   * messages. Deterministic and token-free: matches each active asset's
   * triggerKeywords, and offers testimonials when the customer sounds hesitant.
   * Advisory only — the admin still sends. The model never invents assets.
   */
  async suggest(conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const recent = await this.prisma.message.findMany({
      where: { conversationId, senderType: SenderType.customer, content: { not: '' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { content: true },
    });
    const text = recent.map((m) => (m.content ?? '').toLowerCase()).join(' ');
    if (!text.trim()) return [];

    const assets = await this.prisma.asset.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    const hesitant = HESITATION_CUES.some((c) => text.includes(c));
    const suggestions: Array<{
      id: string;
      title: string;
      kind: string;
      purpose: string;
      reason: string;
    }> = [];

    for (const a of assets) {
      const matched = a.triggerKeywords.find((k) => k && text.includes(k.toLowerCase()));
      let reason = '';
      if (matched) reason = `Cocok dengan "${matched}"`;
      else if (a.purpose === 'testimonial' && hesitant) reason = 'Pelanggan tampak ragu — kirim testimoni';
      if (!reason) continue;
      suggestions.push({ id: a.id, title: a.title, kind: a.kind, purpose: a.purpose, reason });
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
    return suggestions;
  }

  private async getOrThrow(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
}

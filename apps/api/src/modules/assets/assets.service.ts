import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMode, MessageType, SenderType, TakeoverStatus } from '@sentinel/database';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaStorageService } from '../media/media-storage.service';
import { WaService } from '../wa/wa.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { extForMimetype } from '../wa/wa.util';
import { logAudit } from '../../common/audit.util';
import { assertConversationScope, type ScopedUser } from '../../common/account-scope.util';
import { CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';

type MediaKind = 'image' | 'video' | 'document';

/** Coarse media kind from a MIME type (audio is treated as a document here). */
function kindForMime(mime: string): MediaKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Loose intent cues per asset `purpose`. When a customer's recent messages
 * match a cue here (even with no exact trigger-keyword hit), the matching
 * purpose is worth suggesting. This is the ADVISORY path only — `suggest()`
 * surfaces these to an admin to click-send (AssetBar); `maybeAutoSend` never
 * reads this, by design (see its docstring: exact keyword match only).
 */
const INTENT_CUES: Record<string, string[]> = {
  // Skepticism/trust-seeking → social proof helps convert.
  testimonial: [
    'ragu', 'yakin', 'beneran', 'bener ga', 'real', 'asli', 'penipuan',
    'penipu', 'aman ga', 'aman kah', 'bukti', 'testimoni', 'terpercaya',
    'percaya', 'takut',
  ],
  // Price/availability questions → a product card with live price/stock helps.
  product: [
    'harga', 'berapa', 'brp', 'price', 'stok', 'stock', 'ready', 'tersedia',
    'available', 'sisa', 'beli', 'order', 'mau pesan',
  ],
  // How-it-works/spec questions → a brochure/spec sheet clarifies.
  brochure: [
    'gimana caranya', 'bagaimana cara', 'cara pakai', 'cara kerja', 'spek',
    'spesifikasi', 'detail produk', 'how to', 'how does it work',
  ],
};

/** Human-readable reason per purpose, shown in the admin's AssetBar suggestion. */
const INTENT_REASON: Record<string, string> = {
  testimonial: 'Pelanggan tampak ragu — kirim testimoni',
  product: 'Pelanggan tanya harga/stok — kirim kartu produk',
  brochure: 'Pelanggan tanya cara kerja/spesifikasi — kirim brosur',
};

/** Reverse-index: each cue → which purpose it suggests. Built once at module load. */
const CUE_TO_PURPOSE: Array<{ cue: string; purpose: string }> = Object.entries(
  INTENT_CUES,
).flatMap(([purpose, cues]) => cues.map((cue) => ({ cue, purpose })));

const MAX_SUGGESTIONS = 4;

/**
 * Pure intent detector: scans lowercased customer text for the first matching
 * cue per category, returns which asset `purpose` each implies. Deterministic,
 * zero LLM cost, exported for unit testing. Advisory-only by construction —
 * callers decide what to do with the result (suggest() shows it to an admin;
 * nothing here sends anything).
 */
export function detectAssetIntent(text: string): Array<{ purpose: string; cue: string }> {
  const hay = (text ?? '').toLowerCase();
  if (!hay.trim()) return [];
  const seen = new Set<string>();
  const hits: Array<{ purpose: string; cue: string }> = [];
  for (const { cue, purpose } of CUE_TO_PURPOSE) {
    if (seen.has(purpose)) continue; // one reason per purpose is enough
    if (hay.includes(cue)) {
      hits.push({ purpose, cue });
      seen.add(purpose);
    }
  }
  return hits;
}

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);
  /** Global kill-switch for bot auto-send. Off unless ASSET_AUTOSEND_ENABLED=true. */
  private readonly autoSendEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: MediaStorageService,
    private readonly wa: WaService,
    private readonly events: EventsGateway,
    config: ConfigService,
  ) {
    this.autoSendEnabled = config.get<string>('ASSET_AUTOSEND_ENABLED') === 'true';
  }

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
        autoSend: dto.autoSend === 'true',
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
  async sendToConversation(assetId: string, conversationId: string, adminId: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, conversationId, user);
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
  async suggest(conversationId: string, user?: ScopedUser) {
    await assertConversationScope(this.prisma, conversationId, user);
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

    // purpose → why (first matching cue's label), for the fallback path below.
    const intentByPurpose = new Map(
      detectAssetIntent(text).map((h) => [h.purpose, h.cue]),
    );
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
      if (matched) {
        reason = `Cocok dengan "${matched}"`;
      } else if (intentByPurpose.has(a.purpose)) {
        reason = INTENT_REASON[a.purpose] ?? `Relevan dengan pertanyaan customer ("${intentByPurpose.get(a.purpose)}")`;
      }
      if (!reason) continue;
      suggestions.push({ id: a.id, title: a.title, kind: a.kind, purpose: a.purpose, reason });
      if (suggestions.length >= MAX_SUGGESTIONS) break;
    }
    return suggestions;
  }

  /**
   * Bot auto-send (ai_on only). Heavily gated and OFF by default:
   *   1. global flag ASSET_AUTOSEND_ENABLED must be true,
   *   2. conversation must be ai_on and not under admin takeover,
   *   3. only assets explicitly whitelisted (autoSend=true) are eligible,
   *   4. only an EXACT trigger-keyword match (not the loose hesitation cue),
   *   5. never re-send the same asset to a conversation (anti-spam).
   * Returns the asset it sent, or null. Fire-and-forget from the reply path.
   */
  async maybeAutoSend(conversationId: string): Promise<{ id: string; title: string } | null> {
    if (!this.autoSendEnabled) return null;

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { customer: true },
    });
    if (!conversation) return null;
    if (conversation.aiMode !== AiMode.ai_on) return null;
    if (conversation.takeoverStatus === TakeoverStatus.admin_takeover) return null;

    const last = await this.prisma.message.findFirst({
      where: { conversationId, senderType: SenderType.customer, content: { not: '' } },
      orderBy: { createdAt: 'desc' },
      select: { content: true },
    });
    const text = (last?.content ?? '').toLowerCase();
    if (!text.trim()) return null;

    const assets = await this.prisma.asset.findMany({
      where: { status: 'active', autoSend: true },
      orderBy: { createdAt: 'desc' },
    });
    const match = assets.find((a) => a.triggerKeywords.some((k) => k && text.includes(k.toLowerCase())));
    if (!match) return null;

    // Anti-spam: never send the same asset twice in one conversation.
    const already = await this.prisma.message.findFirst({
      where: { conversationId, mediaUrl: match.mediaUrl },
      select: { id: true },
    });
    if (already) return null;

    try {
      const buffer = await this.storage.read(match.storageKey);
      let caption = match.caption ?? match.title;
      if (match.purpose === 'product' && match.marketplaceUrl) caption = `${caption}\n${match.marketplaceUrl}`;

      const externalId = await this.wa.sendMediaBuffer(
        conversation.whatsappAccountId,
        conversation.customer.phoneNumber,
        match.kind as 'image' | 'document' | 'audio' | 'video',
        buffer,
        match.mimeType,
        caption,
        match.title,
      );
      const message = await this.prisma.message.create({
        data: {
          conversationId,
          senderType: SenderType.ai,
          messageType: match.kind as MessageType,
          content: caption,
          mediaUrl: match.mediaUrl,
          status: 'sent',
          externalId,
          aiGenerated: true,
        },
      });
      this.events.emitToAccount(conversation.whatsappAccountId, 'message:new', { conversationId, message });
      await logAudit(this.prisma, {
        action: 'asset_auto_send',
        entityType: 'conversation',
        entityId: conversationId,
        newValue: { assetId: match.id, title: match.title },
      });
      this.logger.log(`Auto-sent asset "${match.title}" to conversation ${conversationId}`);
      return { id: match.id, title: match.title };
    } catch (err) {
      this.logger.warn(`Auto-send failed for ${conversationId}: ${err}`);
      return null;
    }
  }

  private async getOrThrow(id: string) {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found');
    return asset;
  }
}

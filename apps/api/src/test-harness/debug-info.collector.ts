import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingService } from '../modules/shipping/shipping.service';
import type { DebugSnapshot } from './types';

/**
 * >>> ANGGA — F3c (2026-08-09, cowork): panel debug akhirnya berisi DATA ASLI.
 *
 * Sebelum ini kelas ini stub: untuk provider non-mock ia mengembalikan snapshot
 * KOSONG (`status:'normal'`, `tokens:{}`, `items:[]`) — JSDoc-nya sendiri
 * menulis "Fase 2: extract dari getGroundingText, OrderContextEvent,
 * resolvePriceTokens, computeFunnelMeta", rencana yang tidak pernah dibangun.
 * Alasannya bukan malas: sebelum F3b sesi uji hidup di tabel terpisah, jadi
 * `conversationId` yang dibutuhkan sumber-sumber itu memang tidak ada.
 *
 * Sesudah F3b percakapan uji adalah baris `Conversation` sungguhan, jadi datanya
 * tinggal dibaca. Semua pembacaan di sini WAJIB bebas efek samping — panel debug
 * tidak boleh mengubah keadaan yang sedang ia amati.
 */
@Injectable()
export class DebugInfoCollector {
  private readonly logger = new Logger(DebugInfoCollector.name);

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly shipping?: ShippingService,
  ) {}

  async collectDebugInfo(
    sessionId: string,
    aiReplyText: string,
    executedTools?: any[],
    provider = 'mock',
    conversationId?: string,
  ): Promise<DebugSnapshot> {
    let snap: DebugSnapshot;
    if (provider === 'mock') {
      snap = this.mockDebugSnapshot(aiReplyText);
    } else {
      snap = { status: 'normal', funnelMode: 'normal', tokens: {}, gateWarnings: [], items: [] };
      if (conversationId) await this.isiDariPercakapan(snap, conversationId);
    }

    if (executedTools && executedTools.length > 0) {
      snap.toolCalls = executedTools;
      snap.status = 'tool_executed';
    }
    return snap;
  }

  /** Semua sumber dibungkus try/catch sendiri-sendiri: satu sumber gagal tidak
   *  boleh mengosongkan seluruh panel — dan TIDAK boleh menggagalkan balasan,
   *  karena ini cuma alat pengamat. */
  private async isiDariPercakapan(snap: DebugSnapshot, conversationId: string) {
    try {
      const st = this.shipping?.debugState(conversationId);
      if (st) {
        if (st.funnelStep) {
          snap.funnelMode = (['total', 'patokan', 'closing', 'closing_followup'].includes(st.funnelStep)
            ? st.funnelStep
            : 'normal') as DebugSnapshot['funnelMode'];
          snap.status = `funnel:${st.funnelStep}`;
        }
        snap.tokens = st.tokens ?? {};
        const q = st.quote;
        if (q) {
          snap.kotaTujuan = `${q.city}, ${q.province}`;
          snap.ongkir = {
            amount: q.transferTotal - q.goodsTotal,
            courier: q.transferCourier,
            service: q.codCourier ? 'transfer+cod' : 'transfer',
          };
          snap.items = (q.items ?? []).map((it) => ({
            name: it.name,
            qty: it.qty,
            price: q.items?.length ? Math.round(q.goodsTotal / Math.max(1, q.items.length)) : 0,
          }));
        }
      }
    } catch (err) {
      this.logger.warn(`Debug: keadaan ongkir tak terbaca (${conversationId}): ${err}`);
    }

    try {
      const rows = await (this.prisma as any)?.orderContextEvent?.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { type: true, source: true, payload: true, createdAt: true },
      });
      if (rows?.length) snap.orderContextLog = rows;
    } catch (err) {
      this.logger.warn(`Debug: memori order tak terbaca (${conversationId}): ${err}`);
    }

    try {
      const draft = await this.prisma?.message.findFirst({
        where: { conversationId, moneyGateIssues: { isEmpty: false } },
        orderBy: { createdAt: 'desc' },
        select: { moneyGateIssues: true },
      });
      if (draft?.moneyGateIssues?.length) {
        snap.gateWarnings = [...snap.gateWarnings, ...draft.moneyGateIssues];
      }
    } catch (err) {
      this.logger.warn(`Debug: gerbang uang tak terbaca (${conversationId}): ${err}`);
    }
  }

  /** MOCK snapshot — jalur provider 'mock', dipertahankan apa adanya. */
  private mockDebugSnapshot(replyText: string): DebugSnapshot {
    return {
      status: 'mock',
      funnelMode: 'normal',
      tokens: {},
      gateWarnings: [],
      items: [],
      kotaTujuan: undefined,
      ongkir: undefined,
      orderContextLog: [],
      ...(replyText ? {} : {}),
    };
  }
}

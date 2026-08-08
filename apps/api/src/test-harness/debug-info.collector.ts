/**
 * Debug Info Collector
 * 
 * Extracts debug information dari Sentinel AI pipeline state:
 * - Funnel mode (normal, total, patokan, closing)
 * - Kota tujuan & ongkir
 * - Resolved items
 * - Token values
 * - Money Gate warnings
 * - Order Context Log
 * 
 * Fase 1 (MVP): MOCK snapshots untuk test UI rendering.
 * Fase 2 (Real Integration): Hook ShippingService internal state.
 * 
 * Created: 2026-08-08
 */

import { Injectable } from '@nestjs/common';
import type { DebugSnapshot } from './types';

@Injectable()
export class DebugInfoCollector {
  /**
   * Collect debug snapshot untuk test session message
   * 
   * Fase 1: MOCK snapshots
   * Fase 2: Extract dari ShippingService.getGroundingText(),
   *         OrderContextEvent, resolvePriceTokens(), computeFunnelMeta()
   */
  async collectDebugInfo(
    sessionId: string,
    aiReplyText: string,
    executedTools?: any[],
    provider: string = 'mock'
  ): Promise<DebugSnapshot> {
    
    // Only use mock snapshot if provider is mock
    let snap: DebugSnapshot;
    if (provider === 'mock') {
      snap = this.mockDebugSnapshot(aiReplyText);
    } else {
      snap = {
        status: 'normal',
        funnelMode: 'normal',
        tokens: {},
        gateWarnings: [],
        items: [],
      };
    }
    
    if (executedTools && executedTools.length > 0) {
      snap.toolCalls = executedTools;
      snap.status = 'tool_executed';
    }
    
    return snap;
  }

  /**
   * MOCK debug snapshot (Fase 1 MVP)
   * 
   * Returns canned debug info untuk test Test Harness debug panel
   * tanpa perlu integration dengan real Sentinel AI pipeline.
   */
  private mockDebugSnapshot(replyText: string): DebugSnapshot {
    // Detect scenario dari reply text (simple heuristic)
    const isQuotingOngkir = replyText.includes('ongkir') || replyText.includes('Ongkir');
    const isClosing = replyText.includes('transfer') || replyText.includes('COD');
    const hasItems = replyText.includes('Golok') || replyText.includes('x2');

    if (isClosing) {
      // Closing scenario
      return {
        status: 'closing',
        funnelMode: 'closing',
        kotaTujuan: 'Mataram, NTB',
        ongkir: {
          amount: 50000,
          courier: 'JNE',
          service: 'REG',
        },
        items: [
          { name: 'Golok Sedang', qty: 2, price: 250000 },
        ],
        tokens: {
          '{{namaBarang}}': 'Golok Sedang',
          '{{qty}}': '2',
          '{{harga}}': 'Rp250.000',
          '{{ongkir}}': 'Rp50.000',
          '{{total}}': 'Rp550.000',
        },
        gateWarnings: [],
      };
    }

    if (isQuotingOngkir) {
      // Patokan scenario (quote ongkir)
      return {
        status: 'patokan',
        funnelMode: 'patokan',
        kotaTujuan: 'Mataram, NTB',
        ongkir: {
          amount: 50000,
          courier: 'JNE',
          service: 'REG',
        },
        items: [
          { name: 'Golok Sedang', qty: 2, price: 250000 },
        ],
        tokens: {
          '{{namaBarang}}': 'Golok Sedang',
          '{{qty}}': '2',
          '{{harga}}': '[HIDDEN]',
          '{{ongkir}}': 'Rp50.000',
        },
        gateWarnings: [],
      };
    }

    if (hasItems) {
      // Normal scenario (item selected, tapi belum ada kota)
      return {
        status: 'normal',
        funnelMode: 'normal',
        kotaTujuan: undefined,
        ongkir: undefined,
        items: [
          { name: 'Golok Sedang', qty: 0, price: 250000 },
        ],
        tokens: {
          '{{namaBarang}}': 'Golok Sedang',
          '{{harga}}': '[HIDDEN]',
        },
        gateWarnings: [],
      };
    }

    // Default: early conversation (belum ada context)
    return {
      status: 'normal',
      funnelMode: 'normal',
      kotaTujuan: undefined,
      ongkir: undefined,
      items: [],
      tokens: {},
      gateWarnings: [],
    };
  }
}

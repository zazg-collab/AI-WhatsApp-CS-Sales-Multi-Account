/**
 * Test Harness Types
 * 
 * Type definitions untuk Sentinel Web Chat Simulator (v2).
 * Port-safe design — no port changes, isolated database, same NestJS app.
 * 
 * Created: 2026-08-08
 */

export interface TestSession {
  id: string;
  name: string;
  provider: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  debugInfo?: DebugSnapshot;
}

import type { JejakPanggilanAi, ringkasJejakAi } from '../common/ai-call-trace';

export interface DebugSnapshot {
  status: string;
  /** >>> ANGGA — F3 (2026-08-09): `closing_followup` ditambahkan; step itu lahir di
   *  `e4415a5` (pasca-rollback) dan sudah ada di union `computeFunnelMeta`
   *  (`shipping.service.ts`), tapi tipe di tester tertinggal. <<< */
  funnelMode: 'normal' | 'total' | 'patokan' | 'closing' | 'closing_followup';
  /** >>> ANGGA — diagnostik (2026-08-10, cowork): langkah funnel MENTAH
   *  (`barang`/`alamat`/`keranjang`/`qty`/…). `funnelMode` di atas meruntuhkan
   *  semua langkah pra-total jadi `'normal'`, dan `status` — yang dulu memuat
   *  `funnel:<langkah>` — DITIMPA oleh outcome pipeline di controller. Jadi
   *  langkah sebenarnya tidak pernah bisa dibaca dari panel mana pun. <<< */
  funnelStep?: string;
  kotaTujuan?: string;
  ongkir?: {
    amount: number;
    courier: string;
    service: string;
  };
  items: Array<{
    name: string;
    qty: number;
    price: number;
  }>;
  tokens: Record<string, string>;
  gateWarnings: string[];
  orderContextLog?: any[];
  toolCalls?: Array<{
    name: string;
    args: any;
    result: any;
  }>;
  /** >>> ANGGA — F6 Bagian 1 butir 1 (2026-08-11, cowork): SIAPA yang melayani
   *  giliran ini. Satu giliran bisa menembak banyak panggilan LLM (loop tool,
   *  percobaan paksa, retry, Sentinel, resolusi tujuan), jadi ini DAFTAR —
   *  bukan satu nilai. `penyedia: null` berarti TIDAK DILAPORKAN, bukan nol. <<< */
  aiCalls?: JejakPanggilanAi[];
  /** Ringkasan siap baca dari `aiCalls` — dipakai `tools/eval/replay.mjs`. */
  aiRingkas?: ReturnType<typeof ringkasJejakAi>;
}

export interface TestScenario {
  name: string;
  description: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export interface CreateSessionRequest {
  name: string;
  provider?: string;
  model?: string;
}

export interface SendMessageRequest {
  text: string;
}

export interface SendMessageResponse {
  message: TestMessage;
  reply: TestMessage;
}

export interface LoadScenarioRequest {
  scenarioName: string;
}

export interface SwitchProviderRequest {
  provider: string;
  model: string;
}

export interface ProviderInfo {
  name: string;
  models: string[];
}

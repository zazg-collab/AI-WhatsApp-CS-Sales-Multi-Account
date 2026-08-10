import type { AiMode, BotStatus, TakeoverStatus } from '@sentinel/database';

/**
 * >>> ANGGA — F3a gelombang v2 (2026-08-09, cowork): KONTRAK PIPELINE BALASAN.
 *
 * `ReplyPipelineService` memutuskan APA yang terjadi pada sebuah giliran;
 * `ReplyChannel` mengerjakan efek keluarnya. Produksi memasang adapter
 * WhatsApp, test-harness memasang adapter UI. Otaknya satu, pintunya dua.
 */

/** Potret percakapan yang dibutuhkan pipeline. Sengaja sempit — pipeline tidak
 *  boleh bergantung pada bentuk baris Prisma yang lengkap. */
export interface ReplyConversation {
  id: string;
  whatsappAccountId: string;
  aiMode: AiMode;
  takeoverStatus: TakeoverStatus;
  customer: { phoneNumber: string; name?: string | null };
  bot?: { status: BotStatus } | null;
}

/** Efek keluar yang bergantung kanal. Yang TIDAK ada di sini (audit Sentinel
 *  pasca-kirim, lead score, keputusan menjadwalkan follow-up, penguncian AI)
 *  memang milik pipeline — sama untuk semua kanal. */
export interface ReplyChannel {
  /** Kadaluwarsakan draft lama sebelum menulis yang baru. */
  expireStaleDrafts(convo: ReplyConversation): Promise<void>;
  /** Kirim ke pelanggan. Melempar kalau gagal — pipeline yang menangani fallback. */
  /** >>> ANGGA — LANGKAH 5 (2026-08-10): `funnelStep` dipersist BERSAMAAN dengan
   *  baris pesannya. Pipeline yang memutuskan (satu tempat), kanal yang
   *  menyimpan — bukan sebaliknya. <<< */
  send(
    convo: ReplyConversation,
    text: string,
    sentinelReviewId?: string,
    funnelStep?: string | null,
  ): Promise<{ messageId: string }>;
  /** Simpan sebagai draft menunggu admin. */
  draft(
    convo: ReplyConversation,
    text: string,
    opts?: {
      sentinelReviewId?: string;
      quotedMessageId?: string | null;
      moneyGateIssues?: string[];
      /** >>> ANGGA — LANGKAH 5: langkah funnel yang DITANYAKAN draft ini. <<< */
      funnelStep?: string | null;
    },
  ): Promise<void>;
  /** Beri tahu admin (gerbang uang menahan, burst menunggu approval, dll). */
  notifyAdmin(pesan: string): void;
  /** Kirim aset otomatis sesudah balasan benar-benar terkirim. Opsional. */
  autoSendAssets?(conversationId: string): void;
  /** Jadwalkan follow-up. Pipeline yang memutuskan KAPAN, kanal yang mengeksekusi. */
  scheduleFollowUp?(conversationId: string, pesan: string, delayMs: number): Promise<void>;
}

/**
 * Keputusan pipeline, eksplisit. Sebelum F3a keputusan-keputusan ini hanya bisa
 * diamati lewat mock; sekarang bisa di-assert langsung — itulah yang dibutuhkan
 * korpus eval F6.
 */
export type ReplyOutcome =
  | {
      kind: 'skipped';
      reason:
        | 'no-conversation'
        | 'bot-inactive'
        | 'takeover'
        | 'ai-off'
        | 'no-phone'
        | 'empty-text'
        | 'stale'
        | 'no-segments';
    }
  | { kind: 'drafted'; reason: 'money-gate' | 'ai-draft' | 'sentinel-draft' | 'send-failed' | 'sentinel-error' | 'burst'; count?: number }
  | { kind: 'sent'; messageId: string }
  | { kind: 'paused' };

/** Jeda follow-up otomatis (e4415a5). Dipakai pipeline, bukan kanal. */
export const FOLLOW_UP_DELAY_MS = 15 * 60 * 1000;
export const FOLLOW_UP_MESSAGE = 'Halo kak, apakah ada kendala? Jadi mau diorder yang mana aja kak?';

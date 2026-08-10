import { Logger } from '@nestjs/common';
import type { ReplyChannel, ReplyConversation, ReplyOutcome } from '../modules/reply/reply.types';

/**
 * >>> ANGGA — F3c (2026-08-09, cowork): PINTU KEDUA. Otaknya sama persis dengan
 * produksi (`ReplyPipelineService`); yang beda cuma ke mana balasannya keluar —
 * ke UI test-harness, bukan ke WhatsApp.
 *
 * Sengaja TIDAK menulis pesan ke DB: penyimpanan diurus controller lewat
 * `TestHarnessRepository.addMessage` supaya snapshot debug ikut menempel di
 * satu tempat. Kanal ini murni penampung hasil.
 *
 * `scheduleFollowUp` SENGAJA tidak diimplementasikan. Di produksi follow-up
 * 15 menit hanya dijadwalkan di jalur `ai_on` sesudah kirim; menjadwalkan job
 * BullMQ sungguhan dari sesi uji cuma akan mengotori antrean. Pipeline
 * memperlakukan port opsional yang absen sebagai "tidak dijadwalkan" —
 * keputusannya tetap tercatat di `ReplyOutcome`, jadi tidak ada yang disembunyikan.
 */
export class UiReplyChannel implements ReplyChannel {
  private readonly logger = new Logger(UiReplyChannel.name);

  /** Teks balasan yang dihasilkan pipeline, apa pun jalurnya (kirim/draft). */
  text: string | null = null;
  /** Alasan penahanan gerbang uang, kalau ada — ditampilkan di panel debug. */
  moneyGateIssues: string[] = [];
  /** Pemberitahuan yang di produksi dikirim ke admin. */
  adminNotices: string[] = [];
  /** >>> ANGGA — LANGKAH 5 (2026-08-10, temuan K23): langkah funnel yang
   *  ditanyakan balasan giliran ini, DITITIPKAN di sini. Kanal ini tidak
   *  menulis baris `Message` (controller yang menulisnya sesudah `run()`
   *  selesai), jadi controller yang memasangnya ke baris yang sungguhan lalu
   *  mempromosikannya. <<< */
  funnelStep: string | null = null;
  outcome?: ReplyOutcome;

  async expireStaleDrafts(): Promise<void> {
    /* tidak relevan di UI — draft uji tidak pernah basi */
  }

  /** >>> ANGGA — LANGKAH 5 (2026-08-10, KOREKSI temuan K23): versi pertama
   *  membuang `funnelStep` di sini dan menyebutnya "konsekuensi yang dicatat
   *  terang-terangan". Itu keliru — akibatnya funnel di test-harness BEKU
   *  TOTAL: `funnel_ask` tidak pernah tercatat, cap anti-cerewet tidak pernah
   *  menyala, closing tidak pernah menandai order selesai. Mode gagal yang
   *  persis sama dengan regresi `09c5e70`, di pintu debug utama Bossfren, dan
   *  diberi nama baik di komentar. Sekarang dititipkan ke field di atas. <<< */
  async send(
    _convo: ReplyConversation,
    text: string,
    _sentinelReviewId?: string,
    funnelStep?: string | null,
  ): Promise<{ messageId: string }> {
    this.text = text;
    this.funnelStep = funnelStep ?? null;
    return { messageId: `ui-${Date.now()}` };
  }

  async draft(
    _convo: ReplyConversation,
    text: string,
    opts?: { moneyGateIssues?: string[]; funnelStep?: string | null },
  ): Promise<void> {
    // Burst menghasilkan beberapa draft — gabung supaya semuanya terlihat di UI.
    this.text = this.text ? `${this.text}\n\n${text}` : text;
    // Burst: hanya segmen TERAKHIR yang membawa langkah, jadi yang non-null
    // menang dan segmen berikutnya tidak menimpanya balik jadi null.
    if (opts?.funnelStep) this.funnelStep = opts.funnelStep;
    if (opts?.moneyGateIssues?.length) this.moneyGateIssues.push(...opts.moneyGateIssues);
  }

  notifyAdmin(pesan: string): void {
    this.adminNotices.push(pesan);
    this.logger.debug(`[test-harness] notifikasi admin: ${pesan.split('\n')[0]}`);
  }

  /* autoSendAssets & scheduleFollowUp sengaja dibiarkan absen — lihat catatan di atas. */
}

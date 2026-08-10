import { Injectable, Logger, Optional } from '@nestjs/common';
import { LeadStage } from '@sentinel/database';
import { WebhooksService } from '../webhooks/webhooks.service';
import { PrismaService } from '../../prisma/prisma.service';
import { assertConversationScope, type ScopedUser } from '../../common/account-scope.util';
import { NotificationsService } from '../../notifications/notifications.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { extractFirstJson } from '../../common/json-extract.util'; // >>> ANGGA <<<
import {
  AiProviderService,
  ChatMessage,
} from './ai-provider.service';
import { PromptBuilderService } from './prompt-builder.service';
import { AiCacheService } from './ai-cache.service';
// >>> ANGGA: pemanggilan LLM auxiliary Langkah 2 modul shipping (deteksi tujuan
// + item order dalam SATU panggilan). Implementasinya tinggal di
// `shipping.service.ts` bersama pemakainya; di sini disediakan pintu masuk
// resmi lewat AiService supaya sejajar dengan `leadScore`/`analyzeSentiment`
// dan bisa dipakai controller/uji tanpa menyentuh modul shipping langsung.
import { ShippingService, type ShippingOrderExtract } from '../shipping/shipping.service';
// >>> ANGGA — F1 (2026-08-09, cowork): skema tool ongkir TIDAK lagi ditulis
// inline di sini. Satu-satunya definisi ada di `shipping.tools.ts`, dipakai
// bersama jalur produksi ini DAN test-harness. <<<
import { shippingTools } from '../shipping/shipping.tools';
// >>> ANGGA — F4 (2026-08-09, cowork): Reply Contract. Model menyerahkan
// balasannya lewat tool `send_reply`; alasannya panjang, ada di berkasnya. <<<
import {
  sendReplyTool,
  parseReplyContract,
  SEND_REPLY_TOOL_NAME,
  SEND_REPLY_TOOL_CHOICE,
  type ReplyContract,
} from '../reply/reply.tools';
import { searchKnowledgeTool } from '../knowledge/knowledge.tools';
// <<< ANGGA
import {
  t,
  LEAD_SCORE_SYSTEM,
  LEAD_SCORE_USER,
  SENTIMENT_SYSTEM,
  SENTIMENT_USER_PREFIX,
  SENTIMENT_USER_SUFFIX,
  SENTIMENT_NO_MESSAGES,
  SUMMARIZE_SYSTEM,
  SUMMARIZE_USER,
  SEGMENTED_REPLY_SYSTEM,
  SEGMENTED_REPLY_LIST,
  MONEY_GATE_RETRY_USER,
  MONEY_GATE_RETRY_HINTS,
  mediaPlaceholder,
  FALLBACK_PHRASE,
  stripDataFences,
} from '../../i18n/bot-prompts';
import type { BotLang } from '../../i18n/bot-prompts';

/**
 * >>> ANGGA — SAKLAR F4 (2026-08-10, ketok Bossfren sesudah uji lapangan).
 *
 * Reply Contract (tool `send_reply` + komposisi kalimat funnel oleh sistem)
 * DIMATIKAN secara bawaan. Kodenya tidak dihapus — ia tidur, dan dinyalakan
 * lagi HANYA kalau korpus eval F6 bisa membuktikan ia menambah nilai.
 *
 * Kenapa dimatikan, dari bukti lapangan dua hari:
 *  · komposisi MENGGANDAKAN pertanyaan saat model memparafrase kalimat wajib
 *    (beda satu kata "yang" sudah cukup mengalahkan pencocokan) — pelanggan
 *    menerima pertanyaan yang sama dua kali;
 *  · komposisi sempat MENGARANG balasan dari kekosongan: provider memulangkan
 *    `{"content":""}`, lalu kalimat funnel ditempelkan, dan pelanggan yang
 *    bertanya ongkir menerima "mau ambil berapa pcs kak?" sebagai jawaban;
 *  · `send_reply` hanya dipakai model 2 dari 6 giliran (counter
 *    `reply_contract_total`), jadi jaminan strukturnya memang tidak pernah ada.
 *
 * Pelajaran yang lebih besar, dan alasan saklar ini ada alih-alih tambalan
 * kesekian: seluruh penilaian di atas awalnya dibuat dari sampel SATU
 * percakapan pada model yang jawabannya berubah-ubah. Tiga hipotesis sebab
 * diajukan, tiga-tiganya dibantah data. Menyalakan kembali fitur ini tanpa
 * korpus berarti mengulangi cara kerja yang sudah terbukti gagal.
 *
 * Dimatikan berarti bot kembali ke perilaku PRA-F4: model menulis sendiri
 * kalimat funnel wajib (template di `bot-prompts.ts` sudah dikembalikan ke
 * bunyi aslinya), dan gerbang `funnel_dilanggar` kembali jadi penegaknya.
 */
function kontrakBalasanAktif(): boolean {
  // >>> ANGGA — koreksi AUDIT (2026-08-10, ronde penyanggal): dibaca SAAT
  // DIPAKAI, bukan sebagai konstanta tingkat modul.
  //
  // Versi pertama `const ... = process.env...` di tingkat modul, dan itu SALAH
  // secara mendasar di Nest: seluruh `import` di `app.module.ts` dievaluasi
  // SEBELUM argumen dekorator `@Module({ imports: [ConfigModule.forRoot()] })`
  // dijalankan — dan `forRoot()` itulah yang memuat `.env`. Akibatnya menulis
  // `REPLY_CONTRACT_ENABLED=true` di `.env` TIDAK berefek apa pun; hanya env
  // var proses sungguhan (docker `environment:`) yang terbaca. Saklar yang
  // tidak bisa dinyalakan lewat cara yang didokumentasikan sendiri lebih
  // berbahaya daripada tidak ada saklar.
  //
  // Membacanya saat dipakai sekaligus menutup dua temuan lain: spec tidak lagi
  // perlu akal-akalan `requireActual` untuk memuat ulang modul, dan spec
  // "saklar mati" bisa benar-benar MEMAKSA mati alih-alih berharap env-nya
  // kebetulan kosong.
  return process.env.REPLY_CONTRACT_ENABLED === 'true';
}

/** All fallback-phrase variants (all languages) — marks an AI "punt to admin". */
const FALLBACK_MARKERS = Object.values(FALLBACK_PHRASE) as string[];

export interface GeneratedReply {
  text: string;
  model: string;
  // >>> ANGGA — Fase 113 (2026-08-04): true kalau gerbang uang (lihat
  // `gateMoneyTokens` di bawah / `ShippingService.resolvePriceTokens`) menahan
  // balasan ini — token `{{...}}` tak terselesaikan, atau angka rupiah yang
  // ditulis model sendiri di luar penanda. Pemanggil (wa-inbound.service.ts)
  // WAJIB memaksa draft kalau ini true, APA PUN mode AI-nya, termasuk ai_on
  // yang biasanya kirim tanpa menunggu Sentinel — gerbang ini berjalan di sini
  // (bukan di Sentinel) justru supaya berlaku sama rata di semua mode.
  moneyBlocked?: boolean;
  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): alasan penahanan, HANYA
  // untuk metadata admin (kartu peringatan terpisah di UI) — TIDAK PERNAH
  // digabung ke `text`. `text` di atas selalu bersih supaya klik Approve tanpa
  // Edit tidak pernah mengirim teks debug internal ke pelanggan.
  moneyGateIssues?: string[];
}

export interface LeadScoreResult {
  score: number;
  stage: LeadStage;
  reasons: string[];
}

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

export interface SentimentResult {
  sentiment: Sentiment;
  score: number;
  reason: string;
}

const CACHEABLE_MAX_QUESTION_CHARS = 200;

export interface BuyingSignals {
  score: number;
  reasons: string[];
}

/**
 * Deterministic buying-signal detector (PRD §lead-scoring triggers). Scans the
 * customer's own messages for concrete intent — price, stock, payment, booking/
 * DP, volunteering personal data — and returns a weighted score + the matched
 * trigger labels. Bilingual id/en. Used as a FLOOR under the LLM lead score so
 * a clear signal is never lost to a flaky model. Pure + exported for testing.
 */
const BUYING_TRIGGERS: { points: number; label: string; pattern: RegExp }[] = [
  { points: 45, label: 'booking/DP', pattern: /\b(dp|booking|book|pesan|order|deposit|uang muka|tanda jadi)\b/i },
  { points: 35, label: 'metode bayar', pattern: /\b(bayar|pembayaran|transfer|rekening|cod|payment|cicil|installment|qris)\b/i },
  { points: 30, label: 'tanya harga', pattern: /\b(harga|berapa|brp|price|cost|diskon|promo|nego)\b/i },
  { points: 25, label: 'kirim data diri', pattern: /\b(alamat|kirim ke| kode pos|nama lengkap|nomor hp|no hp)\b/i },
  { points: 20, label: 'cek stok', pattern: /\b(stok|stock|ready|tersedia|available|sisa|inden)\b/i },
];

export function detectBuyingSignals(messages: string[]): BuyingSignals {
  const text = (messages ?? []).join('\n');
  let score = 0;
  const reasons: string[] = [];
  for (const trig of BUYING_TRIGGERS) {
    if (trig.pattern.test(text)) {
      score += trig.points;
      reasons.push(trig.label);
    }
  }
  return { score: Math.min(100, score), reasons };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProviderService,
    private readonly prompts: PromptBuilderService,
    private readonly notifications: NotificationsService,
    private readonly cache: AiCacheService,
    @Optional() private readonly webhooks?: WebhooksService,
    @Optional() private readonly metrics?: MetricsService,
    @Optional() private readonly shipping?: ShippingService, // >>> ANGGA <<<
  ) {}

  cacheStats() {
    return this.cache.stats();
  }

  /** >>> ANGGA — LANGKAH 5 (2026-08-10): langkah yang ditanyakan balasan giliran
   *  INI (dipagari `messageId`). Untuk kolom `Message.funnelStep`. <<< */
  langkahUntukGiliran(conversationId: string): string | null {
    return this.shipping?.langkahUntukGiliran?.(conversationId) ?? null;
  }

  getFunnelExpect(conversationId: string) {
    return this.shipping?.getFunnelExpect(conversationId) ?? null;
  }

  /**
   * >>> ANGGA — Fase 113 (2026-08-04): gerbang uang, dipanggil TANPA SYARAT
   * mode AI dari `generateReply`/`generateSegmentedReply` — lihat catatan di
   * `GeneratedReply.moneyBlocked`. Kalau ditahan, balasan diberi penanda
   * pendek di depan (ketok palu Bossfren) supaya admin yang membaca draftnya
   * langsung tahu kenapa teksnya terlihat aneh, tanpa harus buka log Sentinel.
   */
  private async gateMoneyTokens(
    conversationId: string,
    text: string,
    // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren, audit gerbang uang #2):
    // kalau disediakan, satu percobaan ulang OTOMATIS dengan pesan koreksi
    // konkret sebelum benar-benar jatuh ke draft manual — insiden nyatanya
    // (harga Bedog Betekok) model cuma perlu diingatkan sekali soal penanda,
    // bukan langsung diserahkan ke admin. Sengaja HANYA satu kali (bukan
    // loop) supaya biaya panggilan LLM ekstra tetap terkontrol dan tidak ada
    // risiko retry tanpa akhir kalau modelnya memang keras kepala.
    // >>> ANGGA — F4 audit (2026-08-09, cowork): `tempel` diteruskan ke
    // komposisi teks HASIL RETRY. Jalur burst memakai `tempel: false` untuk
    // segmen yang bukan terakhir — lihat `generateSegmentedReply`. <<<
    retry?: { messages: ChatMessage[]; lang: string; model?: string; tempel?: boolean },
    // >>> ANGGA — F4 audit: `dataStatus` yang DINYATAKAN model lewat kontrak
    // `send_reply`. Diteruskan ke gerbang supaya kontradiksi "data sudah ada
    // tapi model bilang belum" bisa ditangkap dari PERNYATAAN model, bukan
    // dari mencocokkan 24 frasa. <<<
    opts?: { dataStatus?: 'computed' | 'unavailable' },
  ): Promise<{ text: string; blocked: boolean; issues?: string[] }> {
    if (!this.shipping) return { text, blocked: false };
    const rendered = await this.shipping.resolvePriceTokens(conversationId, text, {
      dataStatus: opts?.dataStatus,
    });
    if (rendered.ok) return { text: rendered.text, blocked: false };
    this.logger.warn(`Gerbang uang menahan balasan ${conversationId}: ${rendered.issues.join('; ')}`);

    if (retry) {
      this.logger.warn(`Gerbang uang: mencoba ulang sekali dengan koreksi untuk ${conversationId}`);
      try {
        // >>> ANGGA — fix (2026-08-06, insiden "cod aja kak" diulang totalan,
        // retry-nya sendiri ikut gagal): instruksi koreksi kini disesuaikan
        // per KELAS pelanggaran (S1), bukan satu kalimat generik "pakai
        // penanda" untuk semua kelas — lihat komentar MONEY_GATE_RETRY_HINTS.
        // >>> ANGGA — koreksi (2026-08-06, REPLAY laporan Bossfren "Fatih"/
        // "Sandubaya COD" — draft ditahan dengan 2 issue SEKALIGUS:
        // jumlah_manual + funnel_dilanggar, retry TETAP gagal): versi
        // sebelumnya di sini cuma kirim SATU hint (kelas prioritas tertinggi
        // menang, sisanya diam-diam tidak disinggung ke model sama sekali).
        // Kalau draft melanggar BEBERAPA kelas berbarengan, model cuma
        // dikasih tahu SATU dari sekian pelanggarannya — retry gagal lagi
        // karena pelanggaran lain yang tidak disebut kemungkinan besar tetap
        // terulang. Fix: kumpulkan SEMUA kelas yang cocok (bukan cuma yang
        // pertama), gabung hint-nya jadi satu instruksi — urutan prioritas
        // tetap dipakai supaya instruksi paling kritis (funnel_dilanggar)
        // tetap disebut paling dulu/tegas, tapi kelas lain TIDAK lagi
        // dibungkam. `rendered.issues` mentah tetap ikut terkirim sebagai
        // daftar bullet terpisah di `MONEY_GATE_RETRY_USER` (tidak berubah),
        // jadi ini memperkuat instruksi actionable-nya, bukan duplikat.
        //
        // >>> ANGGA — Klaster C (2026-08-06): SEBELUMNYA baris ini menebak
        // kelas balik dari teks (`klasifikasiAlasanGate(s)`) — jalur LIVE
        // ikut kena fragilitas stringly-typed yang sama seperti telemetri.
        // `resolvePriceTokens` sekarang melekatkan kode LANGSUNG di titik
        // issue lahir (`pushIssue`), jadi di sini tinggal dipakai apa
        // adanya — nol tebak-tebakan, nol risiko kata-kata berubah tapi
        // pencocokan lupa diperbarui. <<<
        const kelasIssues = rendered.issueCodes;
        const kelasPrioritas = [
          'funnel_dilanggar',
          'closing_prematur',
          'kalimat_dobel',
          'kontradiksi_data',
          'rekening_mentah',
          'salah_produk',
          'jumlah_manual',
        ] as const;
        const kelasCocokSemua = kelasPrioritas.filter((k) => kelasIssues.includes(k));
        const hint = kelasCocokSemua.length
          ? kelasCocokSemua
              .map((k) => MONEY_GATE_RETRY_HINTS[k]?.[retry.lang === 'en' ? 'en' : 'id'])
              .filter((s): s is string => !!s)
              .join(' ')
          : undefined;
        // <<< ANGGA
        const retryMessages: ChatMessage[] = [
          ...retry.messages,
          { role: 'assistant', content: rendered.text },
          { role: 'user', content: t(MONEY_GATE_RETRY_USER, retry.lang)(rendered.text, rendered.issues, hint) },
        ];
        let retryText = await this.provider.chat(retryMessages, { model: retry.model, maxTokens: 500 });
        retryText = stripDataFences(retryText);
        // >>> ANGGA — F4 audit (2026-08-09, cowork): LUBANG yang hampir lolos.
        // Teks hasil retry ini dulu langsung masuk gerbang tanpa lewat
        // komposisi — artinya deadlock `funnel_dilanggar` yang F4 klaim sudah
        // mustahil TETAP HIDUP di jalur retry, dan justru di jalur inilah ia
        // dulu paling sering muncul (retry dipicu oleh pelanggaran gerbang).
        // Sekarang teks retry disusun dengan aturan yang sama persis. <<<
        const komposisiRetry = kontrakBalasanAktif()
          ? this.shipping.komposisiFunnel?.(conversationId, retryText, { tempel: retry.tempel })
          : undefined;
        if (komposisiRetry) retryText = komposisiRetry.text;
        const retryRendered = await this.shipping.resolvePriceTokens(conversationId, retryText, {
          dataStatus: opts?.dataStatus,
        });
        if (retryRendered.ok) {
          this.logger.log(`Gerbang uang: percobaan ulang berhasil untuk ${conversationId}`);
          return { text: retryRendered.text, blocked: false };
        }
        this.logger.warn(
          `Gerbang uang: percobaan ulang tetap ditahan untuk ${conversationId}: ${retryRendered.issues.join('; ')}`,
        );
        // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): `text` TIDAK PERNAH
        // lagi diberi prefiks "⚠️ [...]" — alasannya di `issues`, dipersist
        // terpisah (`Message.moneyGateIssues`) oleh pemanggil.
        return { text: retryRendered.text, blocked: true, issues: retryRendered.issues };
      } catch (err) {
        // Percobaan ulang sendiri gagal (mis. provider error) — jatuh ke hasil
        // percobaan PERTAMA yang ditahan, jangan sampai balasannya hilang sama
        // sekali gara-gara retry-nya yang bermasalah.
        this.logger.warn(
          `Gerbang uang: percobaan ulang gagal (${err instanceof Error ? err.message : err}) untuk ${conversationId}`,
        );
      }
    }

    return {
      text: rendered.text,
      blocked: true,
      issues: rendered.issues,
    };
  }

  // >>> ANGGA: Langkah 2 LAMPIRAN — satu panggilan LLM kecil mode JSON yang
  // mengembalikan tujuan kirim DAN daftar item sekaligus (bukan dua panggilan
  // terpisah, supaya biaya token tidak dobel). Pola sama persis
  // LEAD_SCORE_SYSTEM/SENTIMENT_SYSTEM: temperature 0, json: true, parse
  // toleran, tidak pernah melempar.
  async extractShippingOrder(conversationId: string): Promise<ShippingOrderExtract> {
    if (!this.shipping) return { city: null, province: null, items: [] }; // >>> ANGGA — P4 <<<
    return this.shipping.extractOrderTarget(conversationId);
  }
  // <<< ANGGA

  listModels() {
    return this.provider.listModels();
  }

  config() {
    return this.provider.getConfig();
  }

  /** Generate a reply/draft for a conversation. Does not send. */
  async generateReply(
    conversationId: string,
    model?: string,
    useCache = false,
  ): Promise<GeneratedReply> {
    const messages = await this.prompts.buildForConversation(conversationId);
    const resolvedModel = model ?? (await this.provider.defaultModel());

    // Conservative caching: only for short, generic latest questions. The
    // cache is opt-in (useCache) so existing callers keep prior behavior.
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === 'user')?.content;
    const cacheable =
      useCache &&
      typeof lastUser === 'string' &&
      lastUser.length > 0 &&
      lastUser.length < CACHEABLE_MAX_QUESTION_CHARS;

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { botId: true, bot: { select: { knowledgeBaseId: true } } },
    });
    const botId = conv?.botId ?? null;
    const knowledgeBaseId = conv?.bot?.knowledgeBaseId ?? null;

    if (cacheable) {
      if (botId) {
        const hit = this.cache.get(botId, lastUser as string);
        if (hit !== null) {
          this.metrics?.aiRequests.inc({ outcome: 'cache' });
          return { text: hit, model: resolvedModel };
        }
      }
    }

    const ragMode = this.prompts['settings'] ? (await this.prompts['settings'].ai()).ragMode : 'hybrid';
    
    let tools: any[] | undefined = [];
    if (this.shipping) {
      tools.push(...shippingTools);
    }
    
    // >>> ANGGA: Fase 6.5, jika mode agentic, tambahkan RAG sebagai tool
    if (ragMode === 'agentic') {
      tools.push(searchKnowledgeTool);
    }

    // >>> ANGGA — F4, kini di balik saklar (lihat kontrakBalasanAktif()). <<<
    if (kontrakBalasanAktif()) tools.push(sendReplyTool);

    if (tools.length === 0) tools = undefined;

    let text = '';
    // >>> ANGGA — F4: kontrak yang diserahkan model, kalau ia memakai
    // `send_reply`. `null` = tidak menyerahkan (jalur teks polos pra-F4). <<<
    let kontrak: ReplyContract | null = null;
    let kontrakRusak = false;
    let kontrakDipaksa = false;
    // >>> ANGGA — diagnostik (2026-08-10, cowork): jawaban provider TERAKHIR,
    // apa adanya. Hanya dibaca kalau balasan akhirnya kosong. Tanpa ini kita
    // tidak bisa membedakan tiga hal yang gejalanya identik: model memang diam,
    // provider memulangkan tool_calls dengan bentuk yang tidak kita kenali,
    // atau balasannya terpotong habis oleh max_tokens. <<<
    // >>> ANGGA — 2026-08-10 (SORE): eskalasi plafon DICABUT, plafon dasar
    // dinaikkan. Ini pencabutan tambalanku sendiri dari pagi ini, bukan
    // tambahan.
    //
    // Tambalan pagi: plafon dasar 500, naik SEKALI ke 4000 kalau provider
    // memulangkan `finish_reason: 'length'` dengan tangan kosong. Alasannya
    // "menaikkan plafon global berarti semua giliran membayar untuk kasus
    // yang jarang". ITU KELIRU: `max_tokens` adalah BATAS ATAS — biayanya
    // hanya untuk token yang benar-benar ditulis. Menahannya di 500 tidak
    // menghemat apa pun; ia membeli SATU perjalanan bolak-balik terbuang
    // setiap kali penalaran model lewat batas — 7 kali dalam ±19 giliran
    // terukur — dan panggilan eskalasinya cukup panjang untuk menembus batas
    // waktu 30 detik, yang lalu muncul sebagai HTTP 500.
    //
    // Jadi tambalan itu memperbaiki bug A sambil melahirkan kegagalan B.
    // Dicabut, bukan ditambal lagi: satu jalur kode hilang, satu kelas
    // kegagalan hilang, dan giliran yang tadinya butuh dua panggilan sekarang
    // selesai dengan satu. <<<
    const plafon = 4000;
    let resTerakhir: {
      content?: string;
      tool_calls?: unknown[];
      finish_reason?: string;
      prompt_tokens?: number;
    } | null = null;
    const stopTimer = this.metrics?.aiRequestDuration.startTimer();
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await this.provider.chatWithTools(messages, {
          model,
          maxTokens: plafon,
          tools,
        });

        text = res.content;
        resTerakhir = res;
        const toolCalls = res.tool_calls;

        // >>> ANGGA — diagnostik (2026-08-10, cowork): BENTUK tool_calls yang
        // benar-benar dipulangkan provider. Loop di bawah membuang setiap
        // panggilan yang `type`-nya bukan 'function' (`continue`) — kalau
        // provider mengirimnya tanpa field `type`, SELURUH panggilan tool
        // hilang diam-diam dan tidak ada satu pun jejaknya. Baris ini yang
        // membedakan "model tidak memanggil tool" dari "kita membuang
        // panggilannya". <<<
        if (toolCalls?.length) {
          this.logger.debug(
            `tool_calls diterima (${toolCalls.length}): ` +
              toolCalls
                // >>> ANGGA — diagnostik (2026-08-10, cowork): ARGUMEN ikut
                // dicatat. Tanpa ini, "search_destinations dipanggil" tidak
                // bisa dibedakan dari "search_destinations dipanggil dengan
                // keyword kotor yang pasti 0 hasil" — dua hal yang menuntut
                // perbaikan di tempat berbeda. <<<
                .map(
                  (t: any) =>
                    `${t?.function?.name ?? '?'}[type=${t?.type ?? 'HILANG'}] args=${String(
                      t?.function?.arguments ?? '',
                    )
                      .replace(/\s+/g, ' ')
                      .slice(0, 160)}`,
                )
                .join(' '),
          );
          const dibuang = toolCalls.filter((t: any) => t?.type !== 'function');
          if (dibuang.length) {
            this.logger.warn(
              `${dibuang.length} tool_call DIBUANG karena type !== 'function' — ` +
                `nama: ${dibuang.map((t: any) => t?.function?.name ?? '?').join(',')}. ` +
                `Ini berarti jalur tool calling TIDAK pernah benar-benar jalan dengan provider ini.`,
            );
          }
        }

        // >>> ANGGA — catatan sejarah (2026-08-10): di sini DULU ada eskalasi
        // plafon token. Dicabut sore harinya karena plafon dasar dinaikkan —
        // alasan lengkap di deklarasi `plafon` di atas. Keadaan yang dulu ia
        // tangani (`finish_reason: 'length'` + teks kosong + tanpa tool call)
        // sekarang tidak lahir lagi: jatah 4000 tidak habis dipakai penalaran
        // sebelum satu kata pun ditulis. Kalau kelak ia muncul lagi, itu
        // gejala BARU dan pantas didiagnosis ulang — jangan pasang kembali
        // eskalasinya secara refleks. <<<
        if (!toolCalls || toolCalls.length === 0) {
          break; // LLM returned final text
        }

        // >>> ANGGA — F4: kalau `send_reply` datang BARENGAN tool data dalam
        // satu batch, tool data yang menang. Alasannya keselamatan jawaban:
        // batch itu berarti model menulis balasannya SEBELUM membaca hasil
        // tool — persis keadaan yang bikin ia mengarang angka atau berkelit
        // "saya cek dulu ya kak". `send_reply`-nya tidak dieksekusi, cuma
        // dibalas instruksi untuk mengulang sesudah hasilnya masuk. <<<
        const adaToolData = toolCalls.some(
          (t: any) => t?.type === 'function' && t.function?.name !== SEND_REPLY_TOOL_NAME,
        );

        // LLM wants to call tools. Append its response to history.
        messages.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls,
        });

        // Execute each tool
        let selesai = false;
        for (const call of toolCalls) {
          if (call.type !== 'function') continue;
          const fnName = call.function.name;

          if (kontrakBalasanAktif() && fnName === SEND_REPLY_TOOL_NAME) {
            if (adaToolData) {
              messages.push({
                role: 'tool',
                content: JSON.stringify({
                  error:
                    'Hasil tool data baru tersedia dan BELUM kamu baca. Baca dulu, lalu panggil send_reply sekali lagi dengan jawaban yang sudah memakai data itu.',
                }),
                tool_call_id: call.id,
                name: fnName,
              });
              continue;
            }
            const dibaca = parseReplyContract(call.function.arguments ?? '');
            if (dibaca) {
              kontrak = dibaca;
              text = dibaca.answer;
              selesai = true;
              break;
            }
            // Argumen tidak terbaca / `answer` kosong: JANGAN diam-diam
            // mengirim pesan kosong. Beri tahu modelnya, biarkan loop
            // memutar sekali lagi — kalau tetap gagal, jatuh ke teks polos.
            kontrakRusak = true;
            messages.push({
              role: 'tool',
              content: JSON.stringify({
                error:
                  'Argumen send_reply tidak terbaca atau field "answer" kosong. Panggil lagi dengan answer berisi teks balasan lengkap.',
              }),
              tool_call_id: call.id,
              name: fnName,
            });
            continue;
          }

          let resultStr = '';
          try {
            const args = JSON.parse(call.function.arguments);
            if (fnName === 'search_destinations') {
              const res = await this.shipping!.llmSearchDestinations(args.keyword, args.province);
              resultStr = JSON.stringify(res);
            } else if (fnName === 'calculate_shipping') {
              const dest = { id: args.destination_id, city: args.city, province: args.province, label: args.label };
              // >>> ANGGA — F1: `items` OPSIONAL di skema (pelanggan boleh tanya ongkir
              // sebelum memilih barang → jalur shippingOnly). `quoteUntukTujuan`
              // membaca `input.items.length`, jadi undefined WAJIB di-default. <<<
              const res = await this.shipping!.llmCalculateShipping(conversationId, dest, args.items ?? []);
              resultStr = JSON.stringify(res);
            } else if (fnName === 'search_knowledge') {
              const lang = await this.botLang(conversationId);
              const res = await this.prompts.llmSearchKnowledge(knowledgeBaseId, args.query, lang);
              resultStr = JSON.stringify(res);
            } else {
              resultStr = JSON.stringify({ error: `Unknown function ${fnName}` });
            }
          } catch (e: any) {
            this.logger.warn(`Tool call ${fnName} failed: ${e.message}`);
            resultStr = JSON.stringify({ error: e.message || String(e) });
          }

          messages.push({
            role: 'tool',
            content: resultStr,
            tool_call_id: call.id,
            name: fnName,
          });
        }
        if (selesai) break; // >>> ANGGA — F4: balasan sudah diserahkan <<<
      }

      // >>> ANGGA — F4: percobaan PAKSA — SENGAJA hanya kalau tidak ada teks
      // sama sekali. Kalau model sudah memberi prosa (jalur pra-F4), teks itu
      // dipakai apa adanya: memanggil ulang cuma untuk mendapat LABEL enum
      // menambah satu perjalanan bolak-balik ke provider di SETIAP giliran
      // tanpa membuat jawabannya lebih benar — kalimat funnel-nya toh sudah
      // dijamin `komposisiFunnel`, bukan oleh kontrak ini. Kalau teksnya
      // kosong, barulah kita memang tidak punya apa-apa untuk dikirim, dan
      // satu panggilan dengan `tool_choice` dipin itu murni keuntungan. <<<
      if (kontrakBalasanAktif() && !kontrak && !text.trim()) {
        try {
          const paksa = await this.provider.chatWithTools(messages, {
            model,
            maxTokens: 500,
            tools: [sendReplyTool], // hanya terjangkau saat saklar ON
            toolChoice: SEND_REPLY_TOOL_CHOICE,
          });
          resTerakhir = paksa;
          const panggilan = (paksa.tool_calls ?? []).find(
            (t: any) => t?.type === 'function' && t.function?.name === SEND_REPLY_TOOL_NAME,
          );
          const dibaca = panggilan ? parseReplyContract(panggilan.function.arguments ?? '') : null;
          if (dibaca) {
            kontrak = dibaca;
            kontrakDipaksa = true;
            text = dibaca.answer;
          } else if (paksa.content?.trim()) {
            text = paksa.content;
          }
        } catch (e: any) {
          // Percobaan paksa adalah BONUS, bukan jalur wajib — kegagalannya
          // tidak boleh menggagalkan balasan yang (mungkin) sudah ada.
          this.logger.warn(`send_reply paksa gagal: ${e?.message ?? e}`);
        }
      }
    } catch (err) {
      stopTimer?.();
      this.metrics?.aiRequests.inc({ outcome: 'error' });
      throw err;
    }
    stopTimer?.();
    // Output guard: never let internal reference-data fence markers reach the
    // customer, even if the model echoed them back (defense in depth).
    text = stripDataFences(text);
    // "fallback" = the bot punted to the admin-confirm phrase (a quality signal,
    // mirrors Hermes knowledge-gap detection); everything else is a real answer.
    const outcome = FALLBACK_MARKERS.some((m) => text.includes(m)) ? 'fallback' : 'success';
    this.metrics?.aiRequests.inc({ outcome });

    // >>> ANGGA — Fase 113: gerbang uang SEBELUM caching, supaya cache tidak
    // pernah menyimpan (dan mengulang ke pelanggan lain) jawaban yang masih
    // menahan token/angka bermasalah. koreksi 2026-08-04 (audit gerbang uang
    // #2): satu percobaan ulang otomatis dengan pesan koreksi sebelum jatuh
    // ke draft manual — `messages`/`resolvedModel` sudah ada di scope ini.
    // >>> ANGGA — F4 (2026-08-09, cowork): TELEMETRI kepatuhan kontrak.
    // Ini pengganti "berburu bug daftar frasa": kepatuhan jadi angka yang bisa
    // dilihat per model, bukan tebakan. Label `funnel_declared` = langkah yang
    // DINYATAKAN model; dibandingkan dengan langkah yang diputus sistem
    // (`komposisiFunnel().step`) di korpus eval nanti (F6). Optional-call
    // `?.` di mana-mana: harness test lama mem-mock `metrics` dengan dua
    // counter saja, dan telemetri tidak boleh pernah menggagalkan balasan.
    const kontrakOutcome = !kontrakBalasanAktif()
      ? 'disabled'
      : kontrak
      ? kontrakDipaksa
        ? 'forced'
        : 'honored'
      : kontrakRusak
        ? 'malformed'
        : 'fallback';
    if (kontrakBalasanAktif())
      this.metrics?.replyContract?.inc({
      outcome: kontrakOutcome,
      funnel_declared: kontrak?.funnelQuestionId ?? 'unreported',
    });
    if (kontrak && kontrak.pelanggaranSkema.length > 0) {
      this.logger.warn(
        `send_reply melanggar skema di ${conversationId}: ${kontrak.pelanggaranSkema.join(', ')}`,
      );
    }

    // >>> ANGGA — F4: KOMPOSISI. Kalimat funnel wajib giliran ini dipasang
    // SISTEM, tepat sekali di akhir — bukan diharap nyempil dari prosa model
    // lalu dicocokkan string. Dipanggil SEBELUM gerbang uang supaya penanda
    // {{...}} di dalam kalimatnya ikut disubstitusi seperti sisa teksnya.
    // Optional-call `?.()` disengaja: spec lama mem-mock ShippingService tanpa
    // method ini, dan absennya harus berarti "perilaku pra-F4", bukan crash.
    // >>> ANGGA — koreksi AUDIT (2026-08-10, cowork): balasan KOSONG naik ke
    // WARN, lengkap dengan keadaan yang menyebabkannya. Sebelumnya kejadian ini
    // cuma meninggalkan satu baris `debug` di pipeline ("returned empty text")
    // tanpa konteks — begitu terjadi di sesi uji nyata, tidak ada satu pun
    // petunjuk apakah modelnya diam, kontraknya rusak, atau komposisinya yang
    // tidak menempel. Satu baris ini menjawab ketiganya sekaligus. <<<
    if (!text.trim()) {
      const st = this.shipping?.debugState?.(conversationId);
      const namaTool = Array.isArray(resTerakhir?.tool_calls)
        ? resTerakhir!.tool_calls!
            .map((t) => (t as { function?: { name?: string } })?.function?.name ?? '?')
            .join(',')
        : 'tidak ada';
      this.logger.warn(
        `Balasan KOSONG untuk ${conversationId} — kontrak=${kontrakOutcome}` +
          ` funnelStep=${st?.funnelStep ?? 'null'} adaKutipan=${st?.quote ? 'ya' : 'tidak'}` +
          ` | finish_reason=${resTerakhir?.finish_reason ?? 'TIDAK ADA'}` +
          ` promptTokens=${resTerakhir?.prompt_tokens ?? '?'} pesanDiPrompt=${messages.length}` +
          ` panjangContent=${(resTerakhir?.content ?? '').length} toolCalls=[${namaTool}]`,
      );
    }

    // Komposisi hanya berlaku untuk balasan yang MEMANG ada isinya. Penjaga
    // sebenarnya ada di `susunBalasan` (supaya tidak ada pemanggil yang bisa
    // lupa), ini lapisan kedua yang membuat niatnya terbaca di titik pakai.
    const komposisi =
      kontrakBalasanAktif() && text.trim()
        ? this.shipping?.komposisiFunnel?.(conversationId, text)
        : undefined;
    if (komposisi) {
      if (komposisi.disisipkan) {
        this.logger.debug(
          `komposisiFunnel ${conversationId}: kalimat langkah "${komposisi.step}" dipasang sistem (salinan dibuang: ${komposisi.salinanDibuang})`,
        );
      }
      text = komposisi.text;
    }
    // <<< ANGGA

    const lang = await this.botLang(conversationId);
    const gated = await this.gateMoneyTokens(
      conversationId,
      text,
      { messages, lang, model },
      { dataStatus: kontrak?.dataStatus },
    );
    text = gated.text;
    const moneyBlocked = gated.blocked;
    // <<< ANGGA

    if (cacheable && botId && !moneyBlocked) {
      this.cache.set(botId, lastUser as string, text);
    }

    return { text, model: resolvedModel, moneyBlocked, moneyGateIssues: gated.issues };
  }

  /**
   * Generate a SEGMENTED reply for a burst of customer messages: the model
   * groups the burst into topics and returns one reply per topic, each tagged
   * with the burst message it answers. Used when several distinct-topic
   * messages arrived together so each topic gets its own (quoted) draft —
   * harder to mis-answer, and a human can approve each independently.
   *
   * Degrades gracefully: any parse failure (or a single-topic result) yields a
   * single segment carrying the whole reply with no quote target.
   */
  async generateSegmentedReply(
    conversationId: string,
    burst: Array<{ index: number; content: string | null; messageType: string }>,
  ): Promise<Array<{ answersIndex: number | null; text: string; moneyGateIssues?: string[] }>> {
    const lang = await this.botLang(conversationId);
    const base = await this.prompts.buildForConversation(conversationId);

    const lines = burst.map((m) => {
      const body = m.content?.trim() || mediaPlaceholder(lang as BotLang, m.messageType);
      return `${m.index}. ${body}`;
    });
    const messages: ChatMessage[] = [
      ...base,
      { role: 'system', content: t(SEGMENTED_REPLY_SYSTEM, lang) },
      { role: 'user', content: t(SEGMENTED_REPLY_LIST, lang)(lines) },
    ];

    let raw: string;
    try {
      raw = await this.provider.chat(messages, { maxTokens: 700, json: true });
    } catch (err) {
      this.logger.warn(`Segmented reply generation failed: ${err}`);
      const single = await this.generateReply(conversationId);
      // >>> ANGGA — koreksi AUDIT (2026-08-10): jalur mundur ini SATU-SATUNYA
      // pintu yang bisa memulangkan segmen kosong (jalur burst normal sudah
      // disaring dua kali). Tanpa saringan di sini, `handleBurstReply`
      // mendraft gelembung kosong dan `notifyAdmin` untuk balasan kosong —
      // yang sudah dipasang di jalur tunggal — tidak punya padanan. <<<
      if (!single.text.trim()) return [];
      return [{ answersIndex: null, text: single.text, moneyGateIssues: single.moneyGateIssues }];
    }

    const validIndexes = new Set(burst.map((m) => m.index));
    try {
      const json = JSON.parse(this.extractJson(raw)) as {
        segments?: Array<{ menjawab?: unknown; balasan?: unknown }>;
      };
      const segments = (json.segments ?? [])
        .map((s) => {
          const text = stripDataFences(String(s.balasan ?? '')).trim();
          const idx = Number(s.menjawab);
          const answersIndex = Number.isInteger(idx) && validIndexes.has(idx) ? idx : null;
          return { answersIndex, text };
        })
        .filter((s) => s.text.length > 0);
      if (segments.length === 0) throw new Error('no usable segments');
      // >>> ANGGA — Fase 113: setiap segmen burst juga lewat gerbang uang.
      // Burst SELALU jadi draft apa pun hasilnya (lihat handleBurstReply di
      // wa-inbound.service.ts), tapi tanpa ini admin bisa melihat draft yang
      // masih memuat {{...}} mentah — gerbangnya tetap wajib jalan supaya
      // penanda pendek "gerbang uang menahan" tampil kalau perlu.
      // >>> ANGGA — F4/G4 (2026-08-09, cowork): BURST ikut kontrak komposisi.
      // Tanpa ini ada DUA bentuk balasan di sistem yang sama — kontrak untuk
      // balasan tunggal, prosa bebas untuk burst — dan kelas `funnel_dilanggar`
      // yang sudah mustahil di jalur tunggal tetap hidup di jalur burst.
      //
      // Aturannya beda satu hal dan itu penting: kalimat penutup cuma boleh
      // ada SEKALI untuk seluruh balasan, dan tempatnya di segmen TERAKHIR.
      // Segmen lain hanya dibersihkan dari salinannya (`tempel: false`) —
      // kalau tiap segmen ditempeli, pelanggan menerima pertanyaan yang sama
      // berkali-kali berturut-turut. Dijalankan SEBELUM gerbang uang supaya
      // penanda {{...}} di kalimatnya ikut disubstitusi.
      const segmenTerakhir = segments.length - 1;
      const tersusun = segments.map((s, i) => {
        const k = kontrakBalasanAktif()
          ? this.shipping?.komposisiFunnel?.(conversationId, s.text, { tempel: i === segmenTerakhir })
          : undefined;
        return { ...s, text: k ? k.text : s.text };
      }).filter((s) => s.text.trim().length > 0);
      // <<< ANGGA

      const withGate: Array<{ answersIndex: number | null; text: string; moneyGateIssues?: string[] }> = [];
      let ke = 0;
      for (const s of tersusun) {
        // >>> ANGGA — koreksi 2026-08-04 (audit gerbang uang #2): retry sekali
        // juga untuk tiap segmen burst, sama seperti balasan tunggal —
        // `base` (prompt dasar percakapan ini) sudah tersedia di scope ini.
        const gated = await this.gateMoneyTokens(conversationId, s.text, {
          messages: base,
          lang,
          model: undefined,
          // Retry segmen ini pun harus memakai aturan tempel yang SAMA dengan
          // penyusunan awalnya — kalau tidak, retry segmen tengah bisa
          // ditempeli kalimat penutup dan pelanggan menerimanya dua kali.
          tempel: ke === tersusun.length - 1,
        });
        ke += 1;
        withGate.push({ answersIndex: s.answersIndex, text: gated.text, moneyGateIssues: gated.issues });
      }
      // <<< ANGGA
      return withGate;
    } catch (err) {
      // >>> ANGGA: JANGAN pernah memakai `raw` sebagai teks balasan di sini.
      // Panggilan ini MEMINTA JSON; kalau yang datang bukan JSON, itu kegagalan
      // generasi, bukan balasan. Baris lama `stripDataFences(raw)` justru
      // menempelkan keluaran model mentah ke kotak draft — 2026-08-03 seorang
      // admin melihat `{"segments":[...]}</sai>{{...}}` utuh di sana.
      // Jalur mundur yang benar sudah ada: buat ulang sebagai balasan tunggal.
      this.logger.warn(`Segmented reply parse failed (${err}); falling back to single reply`);
      const single = await this.generateReply(conversationId);
      // >>> ANGGA — koreksi AUDIT (2026-08-10): jalur mundur ini SATU-SATUNYA
      // pintu yang bisa memulangkan segmen kosong (jalur burst normal sudah
      // disaring dua kali). Tanpa saringan di sini, `handleBurstReply`
      // mendraft gelembung kosong dan `notifyAdmin` untuk balasan kosong —
      // yang sudah dipasang di jalur tunggal — tidak punya padanan. <<<
      if (!single.text.trim()) return [];
      return [{ answersIndex: null, text: single.text, moneyGateIssues: single.moneyGateIssues }];
    }
  }

  /** Resolve bot language for a conversation (defaults to 'id'). */
  private async botLang(conversationId: string): Promise<string> {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { bot: { select: { language: true } } },
    });
    return row?.bot?.language ?? 'en';
  }

  /**
   * Analyze customer sentiment from the most recent customer messages.
   * Returns a structured result; never throws on parse failure.
   */
  async analyzeSentiment(conversationId: string, user?: ScopedUser): Promise<SentimentResult> {
    await assertConversationScope(this.prisma, conversationId, user);
    const [lang, history] = await Promise.all([
      this.botLang(conversationId),
      this.prompts.buildForConversation(conversationId, 30),
    ]);
    const customerLines = history
      .filter((m) => m.role === 'user')
      .slice(-10)
      .map((m) => `- ${m.content}`)
      .join('\n');

    const messages: ChatMessage[] = [
      { role: 'system', content: t(SENTIMENT_SYSTEM, lang) },
      {
        role: 'user',
        content:
          t(SENTIMENT_USER_PREFIX, lang) +
          (customerLines || t(SENTIMENT_NO_MESSAGES, lang)) +
          t(SENTIMENT_USER_SUFFIX, lang),
      },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0,
      json: true,
      maxTokens: 200,
    });

    const result = this.parseSentiment(raw);

    // Persist so we can build trend charts over time (fire-and-forget)
    this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        sentimentLabel: result.sentiment,
        sentimentScore: result.score,
        sentimentAt: new Date(),
      } as any,
    }).catch(() => {});

    return result;
  }

  private parseSentiment(raw: string): SentimentResult {
    const valid: Sentiment[] = ['positive', 'neutral', 'negative', 'frustrated'];
    try {
      const json = JSON.parse(this.extractJson(raw));
      const sentiment: Sentiment = valid.includes(json.sentiment)
        ? json.sentiment
        : 'neutral';
      const score = Math.max(0, Math.min(100, Number(json.score)));
      return {
        sentiment,
        score: Number.isFinite(score) ? score : 50,
        reason: typeof json.reason === 'string' ? json.reason : '',
      };
    } catch (err) {
      this.logger.warn(`Failed to parse sentiment: ${err}`);
      return { sentiment: 'neutral', score: 50, reason: 'unparseable' };
    }
  }

  async summarizeChat(conversationId: string, user?: ScopedUser): Promise<string> {
    await assertConversationScope(this.prisma, conversationId, user);
    const [lang, history] = await Promise.all([
      this.botLang(conversationId),
      this.prompts.buildForConversation(conversationId, 60),
    ]);
    const messages: ChatMessage[] = [
      { role: 'system', content: t(SUMMARIZE_SYSTEM, lang) },
      ...history.filter((m) => m.role !== 'system'),
      { role: 'user', content: t(SUMMARIZE_USER, lang) },
    ];
    return this.provider.chat(messages, { temperature: 0.3, maxTokens: 250 });
  }

  /**
   * Score the conversation as a sales lead (PRD 7.7) and persist the result
   * on the customer record.
   */
  async leadScore(conversationId: string, user?: ScopedUser): Promise<LeadScoreResult> {
    await assertConversationScope(this.prisma, conversationId, user);
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { customerId: true },
    });
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const [lang, history] = await Promise.all([
      this.botLang(conversationId),
      this.prompts.buildForConversation(conversationId, 40),
    ]);
    const messages: ChatMessage[] = [
      { role: 'system', content: t(LEAD_SCORE_SYSTEM, lang) },
      ...history.filter((m) => m.role !== 'system'),
      { role: 'user', content: t(LEAD_SCORE_USER, lang) },
    ];

    const raw = await this.provider.chat(messages, {
      temperature: 0,
      json: true,
      maxTokens: 300,
    });

    // Ground the LLM number in deterministic buying signals (audit #7). The
    // heuristic is a FLOOR, not a cap: a clear signal can't be under-scored by a
    // flaky model, but the LLM may still score higher for nuance the keywords
    // miss — we never suppress a potential hot lead on a sales tool.
    const signals = detectBuyingSignals(
      history.filter((m) => m.role === 'user').map((m) => m.content || ''),
    );
    const result = this.blendLeadScore(this.parseLeadScore(raw), signals);

    const before = await this.prisma.customer.findUnique({
      where: { id: conversation.customerId },
      select: { leadStage: true },
    });

    const customer = await this.prisma.customer.update({
      where: { id: conversation.customerId },
      data: { leadScore: result.score, leadStage: result.stage },
    });

    // Persist a stage-change event so closing analytics can compute funnel
    // velocity. Fire-and-forget — never blocks the scoring response.
    if (before && before.leadStage !== result.stage) {
      void this.prisma.auditLog.create({
        data: {
          action: 'ai_lead_stage_changed',
          entityType: 'Customer',
          entityId: conversation.customerId,
          oldValue: { stage: before.leadStage, conversationId },
          newValue: { stage: result.stage, score: result.score, conversationId, reasons: result.reasons },
        },
      });
    }

    if (
      result.stage === LeadStage.hot ||
      result.stage === LeadStage.very_hot
    ) {
      this.notifications.send(
        `🔥 Hot Lead (${result.score})\n${customer.name ?? customer.phoneNumber}\n${result.reasons.slice(0, 3).join(', ')}`,
      );
      this.webhooks?.deliver('lead.hot', {
        customerId: customer.id,
        customerName: customer.name,
        phoneNumber: customer.phoneNumber,
        leadScore: result.score,
        leadStage: result.stage,
        reasons: result.reasons,
      }).catch(() => undefined);
    }

    return result;
  }

  /**
   * Merge the LLM score with deterministic buying signals. Final score is the
   * higher of the two (floor); reasons combine both, signals first so the
   * concrete, explainable triggers lead. Stage is re-derived from the final.
   */
  private blendLeadScore(
    llm: LeadScoreResult,
    signals: BuyingSignals,
  ): LeadScoreResult {
    const score = Math.max(llm.score, signals.score);
    const reasons = Array.from(new Set([...signals.reasons, ...llm.reasons]));
    return { score, stage: this.stageFromScore(score), reasons };
  }

  private parseLeadScore(raw: string): LeadScoreResult {
    let score = 0;
    let stage: LeadStage = LeadStage.cold;
    let reasons: string[] = [];
    try {
      const json = JSON.parse(this.extractJson(raw));
      score = Math.max(0, Math.min(100, Number(json.score) || 0));
      reasons = Array.isArray(json.reasons) ? json.reasons.map(String) : [];
      stage = this.stageFromScore(score, json.stage);
    } catch (err) {
      this.logger.warn(`Failed to parse lead score: ${err}`);
    }
    return { score, stage, reasons };
  }

  private stageFromScore(score: number, given?: string): LeadStage {
    if (given && (LeadStage as Record<string, string>)[given]) {
      return given as LeadStage;
    }
    if (score >= 81) return LeadStage.very_hot;
    if (score >= 61) return LeadStage.hot;
    if (score >= 31) return LeadStage.warm;
    return LeadStage.cold;
  }

  /**
   * >>> ANGGA: Tolerate models that wrap JSON in prose or code fences.
   *
   * Dulu isinya "kurung buka pertama sampai kurung tutup TERAKHIR" — rapuh
   * begitu model menulis apa pun sesudah JSON-nya. Sekarang mendelegasikan ke
   * pemindai kedalaman kurung bersama (`common/json-extract.util.ts`) yang
   * berhenti di objek pertama yang tertutup sempurna. Mengembalikan string
   * kosong kalau tidak ada — biar `JSON.parse` melempar dan pemanggilnya masuk
   * jalur galat yang sudah ada, bukan diam-diam salah.
   */
  private extractJson(raw: string): string {
    return extractFirstJson(raw) ?? '';
  }
}

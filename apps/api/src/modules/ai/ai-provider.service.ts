import {
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { MetricsService } from '../../common/metrics/metrics.service';
import { catatPanggilanAi, type JejakPanggilanAi } from '../../common/ai-call-trace';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask the provider for a JSON object response when supported. */
  json?: boolean;
  tools?: any[];
  /**
   * >>> ANGGA — F4 (2026-08-09, cowork): `tool_choice` yang dikirim apa adanya
   * ke provider. Default tetap `'auto'` — SATU-SATUNYA pemakai nilai lain
   * adalah percobaan PAKSA `send_reply` di `AiService.generateReply`, saat
   * model sudah selesai memanggil tool data tapi tidak menyerahkan balasannya
   * lewat kontrak. Dibiarkan bertipe longgar karena bentuknya milik protokol
   * OpenAI-compatible, bukan milik kita; `reply.tools.ts` yang menyediakan
   * konstanta bentuknya (`SEND_REPLY_TOOL_CHOICE`) supaya tidak ada string
   * ajaib bertebaran. <<<
   */
  toolChoice?: unknown;
}

export interface ChatResponse {
  content: string;
  tool_calls?: any[];
  /**
   * >>> ANGGA — 2026-08-10: `finish_reason` dari provider, diteruskan apa
   * adanya. Ini SATU field yang memisahkan tiga hipotesis yang gejalanya
   * identik ("balasan kosong"): `length` = anggaran token habis · `stop` =
   * model memang memilih diam · `content_filter` = ditolak moderasi. Selama
   * dua hari ketiganya ditebak bergantian tanpa pernah dibedakan.
   */
  finish_reason?: string;
  /** Jumlah token prompt menurut provider — untuk menguji hipotesis "prompt kepanjangan". */
  prompt_tokens?: number;
}

/**
 * >>> ANGGA — F6 Bagian 1 butir 1 (2026-08-11, cowork): KUNCI RUTE PENYEDIA.
 *
 * `allow_fallbacks:false` menyuruh OpenRouter TIDAK berpindah ke penyedia hulu
 * cadangan. Itu yang membuat pengukuran berulang membandingkan hal yang sama —
 * gerbang lulus F6 ("3x berulang, sebaran < 5 poin") mustahil dipenuhi kalau
 * tiap putaran boleh dilayani penyedia yang berbeda.
 *
 * SENGAJA di balik saklar, bawaan MATI, atas ketok Bossfren 2026-08-11.
 * Produksi tetap punya fallback: rute terkunci berarti penyedia hulu tumbang =
 * panggilan GAGAL KERAS, dan itu keputusan operasional tersendiri yang tidak
 * boleh diselundupkan lewat pekerjaan alat ukur. Yang menyalakannya cuma
 * `tools/eval/replay.mjs`.
 *
 * Dibaca SAAT DIPAKAI, bukan konstanta tingkat modul — di Nest seluruh `import`
 * dievaluasi SEBELUM `ConfigModule.forRoot()` memuat `.env`, jadi konstanta
 * tingkat modul menghasilkan saklar yang tidak bisa dinyalakan lewat cara yang
 * didokumentasikan sendiri. `REPLY_CONTRACT_ENABLED` sudah sekali kena persis
 * itu (audit selesai-167). <<<
 */
function kunciRutePenyedia(): boolean {
  return process.env.EVAL_LOCK_PROVIDER === 'true';
}

/**
 * >>> ANGGA — F6 Bagian 1, OPSI C (2026-08-11, ketok Bossfren): TOMBOL LENGAN EVAL.
 *
 * Gerbang F6 adalah gerbang VALIDASI ALAT, bukan gerbang mutu bot — nota
 * handover menuliskannya sendiri. Lengan yang menjawab gerbang itu dijalankan
 * `temperature 0` supaya sisa sebaran apa pun MUSTAHIL berasal dari sampling
 * model, dan karena itu pasti cacat alat. Lengan kedua tetap temperature
 * produksi untuk memvonis F4 — kelas bug yang membunuh F4 (parafrase kalimat
 * funnel → pertanyaan dobel terkirim) adalah fenomena SAMPLING dan di
 * temperature 0 ia sebagian besar lenyap.
 *
 * Nilai kosong / bukan angka DIABAIKAN, tidak diteruskan sebagai `NaN`.
 * `NaN` di `temperature` akan diserialkan JSON jadi `null` dan diam-diam
 * mengubah arti payload — kelas kegagalan senyap yang tidak boleh ada di
 * dalam alat ukur. Dibaca SAAT DIPAKAI, alasan sama dengan saklar di atas. <<<
 */
function angkaEnvEval(nama: 'EVAL_TEMPERATURE' | 'EVAL_SEED'): number | null {
  const mentah = process.env[nama];
  if (mentah === undefined || mentah.trim() === '') return null;
  const n = Number(mentah);
  if (!Number.isFinite(n)) return null;
  // >>> KOREKSI AUDIT K23 (A8, 2026-08-11): `Number.isFinite` saja meloloskan
  // `EVAL_TEMPERATURE=3`, `=-1`, `EVAL_SEED=42.5`, `=1e99` — semuanya masuk
  // payload apa adanya dan memancing 400 dari hulu, yang non-transient
  // sehingga tidak di-retry dan menjatuhkan seluruh putaran pengukuran.
  // Yang TIDAK kulakukan: membuang `seed` dari payload untuk endpoint yang
  // mungkin menolaknya — premis itu tidak terbukti (penyanggal: `seed` standar
  // di OpenAI/OpenRouter/vLLM) dan menambal atas dugaan yang tak terkonfirmasi
  // adalah persis yang pakem 8c larang. Yang terbukti cuma rentangnya. <<<
  if (nama === 'EVAL_TEMPERATURE') return n >= 0 && n <= 2 ? n : null;
  return Number.isInteger(n) ? n : null;
}

/**
 * Thin client for any OpenAI-compatible chat API. Provider config (base URL,
 * API key, model, temperature, timeout) is resolved from SettingsService at
 * call time, so an admin can change it from the dashboard with no redeploy.
 * SettingsService layers DB overrides over the AI_* env defaults.
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  // ponytail: one retry on transient failures (network / 5xx / 429); 4xx is a
  // bad request and never retried. Raise RETRIES if a flaky provider needs it.
  private static readonly RETRIES = 1;
  private static readonly RETRY_BACKOFF_MS = 300;

  constructor(
    private readonly settings: SettingsService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /** Public, non-secret config for the dashboard. */
  async getConfig() {
    const ai = await this.settings.ai();
    return { baseUrl: ai.baseUrl, defaultModel: ai.model };
  }

  async defaultModel(): Promise<string> {
    return (await this.settings.ai()).model;
  }

  /** Model for the Sentinel supervisor; falls back to the CS bot model. */
  async sentinelModel(): Promise<string> {
    const ai = await this.settings.ai();
    return ai.sentinelModel || ai.model;
  }

  private headers(apiKey: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) h.Authorization = `Bearer ${apiKey}`;
    return h;
  }

  /** List model ids advertised by the configured base URL. */
  async listModels(): Promise<string[]> {
    const ai = await this.settings.ai();
    try {
      const res = await fetch(`${ai.baseUrl}/models`, {
        headers: this.headers(ai.apiKey),
        signal: AbortSignal.timeout(ai.timeoutMs),
      });
      if (!res.ok) {
        throw new Error(`Provider returned ${res.status}`);
      }
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      return (body.data ?? []).map((m) => m.id).sort();
    } catch (err) {
      this.logger.error(`listModels failed: ${err}`);
      throw new ServiceUnavailableException(
        'Could not reach AI provider to list models',
      );
    }
  }

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const res = await this.chatWithTools(messages, opts);
    return res.content;
  }

  async chatWithTools(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResponse> {
    const ai = await this.settings.ai();
    const payload: Record<string, unknown> = {
      model: opts.model ?? ai.model,
      messages,
      temperature: opts.temperature ?? ai.temperature,
    };
    if (opts.maxTokens) payload.max_tokens = opts.maxTokens;
    if (opts.json) payload.response_format = { type: 'json_object' };
    if (opts.tools && opts.tools.length > 0) {
      payload.tools = opts.tools;
      payload.tool_choice = opts.toolChoice ?? 'auto'; // >>> ANGGA — F4 <<<
    }
    // >>> ANGGA — F6 Bagian 1 (2026-08-11): kunci rute, lihat catatan di atas.
    // Kuncinya TIDAK ditulis sama sekali saat saklar mati — bukan ditulis
    // `true`, supaya payload produksi byte-per-byte sama dengan sebelum
    // perubahan ini dan tidak ada perilaku baru yang menyelinap. <<<
    const ruteTerkunci = kunciRutePenyedia();
    if (ruteTerkunci) payload.provider = { allow_fallbacks: false };
    // >>> ANGGA — KOREKSI AUDIT K23 (2026-08-11, ronde penyanggal). Versi
    // pertama menimpa temperature SESUDAH `opts.temperature ?? ai.temperature`,
    // dengan alasan tertulis "Sentinel & learning-miner mengirim temperature
    // sendiri (0/0.1/0.2/0.3), kalau tidak ditimpa sebagian panggilan tetap
    // stokastik". **Alasan itu SALAH**, dan inventaris pemanggil membuktikannya:
    //
    //   - pemanggil in-turn yang mengirim temperature EKSPLISIT semuanya sudah 0
    //     (`shipping.service.ts:917` extractOrderTarget, `sentinel.service.ts:283`
    //     llmReview) — menimpanya 0→0, nol manfaat
    //   - yang 0.2/0.1/0.3 semuanya dipicu ADMIN dan TIDAK PERNAH jalan di dalam
    //     giliran (`learning-miner:225/255`, `sentinel:471/547`, `ai.service:946`)
    //
    // Jadi penimpaan-sesudah tidak menambah determinisme apa pun pada giliran
    // yang diukur, tapi MENJANGKAU jalur non-eval: selama sesi ukur berjalan,
    // `minePersona`/`minePlaybook` yang ditekan admin menulis baris
    // `learningProposal` ke DB pada temperature 0 alih-alih 0.2/0.1, permanen
    // dan tanpa penanda apa pun. Efek samping di luar sasaran alat ukur.
    //
    // ⚠️ Tapi auditor pertama menyimpulkan dari situ "cabut saja penimpaannya",
    // dan ITU JUGA SALAH — penyanggal membuktikannya. EMPAT pemanggil in-turn
    // tidak mengirim temperature sama sekali sehingga jatuh ke `ai.temperature`
    // = 0.6, dan salah satunya GENERATOR BALASAN UTAMA (`ai.service.ts:444`,
    // plus `:289` retry, `:606` percobaan paksa, `:768` burst). Merekalah yang
    // membuat giliran stokastik, dan merekalah yang memang harus dipatok.
    //
    // Bentuk yang benar karena itu: tombol lengan jadi **DEFAULT**, bukan
    // PENIMPA. Pemanggil yang menyebut temperature-nya sendiri tetap dihormati
    // (learning-miner aman), pemanggil yang diam dipatok (empat jalur di atas
    // ikut lengan). Diagnosisnya dari auditor, resepnya bukan. <<<
    const suhuEval = angkaEnvEval('EVAL_TEMPERATURE');
    if (suhuEval !== null && opts.temperature === undefined) payload.temperature = suhuEval;
    const seedEval = angkaEnvEval('EVAL_SEED');
    if (seedEval !== null) payload.seed = seedEval;
    // Deklarasi LENGAN, dibaca dari env apa adanya — BUKAN diturunkan dari jalur
    // kode yang kebetulan terlewati giliran ini. Lihat catatan NB-5 di
    // `ai-call-trace.ts`: menurunkannya dari jalur menghasilkan tanda tangan
    // yang berubah-ubah menurut cabang mana yang aktif.
    const lenganEval = { temperature: suhuEval, seed: seedEval, kunciRute: ruteTerkunci };

    const model = String(payload.model);
    const total = AiProviderService.RETRIES + 1;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= total; attempt++) {
      // >>> ANGGA — F6 Bagian 1 (2026-08-11): SATU entri jejak per PERCOBAAN,
      // termasuk percobaan yang GAGAL. Retry transient justru tempat rute
      // berpindah penyedia; kalau hanya percobaan sukses yang dicatat,
      // perpindahan itu tak terlihat — padahal itu confound yang dicari. <<<
      const t0 = Date.now();
      const catat = (bagian: Partial<JejakPanggilanAi>) =>
        catatPanggilanAi({
          modelDiminta: model,
          modelDilayani: null,
          penyedia: null,
          idGenerasi: null,
          promptTokens: null,
          completionTokens: null,
          finishReason: null,
          percobaan: attempt,
          // Dicatat supaya `kesahihan.mjs` bisa MENOLAK membandingkan dua
          // berkas hasil dari lengan yang berbeda. Begitu ada dua lengan,
          // kesalahan termudah adalah menyandingkan angka lengan 1 dengan
          // lengan 2 lalu menyimpulkan salah — alat harus menolaknya, bukan
          // mengandalkan orang ingat.
          temperature: typeof payload.temperature === 'number' ? payload.temperature : null,
          // NB-4: dibaca dari PAYLOAD, sama seperti `temperature` di atas —
          // versi pertama membaca `seedEval` (env) sehingga satu objek memuat
          // satu klaim payload dan satu klaim env.
          seed: typeof payload.seed === 'number' ? payload.seed : null,
          lenganEval,
          ms: Date.now() - t0,
          payloadMintaKunciRute: ruteTerkunci,
          galat: null,
          ...bagian,
        });
      let res: Response;
      try {
        res = await fetch(`${ai.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: this.headers(ai.apiKey),
          body: JSON.stringify(payload),
          // H8: bound the wait so a hung provider can't stall auto-reply forever.
          signal: AbortSignal.timeout(ai.timeoutMs),
        });
      } catch (err) {
        // Network/timeout — transient, retry if attempts remain.
        catat({ galat: String(err) });
        lastErr = err;
        this.logger.warn(`chat request failed (attempt ${attempt}/${total}): ${err}`);
        if (attempt < total) {
          await this.backoff(attempt);
          continue;
        }
        throw new ServiceUnavailableException('Could not reach AI provider');
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Retry only transient server-side statuses; 4xx (except 429) is our bug.
        const transient = res.status >= 500 || res.status === 429;
        catat({ galat: `HTTP ${res.status}: ${text.slice(0, 200)}` });
        this.logger.error(`chat error ${res.status} (attempt ${attempt}/${total}): ${text}`);
        if (transient && attempt < total) {
          await this.backoff(attempt);
          continue;
        }
        throw new ServiceUnavailableException(`AI provider error (${res.status})`);
      }

      // >>> ANGGA — fix (2026-08-10, TERUKUR di lapangan): `res.json()` DULU
      // berada di luar blok `try` yang menjaga `fetch`. Itu bukan detail gaya
      // — `AbortSignal.timeout` menghitung SELURUH permintaan termasuk
      // pembacaan badan, dan OpenRouter memulangkan header lebih dulu lalu
      // menahan badan selama model menulis. Jadi hampir seluruh waktu generasi
      // jatuh di baris ini, DI LUAR penjagaan. Akibatnya `TimeoutError` mentah
      // lolos tanpa dibungkus, retry transient tidak pernah berjalan, dan
      // `AllExceptionsFilter` memulangkannya sebagai HTTP 500 dengan pesan apa
      // adanya ("The operation was aborted due to timeout") — persis yang
      // terlihat di 3 dari 5 putaran pengukuran. Sekarang di dalam penjagaan:
      // timeout jadi transient BENERAN, kena retry, dan kalau tetap gagal
      // keluar sebagai 503 yang jujur. <<<
      let body: {
        choices?: Array<{ message?: { content?: string, tool_calls?: any[] }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        // >>> ANGGA — F6 Bagian 1 (2026-08-11): field khas OpenRouter. SEMUANYA
        // opsional dengan sengaja — badan respons sungguhan dari repo ini belum
        // pernah kulihat sendiri, jadi ketiadaannya harus terbaca sebagai batas
        // alat ukur (`penyedia: null` = TIDAK DILAPORKAN), bukan diam-diam jadi
        // nol yang terlihat seperti temuan. <<<
        provider?: string;
        model?: string;
        id?: string;
      };
      try {
        body = (await res.json()) as typeof body;
      } catch (err) {
        catat({ galat: `badan tidak terbaca: ${err}` });
        lastErr = err;
        this.logger.warn(`chat body gagal dibaca (attempt ${attempt}/${total}): ${err}`);
        if (attempt < total) {
          await this.backoff(attempt);
          continue;
        }
        throw new ServiceUnavailableException('Could not read AI provider response');
      }
      this.recordTokens(model, body.usage);
      catat({
        penyedia: body.provider ?? null,
        modelDilayani: body.model ?? null,
        idGenerasi: body.id ?? null,
        promptTokens: body.usage?.prompt_tokens ?? null,
        completionTokens: body.usage?.completion_tokens ?? null,
        finishReason: body.choices?.[0]?.finish_reason ?? null,
      });
      const msg = body.choices?.[0]?.message;
      return {
        content: msg?.content?.trim() ?? '',
        tool_calls: msg?.tool_calls,
        finish_reason: body.choices?.[0]?.finish_reason,
        prompt_tokens: body.usage?.prompt_tokens,
      };
    }
    // Unreachable (loop either returns or throws) — satisfy the type checker.
    throw new ServiceUnavailableException(`Could not reach AI provider: ${lastErr}`);
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((r) =>
      setTimeout(r, AiProviderService.RETRY_BACKOFF_MS * attempt),
    );
  }

  /** Emit token usage so spend is visible per model (no-op if unmeasured). */
  private recordTokens(
    model: string,
    usage?: { prompt_tokens?: number; completion_tokens?: number },
  ): void {
    if (!usage || !this.metrics) return;
    if (usage.prompt_tokens) {
      this.metrics.aiTokens.inc({ model, kind: 'prompt' }, usage.prompt_tokens);
    }
    if (usage.completion_tokens) {
      this.metrics.aiTokens.inc({ model, kind: 'completion' }, usage.completion_tokens);
    }
  }
}

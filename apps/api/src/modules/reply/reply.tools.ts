/**
 * >>> ANGGA — F4 (2026-08-09, cowork): REPLY CONTRACT.
 *
 * Akar deadlock `funnel_dilanggar` bukan prosanya, melainkan CARA kalimat
 * funnel wajib diperiksa: ia diharapkan nyempil di dalam prosa lalu dicocokkan
 * `normSubstituted.includes(normKalimatWajib)` — string matching terhadap
 * kalimat yang kita tulis sendiri, jadi parafrase sedikit saja langsung tertahan.
 *
 * F4 memindahkan pertanyaan funnel KELUAR dari prosa:
 *   1. model menyerahkan balasannya lewat tool `send_reply` — argumennya
 *      ditegakkan provider lewat function calling, jalur yang sudah bekerja di
 *      codebase ini (`search_destinations`/`calculate_shipping`);
 *   2. `funnel_question_id` adalah enum WAJIB, jadi secara struktur tidak bisa
 *      hilang — model harus MENYATAKAN langkah yang sedang ia tutup;
 *   3. kalimat funnel-nya sendiri disusun SISTEM (`susunBalasan` di
 *      `order-brain.ts`), bukan diharap muncul dari model.
 *
 * KENAPA BUKAN structured output provider (revisi K23, terverifikasi):
 * `ai-provider.service.ts` hanya mendukung `response_format: { type:
 * 'json_object' }` — JSON mode polos, TANPA `json_schema` strict. Skema tidak
 * akan ditegakkan provider. Function calling menegakkannya, dan tidak butuh
 * kemampuan provider baru sama sekali.
 *
 * BATAS PERAN di F4: `funnel_question_id` yang dinyatakan model adalah
 * TELEMETRI + cek-silang, BUKAN pemutus. Yang memutus kalimat mana yang
 * ditempel tetap `funnelExpect` milik sistem. Model tidak boleh memilih
 * langkah funnel-nya sendiri — itu justru yang mau kita hindari. Pergeseran
 * "tool jadi pemutus" adalah pekerjaan F5, sesudah korpus eval (F6) ada untuk
 * membuktikannya tidak menurunkan mutu.
 */

/**
 * Daftar langkah funnel — HARUS sinkron dengan `pilih(...)` di
 * `ShippingService.funnelDirective`. `closing_followup` ikut karena step itu
 * lahir pasca-rollback (`e4415a5`) dan SENGAJA mem-bypass cap 2x tanya;
 * meninggalkannya di luar enum berarti model tidak punya cara jujur
 * menyatakan giliran itu. `none` untuk giliran yang memang tidak menutup
 * langkah apa pun (basa-basi, belokan topik) — tanpa itu model dipaksa
 * berbohong memilih salah satu langkah.
 */
export const FUNNEL_QUESTION_IDS = [
  'barang',
  'alamat',
  'keranjang',
  'qty',
  'total',
  'patokan',
  'closing',
  'closing_followup',
  'none',
] as const;
export type FunnelQuestionId = (typeof FUNNEL_QUESTION_IDS)[number];

export const DATA_STATUSES = ['computed', 'unavailable'] as const;
export type DataStatus = (typeof DATA_STATUSES)[number];

export const SEND_REPLY_TOOL_NAME = 'send_reply';

export const sendReplyTool = {
  type: 'function',
  function: {
    name: SEND_REPLY_TOOL_NAME,
    description:
      'WAJIB dipanggil untuk MENGIRIM balasan ke pelanggan. Ini satu-satunya cara ' +
      'balasanmu sampai — teks biasa di luar tool ini TIDAK terkirim. Panggil ' +
      'SETELAH semua tool data yang kamu butuhkan (search_destinations, ' +
      'calculate_shipping, search_knowledge) selesai dan hasilnya sudah kamu terima. ' +
      'Jangan panggil tool ini kalau kamu masih perlu memanggil tool data.',
    parameters: {
      type: 'object',
      properties: {
        answer: {
          type: 'string',
          description:
            'Teks balasan lengkap untuk pelanggan dalam Bahasa Indonesia, mengikuti ' +
            'SELURUH arahan di prompt sistem — termasuk kalimat penutup alur penjualan ' +
            'bila memang diarahkan. Boleh memuat penanda {{...}}; sistem yang mengisi nilainya.',
        },
        funnel_question_id: {
          type: 'string',
          enum: [...FUNNEL_QUESTION_IDS],
          description:
            'Langkah alur penjualan yang DITUTUP balasan ini. Isi "none" kalau giliran ' +
            'ini memang tidak menutup langkah apa pun (basa-basi, pertanyaan umum, ' +
            'belokan topik). Jangan mengarang langkah yang tidak diarahkan prompt sistem.',
        },
        data_status: {
          type: 'string',
          enum: [...DATA_STATUSES],
          description:
            '"computed" kalau setiap angka/fakta yang kamu sebut berasal dari hasil tool ' +
            'atau data referensi yang diberikan. "unavailable" kalau ada data yang kamu ' +
            'butuhkan tapi tidak tersedia, sehingga balasanmu belum bisa memuatnya.',
        },
      },
      required: ['answer', 'funnel_question_id', 'data_status'],
    },
  },
};

/** Hasil pembacaan argumen `send_reply` — plus catatan jujur soal apa yang tidak beres. */
export interface ReplyContract {
  answer: string;
  funnelQuestionId: FunnelQuestionId;
  dataStatus: DataStatus;
  /** Nilai enum MENTAH yang model kirim, apa adanya — untuk telemetri. */
  funnelQuestionIdMentah: string;
  /** Field yang hilang / di luar enum. Kosong = kontrak dipatuhi utuh. */
  pelanggaranSkema: string[];
}

/**
 * Baca argumen `send_reply`. Sengaja PEMAAF terhadap enum: nilai di luar daftar
 * TIDAK membatalkan balasan, cuma dicatat di `pelanggaranSkema` lalu
 * dinormalisasi. Alasannya — nilai enum ini telemetri, bukan pemutus; membuang
 * balasan yang isinya benar hanya karena label langkahnya meleset justru
 * menurunkan mutu jawaban ke pelanggan.
 *
 * Yang TIDAK dimaafkan cuma satu: `answer` kosong. Kontrak tanpa isi bukan
 * balasan, dan memperlakukannya sebagai balasan akan mengirim pesan kosong.
 */
/**
 * >>> ANGGA — 2026-08-10: PENYELAMAT ARGUMEN TERPOTONG **DICABUT**.
 *
 * Ia dipasang supaya balasan yang terpotong `max_tokens` tetap terkirim, dengan
 * alasan "kembali ke paritas pra-F4". Di lapangan ia justru MENCIPTAKAN bug
 * yang tidak pernah ada sebelumnya: pemotongan jatuh di tengah `{{kota_tujuan}}`
 * dan pelanggan menerima `Siap ka, untuk pengiriman ke {{` — fragmen yang lolos
 * semua gerbang. Lalu penyelamat itu kutambal lagi supaya membuang sisa
 * penanda: tambalan di atas tambalan.
 *
 * Keduanya dibuang. Argumen yang tidak bisa diurai = generasi GAGAL, dan
 * kegagalan ditangani sebagai kegagalan (loop mencoba lagi, lalu balasan kosong
 * membangunkan admin) — bukan diselamatkan jadi potongan kalimat yang
 * setengah-setengah. Menyelamatkan keluaran rusak selalu terasa murah hati di
 * kode dan terlihat memalukan di layar pelanggan.
 */
export function parseReplyContract(rawArgs: string): ReplyContract | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;

  const answer = typeof obj.answer === 'string' ? obj.answer.trim() : '';
  if (!answer) return null;

  const pelanggaranSkema: string[] = [];

  const idMentah =
    typeof obj.funnel_question_id === 'string' ? obj.funnel_question_id.trim().toLowerCase() : '';
  const idValid = (FUNNEL_QUESTION_IDS as readonly string[]).includes(idMentah);
  if (!idValid) pelanggaranSkema.push(idMentah ? `funnel_question_id="${idMentah}"` : 'funnel_question_id hilang');

  const statusMentah =
    typeof obj.data_status === 'string' ? obj.data_status.trim().toLowerCase() : '';
  const statusValid = (DATA_STATUSES as readonly string[]).includes(statusMentah);
  if (!statusValid) pelanggaranSkema.push(statusMentah ? `data_status="${statusMentah}"` : 'data_status hilang');

  return {
    answer,
    funnelQuestionId: idValid ? (idMentah as FunnelQuestionId) : 'none',
    dataStatus: statusValid ? (statusMentah as DataStatus) : 'computed',
    funnelQuestionIdMentah: idMentah,
    pelanggaranSkema,
  };
}

/** `tool_choice` yang memaksa provider memanggil `send_reply` — dipakai di percobaan paksa. */
export const SEND_REPLY_TOOL_CHOICE = {
  type: 'function',
  function: { name: SEND_REPLY_TOOL_NAME },
} as const;

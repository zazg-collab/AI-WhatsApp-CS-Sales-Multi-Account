import { readFileSync } from 'fs';
import { join } from 'path';
import {
  sendReplyTool,
  parseReplyContract,
  FUNNEL_QUESTION_IDS,
  SEND_REPLY_TOOL_NAME,
  SEND_REPLY_TOOL_CHOICE,
} from './reply.tools';

/**
 * >>> ANGGA — F4 (2026-08-09, cowork). Dua hal yang dijaga di sini:
 *  1. enum `funnel_question_id` TIDAK BOLEH ketinggalan langkah funnel —
 *     kalau `funnelDirective` menambah langkah dan enum ini tidak ikut, model
 *     kehilangan cara jujur menyatakan giliran itu dan telemetrinya bohong;
 *  2. pembacaan argumen harus PEMAAF soal label tapi KERAS soal isi.
 */
describe('reply.tools — Reply Contract', () => {
  it('skema tool: nama, tiga field wajib, enum langkah lengkap', () => {
    expect(sendReplyTool.function.name).toBe(SEND_REPLY_TOOL_NAME);
    const p: any = sendReplyTool.function.parameters;
    expect(p.required).toEqual(['answer', 'funnel_question_id', 'data_status']);
    expect(p.properties.funnel_question_id.enum).toEqual([...FUNNEL_QUESTION_IDS]);
    expect(p.properties.data_status.enum).toEqual(['computed', 'unavailable']);
  });

  it('enum memuat closing_followup (langkah pasca-rollback yang bypass cap 2x tanya)', () => {
    expect(FUNNEL_QUESTION_IDS).toContain('closing_followup');
    expect(FUNNEL_QUESTION_IDS).toContain('none');
  });

  /**
   * Penjaga anti-drift yang sesungguhnya: enum di atas ditulis TANGAN, sedangkan
   * langkah funnel yang sebenarnya lahir dari `pilih('<langkah>', ...)` di
   * `ShippingService.funnelDirective`. Test ini membaca berkas itu dan menolak
   * kalau ada langkah yang tidak punya tempat di enum — supaya penambahan
   * langkah berikutnya (seperti `closing_followup` dulu) tidak diam-diam
   * membuat model kehilangan cara jujur menyatakan gilirannya.
   */
  it('enum sinkron dengan seluruh langkah `pilih(...)` di funnelDirective', () => {
    const kode = readFileSync(
      join(__dirname, '..', 'shipping', 'shipping.service.ts'),
      'utf8',
    );
    const langkah = new Set(
      [...kode.matchAll(/\bpilih\(\s*'([a-z_]+)'/g)].map((m) => m[1]),
    );
    expect(langkah.size).toBeGreaterThan(0);
    for (const l of langkah) expect(FUNNEL_QUESTION_IDS).toContain(l);
  });

  it('tool_choice paksa menunjuk tool yang benar', () => {
    expect(SEND_REPLY_TOOL_CHOICE).toEqual({
      type: 'function',
      function: { name: 'send_reply' },
    });
  });

  it('kontrak lengkap terbaca utuh, tanpa catatan pelanggaran', () => {
    const k = parseReplyContract(
      JSON.stringify({ answer: '  Halo kak  ', funnel_question_id: 'qty', data_status: 'computed' }),
    );
    expect(k).toEqual({
      answer: 'Halo kak',
      funnelQuestionId: 'qty',
      dataStatus: 'computed',
      funnelQuestionIdMentah: 'qty',
      pelanggaranSkema: [],
    });
  });

  it('enum di luar daftar TIDAK membatalkan balasan — dinormalisasi + dicatat', () => {
    const k = parseReplyContract(
      JSON.stringify({ answer: 'isi', funnel_question_id: 'ongkir', data_status: 'entah' }),
    );
    expect(k?.answer).toBe('isi');
    expect(k?.funnelQuestionId).toBe('none');
    expect(k?.dataStatus).toBe('computed');
    expect(k?.funnelQuestionIdMentah).toBe('ongkir');
    expect(k?.pelanggaranSkema).toEqual(['funnel_question_id="ongkir"', 'data_status="entah"']);
  });

  it('field hilang dicatat sebagai hilang, bukan sebagai nilai kosong', () => {
    const k = parseReplyContract(JSON.stringify({ answer: 'isi' }));
    expect(k?.pelanggaranSkema).toEqual(['funnel_question_id hilang', 'data_status hilang']);
  });

  /**
   * >>> ANGGA — 2026-08-10: penyelamat argumen terpotong DICABUT sesudah
   * terbukti menciptakan bug di layar pelanggan (`Siap ka, untuk pengiriman ke
   * {{`). Test-test lamanya yang menjamin "answer diselamatkan" ikut dibuang —
   * menyimpan test untuk perilaku yang sengaja dihapus cuma akan memaksa
   * penyunting berikutnya menghidupkannya kembali. Diganti satu test yang
   * menjaga PENCABUTANNYA.
   */
  it('argumen terpotong → null, TIDAK diselamatkan jadi potongan kalimat', () => {
    const utuh = JSON.stringify({
      answer: 'Siap ka, untuk pengiriman ke {{kota_tujuan}} ongkirnya {{ongkir}}',
      funnel_question_id: 'qty',
      data_status: 'computed',
    });
    expect(parseReplyContract(utuh.slice(0, utuh.indexOf('{{kota') + 2))).toBeNull();
    expect(parseReplyContract(utuh.slice(0, 40))).toBeNull();
  });

  it('answer kosong / JSON rusak / bukan objek → null (jangan pernah kirim pesan kosong)', () => {
    expect(parseReplyContract(JSON.stringify({ answer: '   ', funnel_question_id: 'qty' }))).toBeNull();
    expect(parseReplyContract('{bukan json')).toBeNull();
    expect(parseReplyContract(JSON.stringify(['a']))).toBeNull();
    expect(parseReplyContract('null')).toBeNull();
  });
});

#!/usr/bin/env node
/**
 * >>> ANGGA — LANGKAH 3 / alat ukur (2026-08-10, cowork): SEBERAPA SERING
 * PERTANYAAN FUNNEL BENAR-BENAR SAMPAI KE PELANGGAN?
 *
 * Kenapa berkas ini ada, dan kenapa ia BUKAN counter Prometheus.
 * Pertanyaan yang harus dijawab sebelum menambah satu panggilan LLM per
 * giliran (biaya +33%..+100%) adalah: berapa banyak giliran yang berlalu TANPA
 * satu pun pertanyaan funnel sampai ke pelanggan? Percobaan pertama menjawabnya
 * dengan counter yang dinaikkan dari `funnelDirective` — dan itu DICABUT, karena
 * sumbernya (`funnelExpect`) ditulis saat prompt DISUSUN: ia menyala juga untuk
 * pertanyaan yang sengaja DIBUNGKAM cap anti-cerewet, dan tidak pernah
 * di-rollback kalau balasannya tidak jadi terkirim. Ia mengukur NIAT SISTEM.
 *
 * Yang jujur sudah ada dan sudah dibayar ongkos rekayasanya: baris `funnel_ask`
 * di `order_context_events`, ditulis HANYA sesudah pesannya benar-benar
 * terkirim (`promosikanLangkahTerkirim`), tahan restart, berstempel waktu.
 * Alat ini cuma membacanya. Nol perubahan di jalur balasan, nol biaya runtime.
 *
 * Pemakaian:
 *   node tools/eval/funnel-ask-audit.mjs
 *   node tools/eval/funnel-ask-audit.mjs --sejak 2026-08-10
 *   node tools/eval/funnel-ask-audit.mjs --json > hasil-funnel.json
 *   node tools/eval/funnel-ask-audit.mjs --sertakan-uji     # ikutkan sesi test-harness
 *
 * ⚠️ BATAS YANG HARUS DIBACA SEBELUM PERCAYA ANGKANYA — lihat cetakan
 * "PERINGATAN" di akhir keluaran. Alat ini sengaja mencetaknya tiap kali,
 * bukan menyembunyikannya di dokumentasi.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

// Akun WA khusus test-harness (di-seed migrasi 38). Sesi uji BUKAN percakapan
// pelanggan; memasukkannya akan mencampur trafik sintetis ke dalam angka yang
// dipakai memutuskan biaya produksi.
const AKUN_UJI = '00000000-0000-4000-8000-0000000f3b00';

const arg = (nama, bawaan = null) => {
  const i = process.argv.indexOf(nama);
  return i === -1 ? bawaan : (process.argv[i + 1] ?? true);
};
const ada = (nama) => process.argv.includes(nama);

// `.env` tidak dimuat otomatis oleh node polos — prisma CLI yang biasanya
// melakukannya. Dibaca manual supaya alat ini bisa dijalankan apa adanya.
if (!process.env.DATABASE_URL) {
  try {
    const isi = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    const baris = isi.split('\n').find((l) => l.startsWith('DATABASE_URL='));
    if (baris) process.env.DATABASE_URL = baris.slice('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  } catch { /* biar Prisma sendiri yang mengeluh kalau memang tidak ada */ }
}

const prisma = new PrismaClient();

const sejak = arg('--sejak') ? new Date(`${arg('--sejak')}T00:00:00`) : null;
const sertakanUji = ada('--sertakan-uji');

/**
 * Satu SEGMEN = rentang antara dua penanda lifecycle (`completed`/`cancelled`).
 * Ini definisi yang sama yang dipakai `OrderContextService.candidates()`, jadi
 * angkanya bicara tentang unit yang sama dengan yang dilihat bot.
 */
function pecahSegmen(events) {
  const segmen = [];
  let berjalan = { mulai: null, selesai: null, asks: [], penanda: null };
  for (const e of events) {
    if (berjalan.mulai === null) berjalan.mulai = e.createdAt;
    if (e.type === 'funnel_ask') berjalan.asks.push({ step: String(e.payload?.step ?? '?'), at: e.createdAt });
    if (e.type === 'completed' || e.type === 'cancelled') {
      berjalan.selesai = e.createdAt;
      berjalan.penanda = e.type;
      segmen.push(berjalan);
      berjalan = { mulai: null, selesai: null, asks: [], penanda: null };
    }
  }
  if (berjalan.mulai !== null) segmen.push(berjalan); // segmen menggantung
  return segmen;
}

// Gagal menyambung DB adalah kasus yang PALING mungkin terjadi (alat ini
// dijalankan dari mesin yang bukan tempat Postgres berjalan). Dijawab dengan
// satu kalimat yang bisa ditindaklanjuti, bukan tumpukan stack Prisma.
async function jalankan(fn) {
  try {
    return await fn();
  } catch (err) {
    const pesan = String(err?.message ?? err);
    if (/Can't reach database|ECONNREFUSED|P1001/i.test(pesan)) {
      console.error(
        `\n✖ Tidak bisa menyambung ke database.\n` +
        `  DATABASE_URL = ${process.env.DATABASE_URL ?? '(kosong)'}\n` +
        `  Jalankan alat ini di mesin tempat Postgres-nya hidup, atau setel\n` +
        `  DATABASE_URL ke instans yang benar. Alat ini MURNI BACA — aman\n` +
        `  dijalankan terhadap database produksi.\n`,
      );
      process.exit(2);
    }
    throw err;
  }
}

const hasil = await jalankan(async () => {
  const percakapan = await prisma.conversation.findMany({
    where: sertakanUji ? {} : { whatsappAccountId: { not: AKUN_UJI } },
    select: { id: true },
  });

  const ringkas = {
    percakapan: 0, segmen: 0, segmenSelesai: 0, segmenBatal: 0, segmenMenggantung: 0,
    giliranPelanggan: 0, pertanyaanSampai: 0,
    perLangkah: {}, langkahTerakhirSegmen: {}, segmenNolPertanyaan: 0,
  };
  const rinci = [];

  for (const { id } of percakapan) {
    const events = await prisma.orderContextEvent.findMany({
      where: { conversationId: id, ...(sejak ? { createdAt: { gte: sejak } } : {}) },
      orderBy: { createdAt: 'asc' },
      select: { type: true, payload: true, createdAt: true },
    });
    if (events.length === 0) continue;

    const segmen = pecahSegmen(events);
    ringkas.percakapan += 1;

    for (const s of segmen) {
      const batasAkhir = s.selesai ?? new Date();
      const giliran = await prisma.message.count({
        where: { conversationId: id, senderType: 'customer', createdAt: { gte: s.mulai, lte: batasAkhir } },
      });

      ringkas.segmen += 1;
      if (s.penanda === 'completed') ringkas.segmenSelesai += 1;
      else if (s.penanda === 'cancelled') ringkas.segmenBatal += 1;
      else ringkas.segmenMenggantung += 1;

      ringkas.giliranPelanggan += giliran;
      ringkas.pertanyaanSampai += s.asks.length;
      if (s.asks.length === 0) ringkas.segmenNolPertanyaan += 1;

      for (const a of s.asks) ringkas.perLangkah[a.step] = (ringkas.perLangkah[a.step] ?? 0) + 1;
      const terakhir = s.asks.at(-1)?.step ?? '(nol pertanyaan)';
      ringkas.langkahTerakhirSegmen[terakhir] = (ringkas.langkahTerakhirSegmen[terakhir] ?? 0) + 1;

      rinci.push({
        percakapan: id, mulai: s.mulai, selesai: s.selesai, penanda: s.penanda,
        giliranPelanggan: giliran, pertanyaanSampai: s.asks.length,
        langkah: s.asks.map((a) => a.step),
      });
    }
  }
  return { ringkas, rinci };
}).finally(() => prisma.$disconnect());

if (ada('--json')) {
  console.log(JSON.stringify(hasil, null, 2));
} else {
  const r = hasil.ringkas;
  const tanpa = Math.max(0, r.giliranPelanggan - r.pertanyaanSampai);
  const persen = r.giliranPelanggan ? ((tanpa / r.giliranPelanggan) * 100).toFixed(1) : '—';
  console.log('\n═══ PERTANYAAN FUNNEL YANG BENAR-BENAR SAMPAI KE PELANGGAN ═══\n');
  console.log(`  percakapan berdata      : ${r.percakapan}`);
  console.log(`  segmen order            : ${r.segmen}  (selesai ${r.segmenSelesai} · batal ${r.segmenBatal} · menggantung ${r.segmenMenggantung})`);
  console.log(`  giliran pelanggan        : ${r.giliranPelanggan}`);
  console.log(`  pertanyaan funnel sampai : ${r.pertanyaanSampai}`);
  console.log(`  giliran TANPA pertanyaan : ${tanpa}  (${persen}%)   ← angka yang dicari`);
  console.log(`  segmen NOL pertanyaan    : ${r.segmenNolPertanyaan} dari ${r.segmen}`);
  console.log('\n  pertanyaan per langkah:');
  for (const [k, v] of Object.entries(r.perLangkah).sort((a, b) => b[1] - a[1])) console.log(`    ${String(k).padEnd(20)} ${v}`);
  console.log('\n  langkah TERAKHIR tiap segmen (di mana funnel berhenti):');
  for (const [k, v] of Object.entries(r.langkahTerakhirSegmen).sort((a, b) => b[1] - a[1])) console.log(`    ${String(k).padEnd(20)} ${v}`);

  console.log(`
⚠️  PERINGATAN — baca sebelum memakai angka di atas untuk memutuskan apa pun

  1. "giliran TANPA pertanyaan" BUKAN berarti bot gagal. Sebagian besar giliran
     memang tidak seharusnya menghasilkan pertanyaan funnel (menjawab pertanyaan
     produk, basa-basi, pelanggan mengirim beberapa pesan berturut-turut untuk
     satu giliran bot). Angka ini batas ATAS, bukan jumlah kegagalan.
  2. \`funnel_ask\` juga tercatat untuk langkah yang pertanyaannya DIBUNGKAM cap
     anti-cerewet (\`kalimat: ''\`) — pagar \`kalimat.trim().length > 0\` belum
     dipasang. Jadi "pertanyaan sampai" masih sedikit LEBIH BESAR dari yang
     sebenarnya ditanyakan.
  3. Mekanisme pencatatannya baru mendarat 2026-08-10 (\`09c5e70\`) dan sempat
     TIDAK JALAN di mode ai_draft sampai \`61eade4\`. Data sebelum itu tidak ada
     atau tidak lengkap — pakai \`--sejak\` untuk memotongnya.
  4. Bot produksi sedang MATI. Kalau angka di atas nol atau nyaris nol, itu
     BUKAN temuan tentang funnel — itu berarti belum ada trafik untuk diukur,
     dan sumber data yang layak adalah korpus eval (F6), bukan riwayat.
`);
}

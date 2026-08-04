/**
 * >>> ANGGA — kapan pesan masuk BOLEH memicu balasan otomatis.
 *
 * INSIDEN (Fatih, 2026-08-04 02:17 UTC / 09:17 WIB): pelanggan menulis
 * "2 aja deh, ongkir ke purworejo brp?", pesannya TERSIMPAN rapi
 * (`status=delivered`), lalu percakapannya berhenti total. Tidak ada balasan,
 * tidak ada review Sentinel, dan — yang paling menyesatkan — TIDAK ADA SATU
 * BARIS LOG PUN. Dari luar terlihat seperti AI mati.
 *
 * Penyebabnya satu baris di `wa.service.ts`:
 *
 *   sock.ev.on('messages.upsert', ({ messages, type }) => {
 *     ingestBaileysMessage(accountId, m, type !== 'notify')
 *                                       ^^^^^^^^^^^^^^^^^^ suppressAutomation
 *
 * Baileys memakai `append` untuk DUA hal yang sangat berbeda: (a) pesan lama
 * yang disodorkan ulang, dan (b) pesan HIDUP yang kebetulan tidak lewat jalur
 * notifikasi — paling sering saat socket baru tersambung ulang. Menyamakan
 * keduanya dengan "ini riwayat, lewati" membuat pesan sungguhan hilang diam-diam
 * di `if (result.suppressAutomation) return;`, sebelum sempat menulis log apa pun.
 *
 * Yang membedakan riwayat dari pesan hidup bukan nama event-nya, tapi UMURNYA.
 * Jadi itu yang dipakai sekarang.
 *
 * Kenapa ini aman:
 * - Sinkronisasi riwayat awal TIDAK lewat sini. Ia punya jalurnya sendiri
 *   (`messaging-history.set`) yang selalu mengirim `suppressAutomation: true`.
 * - Pengiriman ganda tidak akan dibalas dua kali: `MessageIngestService` menolak
 *   `externalId` yang sudah ada dan mengembalikan null sebelum pipeline jalan.
 * - Pesan `append` yang benar-benar tua tetap dilewati.
 */

/** Batas umur sebuah pesan `append` masih dianggap HIDUP. Parameter teknis
 *  (sejajar `AUTO_REPLY_DEBOUNCE_MS`), bukan angka bisnis. Sepuluh menit cukup
 *  longgar untuk menutup jeda sambung-ulang, tapi masih jauh lebih pendek dari
 *  rentang riwayat yang disodorkan WhatsApp saat sinkronisasi. */
export const LIVE_APPEND_WINDOW_MS = 10 * 60 * 1000;

/**
 * @param type nilai `type` dari event `messages.upsert` Baileys.
 * @param messageTimestamp detik Unix dari kunci pesan (boleh undefined).
 * @returns true kalau pesan ini harus diperlakukan sebagai riwayat — disimpan,
 * tapi tanpa balasan otomatis / auto-away / CSAT.
 */
export function shouldSuppressAutomation(
  type: string,
  messageTimestamp: number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (type === 'notify') return false;
  // Tanpa waktu, tidak ada dasar untuk menyebutnya hidup → pilih yang aman.
  if (!messageTimestamp || !Number.isFinite(messageTimestamp)) return true;
  const umurMs = now - messageTimestamp * 1000;
  // Waktu di masa depan (jam perangkat meleset) tetap dihitung hidup.
  return umurMs > LIVE_APPEND_WINDOW_MS;
}

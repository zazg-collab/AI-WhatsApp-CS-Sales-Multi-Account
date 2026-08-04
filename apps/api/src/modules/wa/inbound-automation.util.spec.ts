import { shouldSuppressAutomation, LIVE_APPEND_WINDOW_MS } from './inbound-automation.util';
import { baileysTimestamp } from './wa.types';

/**
 * >>> ANGGA — regresi "percakapan berhenti diam-diam" (Fatih, 2026-08-04).
 *
 * Pelanggan menulis "2 aja deh, ongkir ke purworejo brp?". Pesannya tersimpan
 * (`status=delivered`), tapi tidak ada balasan, tidak ada review Sentinel, dan
 * tidak ada satu baris log pun — karena Baileys mengirimnya sebagai `append`
 * dan kode lama menyamakan `append` dengan "ini riwayat, lewati".
 */
describe('ANGGA — gerbang otomasi pesan masuk', () => {
  const SEKARANG = 1_785_800_000_000;
  const detik = (msLalu: number) => Math.floor((SEKARANG - msLalu) / 1000);

  it('notify selalu hidup, seberapa pun tuanya', () => {
    expect(shouldSuppressAutomation('notify', detik(0), SEKARANG)).toBe(false);
    expect(shouldSuppressAutomation('notify', detik(72 * 60 * 60 * 1000), SEKARANG)).toBe(false);
  });

  // Inti insidennya: pesan HIDUP yang datang lewat `append`.
  it('append BARU tetap dibalas — ini yang dulu hilang', () => {
    expect(shouldSuppressAutomation('append', detik(0), SEKARANG)).toBe(false);
    expect(shouldSuppressAutomation('append', detik(9 * 60 * 1000), SEKARANG)).toBe(false);
  });

  it('append TUA tetap dilewati — sinkronisasi riwayat jangan dibalasi', () => {
    expect(shouldSuppressAutomation('append', detik(LIVE_APPEND_WINDOW_MS + 1000), SEKARANG)).toBe(true);
    expect(shouldSuppressAutomation('append', detik(3 * 24 * 60 * 60 * 1000), SEKARANG)).toBe(true);
  });

  it('tanpa waktu → pilih yang aman (dilewati)', () => {
    expect(shouldSuppressAutomation('append', undefined, SEKARANG)).toBe(true);
    expect(shouldSuppressAutomation('append', null, SEKARANG)).toBe(true);
    expect(shouldSuppressAutomation('append', NaN, SEKARANG)).toBe(true);
  });

  it('jam perangkat meleset ke depan tidak bikin pesan hidup ikut dilewati', () => {
    expect(shouldSuppressAutomation('append', detik(-5 * 60 * 1000), SEKARANG)).toBe(false);
  });

  // Baileys mengirim timestamp sebagai Long, bukan number biasa.
  it('timestamp bentuk Long dibaca benar', () => {
    const ts = detik(60_000);
    expect(baileysTimestamp({ messageTimestamp: { toNumber: () => ts } })).toBe(ts);
    expect(baileysTimestamp({ messageTimestamp: ts })).toBe(ts);
    expect(baileysTimestamp({})).toBeUndefined();
    // Rangkaiannya utuh: Long → detik → gerbang.
    expect(
      shouldSuppressAutomation('append', baileysTimestamp({ messageTimestamp: { toNumber: () => ts } }), SEKARANG),
    ).toBe(false);
  });
});

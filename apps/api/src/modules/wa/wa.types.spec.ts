import { mapBaileysMessage } from './wa.types';

/**
 * >>> ANGGA — regresi "satu orang jadi dua chat" (2026-08-04).
 *
 * WhatsApp mengalamatkan chat pribadi dengan dua cara yang bergantian:
 * lewat nomor telepon (`628…@s.whatsapp.net`) dan lewat LID, identitas privasi
 * (`27608184053792@lid`). Pesan ber-alamat LID SELALU membawa pasangan
 * nomornya. Di Baileys 7 pasangan itu ada di:
 *
 *   key.remoteJidAlt    → chat pribadi
 *   key.participantAlt  → grup
 *
 * Kode lama membacanya dari `key.senderPn`. Field itu **tidak ada sama sekali**
 * di Baileys 7 (`grep -r senderPn node_modules/@whiskeysockets/baileys/lib`
 * → 0 hasil); `sender_pn` cuma nama atribut stanza mentah yang sudah diubah
 * Baileys jadi `remoteJidAlt`. Akibatnya nomornya tidak pernah terbaca, LID
 * tidak pernah bisa dipetakan, dan Fatih lahir dua kali: sekali sebagai
 * `6285722193049`, sekali sebagai `27608184053792@lid`.
 */
describe('ANGGA — mapBaileysMessage membaca pasangan nomor dari kunci pesan', () => {
  function pesan(key: Record<string, unknown>) {
    return mapBaileysMessage({
      key,
      message: { conversation: 'halo kak' },
      messageTimestamp: 1785840000,
      pushName: 'Fatih',
    } as never);
  }

  it('chat pribadi ber-alamat @lid: nomor diambil dari key.remoteJidAlt', () => {
    const hasil = pesan({
      remoteJid: '27608184053792@lid',
      remoteJidAlt: '6285722193049:0@s.whatsapp.net',
      fromMe: false,
      id: 'ABC1',
      addressingMode: 'lid',
    });
    expect(hasil.key.senderPn).toBe('6285722193049:0@s.whatsapp.net');
  });

  it('grup ber-alamat @lid: nomor pengirim diambil dari key.participantAlt', () => {
    const hasil = pesan({
      remoteJid: '120363000000000000@g.us',
      participant: '27608184053792@lid',
      participantAlt: '6285722193049:0@s.whatsapp.net',
      fromMe: false,
      id: 'ABC2',
      addressingMode: 'lid',
    });
    expect(hasil.key.senderPn).toBe('6285722193049:0@s.whatsapp.net');
  });

  it('chat ber-alamat nomor biasa: tidak ada yang perlu dipetakan', () => {
    const hasil = pesan({
      remoteJid: '6285722193049@s.whatsapp.net',
      remoteJidAlt: '27608184053792@lid',
      fromMe: false,
      id: 'ABC3',
      addressingMode: 'pn',
    });
    // Arahnya berkebalikan: yang di `remoteJidAlt` justru LID-nya. Mapper cuma
    // menyalin apa adanya — yang MENOLAK nilai bukan-nomor adalah resolver,
    // supaya cuma ada satu tempat yang tahu aturan "apa itu nomor yang sah".
    expect(hasil.key.remoteJid).toBe('6285722193049@s.whatsapp.net');
    expect(hasil.key.senderPn).toBe('27608184053792@lid');
  });
});

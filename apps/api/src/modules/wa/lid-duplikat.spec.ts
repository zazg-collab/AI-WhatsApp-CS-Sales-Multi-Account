import { ContactSyncService } from './contact-sync.service';
import { MessageIngestService } from './message-ingest.service';
import { MessageType } from '@sentinel/database';

/**
 * >>> ANGGA — regresi "Fatih jadi dua chat" (2026-08-04, terulang sesudah akun
 * dihapus dan discan ulang dari nol).
 *
 * Bukti bahwa ini bukan sisa data lama: menghapus akun WhatsApp meng-CASCADE
 * seluruh pelanggan & percakapannya, lalu duplikatnya muncul LAGI pada scan
 * pertama. Yang rusak jalur kodenya, bukan isinya.
 *
 * WhatsApp memakai dua bentuk alamat bergantian untuk orang yang SAMA:
 *   - `6285722193049@s.whatsapp.net`  (nomor telepon)
 *   - `27608184053792@lid`           (LID, identitas privasi)
 *
 * Selama LID tidak bisa dipetakan ke nomornya, kedua bentuk itu jatuh ke kunci
 * unik `(phoneNumber, sourceAccountId)` yang berbeda → dua baris `customers`,
 * dua percakapan, dua thread di Inbox.
 *
 * Tes di bawah menguji resolver-nya lewat pintu depan (`ingest`), bukan lewat
 * fungsi internal, supaya yang dijamin adalah "pelanggan yang dibuat", bukan
 * "fungsi yang dipanggil".
 */
describe('ANGGA — @lid dan nomor telepon harus jatuh ke SATU pelanggan', () => {
  const AKUN = 'acc1';
  const LID = '27608184053792@lid';
  const NOMOR = '6285722193049';

  /** Prisma palsu yang cukup untuk menjalankan `ingest` sampai selesai. */
  function buatPrisma() {
    const pelangganPerNomor = new Map<string, { id: string; phoneNumber: string; optedOut: boolean; avatarUrl: null }>();
    let urut = 0;
    return {
      pelangganPerNomor,
      whatsappAccount: {
        findUnique: jest.fn().mockResolvedValue({ id: AKUN, assignedAdminId: null, assignedBotId: null, aiMode: 'ai_off' }),
      },
      customer: {
        upsert: jest.fn().mockImplementation(({ where }: any) => {
          const nomor = where.phoneNumber_sourceAccountId.phoneNumber;
          const ada = pelangganPerNomor.get(nomor);
          if (ada) return Promise.resolve(ada);
          const baru = { id: `cust${++urut}`, phoneNumber: nomor, optedOut: false, avatarUrl: null };
          pelangganPerNomor.set(nomor, baru);
          return Promise.resolve(baru);
        }),
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(pelangganPerNomor.get(where.phoneNumber_sourceAccountId.phoneNumber) ?? null),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'conv1', status: 'open', aiMode: 'ai_off', takeoverStatus: 'ai_active',
          botId: null, lastMessageAt: null, csatScore: null, csatRequestedAt: null,
          whatsappAccountId: AKUN,
        }),
        create: jest.fn(), update: jest.fn().mockResolvedValue({}),
      },
      message: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'msg1' }),
      },
      whatsappContact: { findFirst: jest.fn().mockResolvedValue(null), upsert: jest.fn().mockResolvedValue({}) },
    } as any;
  }

  /** Socket Baileys palsu; `petaLid` mewakili isi `signalRepository.lidMapping`. */
  function buatSesi(petaLid: Record<string, string> = {}) {
    return {
      getSock: jest.fn().mockReturnValue({
        signalRepository: {
          lidMapping: { getPNForLID: jest.fn().mockImplementation((lid: string) => Promise.resolve(petaLid[lid] ?? null)) },
        },
      }),
    } as any;
  }

  function buat(prisma: any, sesi: any) {
    const contactSync = new ContactSyncService(prisma, sesi);
    const ingest = new MessageIngestService(
      prisma,
      { emitToAccount: jest.fn() } as any,
      { pickAdmin: jest.fn().mockResolvedValue(null), enabled: false } as any,
      contactSync,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );
    return { ingest, contactSync };
  }

  function pesan(remoteJid: string, senderPn: string | undefined, id: string) {
    return {
      accountId: AKUN, remoteJid, senderPn, externalId: id,
      pushName: 'Fatih', text: 'aku mau pesan bedog betekok masih ada kak?',
      type: MessageType.text, fromMe: false, occurredAt: new Date('2026-08-04T10:52:00Z'),
    };
  }

  it('pesan @lid yang membawa nomornya sendiri dipakai apa adanya', async () => {
    const prisma = buatPrisma();
    const { ingest } = buat(prisma, buatSesi());
    await ingest.ingest(pesan(LID, `${NOMOR}:0@s.whatsapp.net`, 'M1'));
    expect([...prisma.pelangganPerNomor.keys()]).toEqual([NOMOR]);
  });

  it('pesan @lid tanpa nomor di kuncinya: dipetakan lewat peta LID milik Baileys', async () => {
    const prisma = buatPrisma();
    const { ingest } = buat(prisma, buatSesi({ [LID]: `${NOMOR}:0@s.whatsapp.net` }));
    await ingest.ingest(pesan(LID, undefined, 'M2'));
    expect([...prisma.pelangganPerNomor.keys()]).toEqual([NOMOR]);
  });

  /** INI kasus di layar Bossfren: satu orang, dua bentuk alamat, satu sesi. */
  it('orang yang sama lewat nomor LALU lewat @lid tetap SATU pelanggan', async () => {
    const prisma = buatPrisma();
    const { ingest } = buat(prisma, buatSesi({ [LID]: `${NOMOR}:0@s.whatsapp.net` }));
    await ingest.ingest(pesan(`${NOMOR}@s.whatsapp.net`, undefined, 'M3'));
    await ingest.ingest(pesan(LID, undefined, 'M4'));
    expect([...prisma.pelangganPerNomor.keys()]).toEqual([NOMOR]);
  });

  it('LID yang benar-benar tidak dikenal siapa pun: jangan mengarang nomor', async () => {
    const prisma = buatPrisma();
    const { ingest } = buat(prisma, buatSesi());
    await ingest.ingest(pesan(LID, undefined, 'M5'));
    expect([...prisma.pelangganPerNomor.keys()]).toEqual([LID]);
  });

  it('nilai bukan-nomor di kunci pesan ditolak, bukan dipakai sebagai nomor', async () => {
    const prisma = buatPrisma();
    const { ingest } = buat(prisma, buatSesi());
    // Chat ber-alamat PN menaruh LID di `remoteJidAlt`; kalau ikut dipakai,
    // lahirlah pelanggan bernomor "27608184053792" yang tidak pernah ada.
    await ingest.ingest(pesan(LID, '99887766554433@lid', 'M6'));
    expect([...prisma.pelangganPerNomor.keys()]).toEqual([LID]);
  });
});

describe('ANGGA — urutan sumber resolver @lid', () => {
  const AKUN = 'acc1';
  const LID = '27608184053792@lid';

  function buat(petaLid: Record<string, string> | null, cermin: string | null) {
    const prisma: any = {
      whatsappContact: {
        findFirst: jest.fn().mockResolvedValue(cermin ? { phoneNumber: cermin } : null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      customer: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const sesi: any = {
      getSock: jest.fn().mockReturnValue(
        petaLid === null
          ? undefined
          : { signalRepository: { lidMapping: { getPNForLID: jest.fn().mockImplementation((l: string) => Promise.resolve(petaLid[l] ?? null)) } } },
      ),
    };
    return { prisma, svc: new ContactSyncService(prisma, sesi) };
  }

  it('petunjuk di kunci pesan menang atas semua sumber lain', async () => {
    const { prisma, svc } = buat({ [LID]: '620000000000:0@s.whatsapp.net' }, '621111111111');
    expect(await svc.resolveLidPhone(AKUN, LID, '6285722193049:0@s.whatsapp.net')).toBe('6285722193049');
    expect(prisma.whatsappContact.findFirst).not.toHaveBeenCalled();
  });

  it('tanpa petunjuk: peta Baileys dipakai, cermin DB tidak perlu disentuh', async () => {
    const { prisma, svc } = buat({ [LID]: '6285722193049:0@s.whatsapp.net' }, '621111111111');
    expect(await svc.resolveLidPhone(AKUN, LID)).toBe('6285722193049');
    expect(prisma.whatsappContact.findFirst).not.toHaveBeenCalled();
  });

  it('socket mati: jatuh ke cermin whatsapp_contacts', async () => {
    const { svc } = buat(null, '6285722193049');
    expect(await svc.resolveLidPhone(AKUN, LID)).toBe('6285722193049');
  });

  it('ketiga sumber gagal: kembalikan @lid apa adanya', async () => {
    const { svc } = buat({}, null);
    expect(await svc.resolveLidPhone(AKUN, LID)).toBe(LID);
  });

  it('hasil dari peta Baileys ikut DICATAT, supaya duplikat lama tergabung', async () => {
    const { prisma, svc } = buat({ [LID]: '6285722193049:0@s.whatsapp.net' }, null);
    await svc.resolveLidPhone(AKUN, LID);
    expect(prisma.whatsappContact.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { whatsappAccountId_jid: { whatsappAccountId: AKUN, jid: LID } },
      }),
    );
  });
});

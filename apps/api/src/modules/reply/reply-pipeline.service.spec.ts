import { AiMode, BotStatus, SenderType, SentinelDecision, TakeoverStatus } from '@sentinel/database';
import { ReplyPipelineService } from './reply-pipeline.service';
import type { ReplyChannel } from './reply.types';

/**
 * >>> ANGGA — F3a (2026-08-09, cowork). Dua hal yang dijaga di sini, dan
 * keduanya TIDAK bisa dijaga spec lama `wa-inbound.service.spec.ts`:
 *
 *  1. `scheduleFollowUp` HANYA dipanggil di jalur `ai_on` sesudah kirim
 *     berhasil. Mode draft & supervised TIDAK menjadwalkan apa pun. Ini
 *     detail paling gampang hilang saat memindah pipeline ke kanal kedua —
 *     kalau tester ikut menjadwalkan di mode draft, itu downgrade senyap.
 *  2. `ReplyOutcome` — keputusan bot jadi bisa di-assert langsung, bukan cuma
 *     lewat mock. Korpus eval F6 bergantung pada ini. <<<
 */
describe('ReplyPipelineService — kontrak keputusan & follow-up', () => {
  let prisma: any;
  let ai: any;
  let sentinel: any;
  let channel: jest.Mocked<ReplyChannel>;

  const convo = (aiMode: AiMode) => ({
    id: 'c1',
    whatsappAccountId: 'a1',
    aiMode,
    takeoverStatus: TakeoverStatus.ai_active,
    customer: { phoneNumber: '628123', name: 'Putri' },
    bot: { status: BotStatus.active },
  });

  const buat = (aiMode: AiMode) => {
    prisma = {
      conversation: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(convo(aiMode))
          .mockResolvedValue({ aiMode, takeoverStatus: TakeoverStatus.ai_active }),
        update: jest.fn().mockResolvedValue({}),
      },
      message: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    };
    ai = {
      generateReply: jest.fn().mockResolvedValue({ text: 'halo kak', moneyBlocked: false }),
      generateSegmentedReply: jest.fn(),
      leadScore: jest.fn().mockResolvedValue(undefined),
      getFunnelExpect: jest.fn().mockResolvedValue('closing'),
      // >>> ANGGA — LANGKAH 5: pembaca BERPAGAR `messageId` (beda dari
      // `getFunnelExpect` yang sengaja tanpa pagar untuk follow-up). <<<
      langkahUntukGiliran: jest.fn().mockReturnValue(null),
    };
    sentinel = { review: jest.fn().mockResolvedValue({ id: 'r1', decision: SentinelDecision.approve }) };
    channel = {
      expireStaleDrafts: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue({ messageId: 'm1' }),
      draft: jest.fn().mockResolvedValue(undefined),
      notifyAdmin: jest.fn(),
      autoSendAssets: jest.fn(),
      scheduleFollowUp: jest.fn().mockResolvedValue(undefined),
    } as any;
    return new ReplyPipelineService(prisma, ai, sentinel, undefined);
  };

  /** Varian dengan orderLog terpasang — untuk menguji promosi langkah funnel. */
  const buatDenganLog = (aiMode: AiMode) => {
    buat(aiMode);
    const orderLog: any = { promosikanLangkahTerkirim: jest.fn().mockResolvedValue(undefined) };
    return { svc: new ReplyPipelineService(prisma, ai, sentinel, orderLog), orderLog };
  };

  const tunggu = () => new Promise((r) => setImmediate(r));

  /**
   * >>> ANGGA — uji lapangan 2026-08-10. Sebelumnya balasan kosong cuma menulis
   * satu baris `debug` lalu diam: di WhatsApp produksi artinya pesan pelanggan
   * lewat tanpa balasan, tanpa draft, DAN tanpa seorang pun yang tahu.
   */
  describe('balasan KOSONG tidak boleh berakhir sebagai kesunyian', () => {
    it('membangunkan admin, dan tetap dilaporkan sebagai skipped:empty-text', async () => {
      const svc = buat(AiMode.ai_draft);
      ai.generateReply.mockResolvedValue({ text: '', moneyBlocked: false });
      const hasil = await svc.run('c1', channel);
      expect(hasil).toEqual({ kind: 'skipped', reason: 'empty-text' });
      expect(channel.notifyAdmin).toHaveBeenCalledTimes(1);
      expect((channel.notifyAdmin as jest.Mock).mock.calls[0][0]).toContain('BELUM terjawab');
      // JANGAN membuat draft: draft ada untuk di-approve, dan teks diagnostik
      // yang ter-approve akan terkirim ke pelanggan.
      expect(channel.draft).not.toHaveBeenCalled();
      expect(channel.send).not.toHaveBeenCalled();
    });
  });


  it('ai_on + langkah closing → kirim, DAN follow-up dijadwalkan', async () => {
    const svc = buat(AiMode.ai_on);
    const out = await svc.run('c1', channel);
    await tunggu();
    expect(out).toEqual({ kind: 'sent', messageId: 'm1' });
    expect(channel.send).toHaveBeenCalled();
    expect(channel.scheduleFollowUp).toHaveBeenCalledWith('c1', expect.stringContaining('ada kendala'), 15 * 60 * 1000);
  });

  it('ai_draft → draft, dan follow-up TIDAK dijadwalkan (perilaku produksi)', async () => {
    const svc = buat(AiMode.ai_draft);
    const out = await svc.run('c1', channel);
    await tunggu();
    expect(out).toEqual({ kind: 'drafted', reason: 'ai-draft' });
    expect(channel.send).not.toHaveBeenCalled();
    expect(channel.scheduleFollowUp).not.toHaveBeenCalled();
  });

  it('ai_supervised + Sentinel approve → kirim, tapi follow-up TETAP tidak dijadwalkan', async () => {
    const svc = buat(AiMode.ai_supervised);
    const out = await svc.run('c1', channel);
    await tunggu();
    expect(out).toEqual({ kind: 'sent', messageId: 'm1' });
    expect(channel.scheduleFollowUp).not.toHaveBeenCalled();
  });

  it('ai_on tapi langkah funnel BUKAN closing → tidak ada follow-up', async () => {
    const svc = buat(AiMode.ai_on);
    ai.getFunnelExpect.mockResolvedValue('qty');
    await svc.run('c1', channel);
    await tunggu();
    expect(channel.scheduleFollowUp).not.toHaveBeenCalled();
  });

  it('gerbang uang menahan → drafted + admin diberi tahu, apa pun modenya', async () => {
    const svc = buat(AiMode.ai_on);
    ai.generateReply.mockResolvedValue({ text: 'Rp139.000', moneyBlocked: true, moneyGateIssues: ['digit mentah'] });
    const out = await svc.run('c1', channel);
    expect(out).toEqual({ kind: 'drafted', reason: 'money-gate' });
    expect(channel.send).not.toHaveBeenCalled();
    expect(channel.notifyAdmin).toHaveBeenCalledWith(expect.stringContaining('Gerbang uang'));
  });

  it('bot non-aktif → skipped, LLM tidak pernah dipanggil', async () => {
    const svc = buat(AiMode.ai_on);
    prisma.conversation.findUnique = jest.fn().mockResolvedValue({ ...convo(AiMode.ai_on), bot: { status: BotStatus.inactive } });
    const out = await svc.run('c1', channel);
    expect(out).toEqual({ kind: 'skipped', reason: 'bot-inactive' });
    expect(ai.generateReply).not.toHaveBeenCalled();
  });

  it('Sentinel memblokir → paused + AI dikunci', async () => {
    const svc = buat(AiMode.ai_supervised);
    sentinel.review.mockResolvedValue({ id: 'r1', decision: SentinelDecision.block });
    const out = await svc.run('c1', channel);
    expect(out).toEqual({ kind: 'paused' });
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aiMode: AiMode.ai_paused, takeoverStatus: TakeoverStatus.waiting_admin } }),
    );
  });

  /**
   * >>> ANGGA — REGRESI (2026-08-10). Bug yang ini kejadian di percakapan uji
   * sungguhan: giliran alamat menghasilkan langkah `closing`, catatannya masuk
   * saat prompt DISUSUN, lalu balasannya gagal terkirim kena timeout provider.
   * Pelanggan tidak pernah melihat formulir pesanan — tapi funnel menganggap
   * closing selesai, giliran berikutnya jatuh ke `closing_followup`, dan
   * formulir itu hangus permanen.
   *
   * Invariannya: balasan yang tidak sampai membuang SATU GILIRAN, bukan satu
   * langkah funnel.
   */
  it('REGRESI: kirim GAGAL -> langkah funnel TIDAK dipromosikan', async () => {
    const { svc, orderLog } = buatDenganLog(AiMode.ai_on);
    channel.send.mockRejectedValue(new Error('The operation was aborted due to timeout'));
    const out = await svc.run('c1', channel);
    await tunggu();
    expect(out.kind).toBe('drafted');
    expect(orderLog.promosikanLangkahTerkirim).not.toHaveBeenCalled();
  });

  it('kirim BERHASIL -> langkah funnel dipromosikan tepat sekali', async () => {
    const { svc, orderLog } = buatDenganLog(AiMode.ai_on);
    const out = await svc.run('c1', channel);
    await tunggu();
    expect(out.kind).toBe('sent');
    expect(orderLog.promosikanLangkahTerkirim).toHaveBeenCalledTimes(1);
    // LANGKAH 5: promosi kini menyebut PESAN mana — assertion ikut memeriksanya.
    expect(orderLog.promosikanLangkahTerkirim).toHaveBeenCalledWith('c1', 'm1');
  });

  /**
   * >>> ANGGA — REGRESI `09c5e70` (2026-08-10). Promosi langkah dipasang di
   * SATU cabang (sesudah `channel.send` di jalur ai_on). Mode `ai_draft`
   * pulang lebih dulu, jadi sesi uji — yang berjalan di `ai_draft` — tidak
   * pernah memajukan funnel sama sekali. Gagal diam-diam dengan 994 test
   * hijau, karena test regresinya sendiri cuma memakai `ai_on`.
   *
   * Test ini menjaga aturannya DI SEMUA MODE sekaligus: yang menentukan
   * `ReplyOutcome`, bukan mode. Satu mode baru yang lupa dipasangi promosi
   * akan merah di sini.
   */
  describe('REGRESI: promosi langkah ditentukan OUTCOME, bukan mode', () => {
    /**
     * >>> ANGGA — koreksi Bossfren 2026-08-10: versi pertama matriks ini cuma
     * menguji `ai_supervised` di jalur Sentinel yang MENYETUJUI. Padahal
     * supervised bisa berakhir TERTAHAN — draft, blokir, atau Sentinel error —
     * dan tiga-tiganya belum sampai ke pelanggan. Menguji satu jalur lalu
     * menyimpulkan tentang semua jalur: kesalahan yang sama persis dengan yang
     * melahirkan regresi ini, cuma satu lapis lebih dalam (di test).
     */
    it.each([
      ['ai_on', AiMode.ai_on, SentinelDecision.approve, 'sent', true],
      ['ai_draft', AiMode.ai_draft, SentinelDecision.approve, 'drafted', false],
      ['ai_supervised + approve', AiMode.ai_supervised, SentinelDecision.approve, 'sent', true],
      ['ai_supervised + draft', AiMode.ai_supervised, SentinelDecision.draft, 'drafted', false],
      ['ai_supervised + block', AiMode.ai_supervised, SentinelDecision.block, 'paused', false],
    ] as const)('%s -> outcome %s -> promosi=%s', async (_nama, mode, putusan, kind, promosi) => {
      const { svc, orderLog } = buatDenganLog(mode);
      sentinel.review.mockResolvedValue({ id: 'r1', decision: putusan });
      const out = await svc.run('c1', channel);
      await tunggu();
      expect(out.kind).toBe(kind);
      if (promosi) {
        // LANGKAH 5: promosi kini menyebut PESAN mana — assertion ikut memeriksanya.
    expect(orderLog.promosikanLangkahTerkirim).toHaveBeenCalledWith('c1', 'm1');
      } else {
        // BELUM sampai ke pelanggan — promosinya menunggu admin menyetujui,
        // dan saat itu jalur noteOutbound yang memicunya.
        expect(orderLog.promosikanLangkahTerkirim).not.toHaveBeenCalled();
      }
    });

    it('Sentinel ERROR di mode supervised -> tertahan jadi draft, tidak promosi', async () => {
      const { svc, orderLog } = buatDenganLog(AiMode.ai_supervised);
      sentinel.review.mockRejectedValue(new Error('sentinel down'));
      const out = await svc.run('c1', channel);
      await tunggu();
      expect(out.kind).toBe('drafted');
      expect(orderLog.promosikanLangkahTerkirim).not.toHaveBeenCalled();
    });
  });

  /**
   * >>> ANGGA — LANGKAH 5 (2026-08-10, ketok Bossfren): LANGKAH FUNNEL DITITIPKAN
   * KE PESAN KELUAR saat pesannya DIBUAT.
   *
   * `61eade4` sudah memindahkan KEPUTUSAN promosi ke satu titik yang digerakkan
   * `ReplyOutcome`. Yang belum: sumber langkahnya masih `funnelExpect` — satu
   * slot per PERCAKAPAN di MEMORI — padahal draft bisa baru di-approve berjam-jam
   * kemudian, sesudah slot itu ditimpa giliran lain atau hilang kena restart.
   *
   * Pipeline membaca langkahnya SEKALI lalu menyerahkannya ke kanal, dan kanal
   * mempersistnya BERSAMAAN dengan baris pesan. Keputusan tetap satu tempat;
   * adapter cuma menyimpan apa yang diberikan. Menaruh pembacaan di adapter =
   * dua salinan aturan yang sama, persis kelas kesalahan yang melahirkan regresi
   * `09c5e70`.
   */
  describe('LANGKAH 5: langkah funnel dititipkan ke pesan keluar saat dibuat', () => {
    it('ai_on: langkah ikut ke `channel.send`', async () => {
      const svc = buat(AiMode.ai_on);
      ai.langkahUntukGiliran.mockReturnValue('closing');

      await svc.run('c1', channel);
      await tunggu();

      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1' }), 'halo kak', undefined, 'closing',
      );
    });

    it('ai_draft: langkah ikut ke `channel.draft` sebagai opsi', async () => {
      const svc = buat(AiMode.ai_draft);
      ai.langkahUntukGiliran.mockReturnValue('patokan');

      await svc.run('c1', channel);
      await tunggu();

      expect(channel.draft).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1' }), 'halo kak',
        expect.objectContaining({ funnelStep: 'patokan' }),
      );
    });

    /** Ketok Bossfren: kalimat funnel ditempel `komposisiFunnel` ke segmen
     *  TERAKHIR, jadi langkahnya menempel di draft terakhir saja. */
    it('burst: hanya draft SEGMEN TERAKHIR yang membawa langkah', async () => {
      const svc = buat(AiMode.ai_on);
      ai.langkahUntukGiliran.mockReturnValue('closing');
      prisma.message.findMany.mockResolvedValue([
        { id: 'c-2', senderType: SenderType.customer, content: 'dua', messageType: 'text' },
        { id: 'c-1', senderType: SenderType.customer, content: 'satu', messageType: 'text' },
      ]);
      ai.generateSegmentedReply.mockResolvedValue([
        { text: 'jawaban satu' }, { text: 'jawaban dua' }, { text: 'jawaban tiga' },
      ]);

      await svc.run('c1', channel);
      await tunggu();

      const panggilan = (channel.draft as jest.Mock).mock.calls;
      expect(panggilan).toHaveLength(3);
      expect(panggilan[0][2]?.funnelStep ?? null).toBeNull();
      expect(panggilan[1][2]?.funnelStep ?? null).toBeNull();
      expect(panggilan[2][2]?.funnelStep).toBe('closing');
    });

    /** Mutasi "cabang gerbang uang & supervised kehilangan langkah" sebelumnya
     *  LOLOS — padahal dua mode itu yang paling sering berakhir jadi draft
     *  panjang umur, yaitu justru kasus yang rancangan ini dibuat untuknya. */
    it('gerbang uang menahan: draftnya TETAP membawa langkah', async () => {
      const svc = buat(AiMode.ai_on);
      ai.langkahUntukGiliran.mockReturnValue('total');
      ai.generateReply.mockResolvedValue({ text: 'halo kak', moneyBlocked: true, issues: ['digit_mentah'] });

      await svc.run('c1', channel);
      await tunggu();

      expect((channel.draft as jest.Mock).mock.calls[0][2]).toEqual(
        expect.objectContaining({ funnelStep: 'total' }),
      );
    });

    it('ai_supervised: langkah ikut baik saat Sentinel approve maupun saat jadi draft', async () => {
      const svcKirim = buat(AiMode.ai_supervised);
      ai.langkahUntukGiliran.mockReturnValue('closing');
      await svcKirim.run('c1', channel);
      await tunggu();
      expect(channel.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c1' }), 'halo kak', 'r1', 'closing',
      );

      const svcDraft = buat(AiMode.ai_supervised);
      ai.langkahUntukGiliran.mockReturnValue('patokan');
      sentinel.review.mockResolvedValue({ id: 'r2', decision: SentinelDecision.draft });
      await svcDraft.run('c1', channel);
      await tunggu();
      expect((channel.draft as jest.Mock).mock.calls.at(-1)?.[2]).toEqual(
        expect.objectContaining({ funnelStep: 'patokan' }),
      );
    });

    it('giliran tanpa langkah menggantung: nol titipan, bukan string kosong', async () => {
      const svc = buat(AiMode.ai_draft);
      ai.langkahUntukGiliran.mockReturnValue(null);

      await svc.run('c1', channel);
      await tunggu();

      expect((channel.draft as jest.Mock).mock.calls[0][2]?.funnelStep ?? null).toBeNull();
    });
  });
});

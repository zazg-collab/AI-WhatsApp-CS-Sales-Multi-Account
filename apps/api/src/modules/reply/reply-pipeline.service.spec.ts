import { AiMode, BotStatus, SentinelDecision, TakeoverStatus } from '@sentinel/database';
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
    expect(orderLog.promosikanLangkahTerkirim).toHaveBeenCalledWith('c1');
  });
});

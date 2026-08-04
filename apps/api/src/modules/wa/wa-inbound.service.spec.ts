import { AiMode, MessageStatus, MessageType, SenderType, TakeoverStatus } from '@sentinel/database';
import { WaInboundService } from './wa-inbound.service';

describe('WaInboundService auto-reply', () => {
  let service: WaInboundService;
  let prisma: any;
  let events: any;
  let ai: any;
  let sentinel: any;
  let notifications: any;
  let gateway: any;
  let conversation: any;
  let burstRows: any[]; // newest-first customer run for trailingCustomerBurst
  let staleDrafts: any[]; // pending AI drafts for expireStaleDrafts

  beforeEach(() => {
    jest.useFakeTimers();
    conversation = {
      id: 'c1',
      whatsappAccountId: 'a1',
      aiMode: AiMode.ai_draft,
      takeoverStatus: TakeoverStatus.ai_active,
      customer: { phoneNumber: '6281234567890' },
    };
    burstRows = [{ id: 'cust1', senderType: SenderType.customer, content: 'halo', messageType: MessageType.text }];
    staleDrafts = [];
    prisma = {
      conversation: {
        findUnique: jest.fn().mockImplementation(() => Promise.resolve(conversation)),
        update: jest.fn(),
      },
      message: {
        // expireStaleDrafts queries by status=pending; trailingCustomerBurst doesn't.
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.status === MessageStatus.pending ? staleDrafts : burstRows),
        ),
        updateMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: `m-${Math.random()}`, ...data })),
      },
    };
    events = { emitToAccount: jest.fn() };
    ai = {
      generateReply: jest.fn().mockResolvedValue({ text: 'satu balasan' }),
      generateSegmentedReply: jest.fn(),
    };
    const ingest = {};
    sentinel = { review: jest.fn().mockResolvedValue({ id: 'rev1', decision: 'approve' }) };
    notifications = { send: jest.fn() };
    gateway = { sendText: jest.fn().mockResolvedValue('ext1'), subscribePresence: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = { get: jest.fn(() => { throw new Error('not resolvable'); }) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    service = new WaInboundService(
      prisma,
      events,
      ingest as any,
      ai,
      sentinel as any,
      notifications as any,
      gateway as any,
      moduleRef as any,
      config as any,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('collapses several rapid messages into a single generateReply call', async () => {
    (service as any).scheduleAutoReply('c1');
    (service as any).scheduleAutoReply('c1'); // resets the timer
    (service as any).scheduleAutoReply('c1');

    await jest.advanceTimersByTimeAsync(7_999);
    expect(ai.generateReply).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(ai.generateReply).toHaveBeenCalledTimes(1);
  });

  it('extends the quiet window while the customer is typing', async () => {
    (service as any).scheduleAutoReply('c1', 'a1', 'jid1');
    expect(gateway.subscribePresence).toHaveBeenCalledWith('a1', 'jid1');

    await jest.advanceTimersByTimeAsync(7_000);
    (service as any).onCustomerTyping('a1', 'jid1'); // re-arms the 8s window
    await jest.advanceTimersByTimeAsync(7_000); // 14s total — would have fired without the extend
    expect(ai.generateReply).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1_001); // 15s — one window after the typing signal
    expect(ai.generateReply).toHaveBeenCalledTimes(1);
  });

  it('fires at the max-wait cap even if the customer keeps typing', async () => {
    (service as any).scheduleAutoReply('c1', 'a1', 'jid1');
    // Type every 4s for 40s — past the 30s cap.
    for (let elapsed = 0; elapsed < 40_000; elapsed += 4_000) {
      await jest.advanceTimersByTimeAsync(4_000);
      (service as any).onCustomerTyping('a1', 'jid1');
    }
    // Capped: generated exactly once (around the 30s ceiling), not deferred forever.
    expect(ai.generateReply).toHaveBeenCalledTimes(1);
  });

  it('expires a stale unapproved draft before generating the new one', async () => {
    staleDrafts = [{ id: 'old-draft' }];
    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-draft'] } },
      data: { status: MessageStatus.failed },
    });
    expect(events.emitToAccount).toHaveBeenCalledWith('a1', 'message:draft-removed', {
      conversationId: 'c1',
      messageId: 'old-draft',
    });
  });

  it('splits a multi-topic burst into per-topic drafts that quote their source message', async () => {
    conversation.aiMode = AiMode.ai_on;
    // newest-first; trailingCustomerBurst reverses to [msgA, msgB] (index 1, 2)
    burstRows = [
      { id: 'msgB', senderType: SenderType.customer, content: 'stok L ada?', messageType: MessageType.text },
      { id: 'msgA', senderType: SenderType.customer, content: 'harga berapa?', messageType: MessageType.text },
    ];
    ai.generateSegmentedReply.mockResolvedValue([
      { answersIndex: 1, text: 'Harganya 50rb kak' },
      { answersIndex: 2, text: 'Stok L masih ada' },
    ]);

    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    // Held for approval — nothing sent to WhatsApp.
    expect(gateway.sendText).not.toHaveBeenCalled();
    // Risk gate ran once over the combined text, flagged as a burst.
    expect(sentinel.review).toHaveBeenCalledWith('c1', expect.any(String), { multiTopicBurst: true });
    // Two drafts, each quoting the message that started its topic.
    const created = prisma.message.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ status: MessageStatus.pending, content: 'Harganya 50rb kak', quotedMessageId: 'msgA' });
    expect(created[1]).toMatchObject({ status: MessageStatus.pending, content: 'Stok L masih ada', quotedMessageId: 'msgB' });
    expect(notifications.send).toHaveBeenCalled();
  });

  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): segmen burst yang
  // ditahan gerbang uang sebelumnya cuma dapat notifikasi GENERIK ("beberapa
  // pesan topik berbeda") — dan bahkan itu SAMA SEKALI TIDAK terkirim kalau
  // mode-nya ai_draft. Sekarang wajib ada notifikasi KHUSUS gerbang uang,
  // di SEMUA mode termasuk ai_draft, menyebut alasannya secara spesifik.
  it('gerbang uang: segmen burst yang ditahan dapat notifikasi khusus, walau mode ai_draft', async () => {
    conversation.aiMode = AiMode.ai_draft;
    burstRows = [
      { id: 'msgB', senderType: SenderType.customer, content: 'stok L ada?', messageType: MessageType.text },
      { id: 'msgA', senderType: SenderType.customer, content: 'harga bedog betekok berapa?', messageType: MessageType.text },
    ];
    ai.generateSegmentedReply.mockResolvedValue([
      { answersIndex: 1, text: 'Bedog Betekok harganya Rp139.000, kak.', moneyGateIssues: ['Angka rupiah ditulis langsung: 139000'] },
      { answersIndex: 2, text: 'Stok L masih ada' },
    ]);

    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    expect(notifications.send).toHaveBeenCalledTimes(1);
    const [msg] = notifications.send.mock.calls[0];
    expect(msg).toMatch(/gerbang uang menahan/i);
    expect(msg).toContain('Angka rupiah ditulis langsung: 139000');
  });

  it('pauses the bot when the burst risk gate returns takeover_required', async () => {
    conversation.aiMode = AiMode.ai_on;
    burstRows = [
      { id: 'm2', senderType: SenderType.customer, content: 'mau refund', messageType: MessageType.text },
      { id: 'm1', senderType: SenderType.customer, content: 'barang rusak', messageType: MessageType.text },
    ];
    ai.generateSegmentedReply.mockResolvedValue([{ answersIndex: 1, text: 'baik kak' }]);
    sentinel.review.mockResolvedValue({ id: 'rev2', decision: 'takeover_required' });

    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ aiMode: AiMode.ai_paused }) }),
    );
  });

  it('sends directly when ai_on and there is no burst (single message)', async () => {
    conversation.aiMode = AiMode.ai_on;
    // burstRows default = single customer message → not a burst
    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    expect(ai.generateSegmentedReply).not.toHaveBeenCalled();
    expect(gateway.sendText).toHaveBeenCalledTimes(1);
  });

  /**
   * >>> ANGGA — Fase 113 (2026-08-04): gerbang uang (AiService.gateMoneyTokens)
   * harus menahan balasan jadi draft di SEMUA mode, termasuk ai_on yang biasanya
   * kirim langsung tanpa Sentinel pre-send. Ini bukti bahwa gerbang berlaku
   * SEBELUM percabangan mode, bukan hanya untuk ai_draft/ai_supervised.
   */
  it('gerbang uang menahan balasan jadi draft walau ai_on & bukan burst', async () => {
    conversation.aiMode = AiMode.ai_on;
    // burstRows default = single customer message → not a burst
    ai.generateReply.mockResolvedValue({
      text: 'Totalnya {{total_transfer}} kak',
      moneyBlocked: true,
    });

    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    expect(gateway.sendText).not.toHaveBeenCalled();
    expect(ai.generateSegmentedReply).not.toHaveBeenCalled();
    const created = prisma.message.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: MessageStatus.pending, content: expect.stringContaining('total_transfer') });
  });

  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): alasan penahanan dulu
  // ditempel LANGSUNG ke `content` sebagai prefiks "⚠️ [gerbang uang
  // menahan: ...]" — kalau admin klik Approve tanpa Edit dulu, teks debug
  // internal itu ikut terkirim ke pelanggan. Sekarang harus terpisah:
  // `content` BERSIH, alasannya di `moneyGateIssues`.
  it('gerbang uang: content BERSIH tanpa prefiks "⚠️", alasan dipersist terpisah ke moneyGateIssues', async () => {
    conversation.aiMode = AiMode.ai_on;
    ai.generateReply.mockResolvedValue({
      text: 'Totalnya Rp161.000 kak, jadi 139000 juga oke',
      moneyBlocked: true,
      moneyGateIssues: ['Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000'],
    });

    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    const created = prisma.message.create.mock.calls.map((c: any[]) => c[0].data);
    expect(created).toHaveLength(1);
    expect(created[0].content).not.toMatch(/⚠️/);
    expect(created[0].content).toBe('Totalnya Rp161.000 kak, jadi 139000 juga oke');
    expect(created[0].moneyGateIssues).toEqual([
      'Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000',
    ]);
  });

  // >>> ANGGA — koreksi 2026-08-04 (temuan Bossfren): sebelum ini TIDAK ADA
  // notifikasi push/WA sama sekali kalau gerbang uang menahan balasan tunggal
  // — satu-satunya cara admin tahu adalah buka inbox manual. Sekarang wajib
  // ada notifikasi, di SEMUA mode AI (bukan cuma mode yang biasanya tidak
  // dijaga admin), karena ini sinyal bot HAMPIR kirim harga yang belum
  // terverifikasi — beda dari draft rutin ai_draft yang memang selalu dicek.
  it('gerbang uang: mengirim notifikasi admin (dulu tidak ada sama sekali) walau mode ai_draft', async () => {
    conversation.aiMode = AiMode.ai_draft;
    ai.generateReply.mockResolvedValue({
      text: 'Bedog Betekok harganya Rp139.000, kak.',
      moneyBlocked: true,
      moneyGateIssues: ['Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000'],
    });

    (service as any).scheduleAutoReply('c1');
    await jest.advanceTimersByTimeAsync(8_000);

    expect(notifications.send).toHaveBeenCalledTimes(1);
    const [msg] = notifications.send.mock.calls[0];
    expect(msg).toMatch(/gerbang uang menahan/i);
    expect(msg).toContain('6281234567890'); // convo.customer.phoneNumber dari harness
    expect(msg).toContain('Angka rupiah ditulis langsung oleh model, bukan lewat penanda: 139000');
  });
});

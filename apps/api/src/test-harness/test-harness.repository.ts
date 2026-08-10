/**
 * Test Harness Repository
 *
 * >>> ANGGA — F3c (2026-08-09, cowork): ISI BERUBAH TOTAL, API PUBLIK TIDAK.
 *
 * Dulu: tabel terisolasi `test_sessions` + `test_messages`, "no FK ke
 * production". Isolasi itu justru akar T6 — otak bot (`shipping.service`,
 * `order-context.service`) membaca `conversations`/`messages`, dan
 * `order_context_events` punya FK ke Conversation. Selama sesi uji hidup di
 * dunia sendiri, memori order/funnelExpect/turnMemo MUSTAHIL terisi: tester
 * menguji bot yang berbeda dari yang melayani pelanggan.
 *
 * Sekarang: percakapan uji = baris `Conversation` SUNGGUHAN di bawah satu akun
 * WA bertipe test (baris DB saja — tanpa QR/socket/login). `test_sessions`
 * tinggal penunjuk metadata. DebugSnapshot pindah ke `test_message_debug`.
 *
 * Bentuk kembalian method SENGAJA dipertahankan persis seperti sebelumnya
 * (`TestSession`, `TestMessage`) supaya controller & UI tidak perlu ditulis
 * ulang — anti-downgrade: 10 endpoint, export, dan panel debug tetap jalan.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AiMode, MessageStatus, SenderType } from '@sentinel/database';
import { PrismaService } from '../prisma/prisma.service';
import type { TestSession, TestMessage, DebugSnapshot } from './types';

/** Akun WA khusus harness — di-seed migrasi 38. Bukan akun WhatsApp sungguhan. */
export const TEST_HARNESS_ACCOUNT_ID = '00000000-0000-4000-8000-0000000f3b00';

@Injectable()
export class TestHarnessRepository {
  private readonly logger = new Logger(TestHarnessRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /** >>> ANGGA — F3c: tabel `test_message_debug` baru; diakses lewat cast
   *  struktural + degradasi aman supaya tsc & runtime tetap jalan walau
   *  `prisma generate` belum dijalankan di mesin ini (pola yang sama dipakai
   *  saat OrderContextEvent diperkenalkan). <<< */
  private get debugTable() {
    return (this.prisma as unknown as {
      testMessageDebug?: {
        upsert(a: any): Promise<any>;
        findMany(a: any): Promise<Array<{ messageId: string; debugInfo: unknown }>>;
      };
    }).testMessageDebug;
  }

  async createSession(data: { name: string; provider: string; model: string }): Promise<TestSession> {
    const customer = await this.prisma.customer.create({
      data: {
        name: data.name || 'Pelanggan Uji',
        phoneNumber: `test-${Date.now()}`,
        sourceAccountId: TEST_HARNESS_ACCOUNT_ID,
      },
    });
    // >>> ANGGA — koreksi AUDIT (2026-08-09, cowork): `botId` WAJIB diisi.
    // Tanpa itu `PromptBuilderService` tidak menemukan persona (`conversation.
    // bot?.persona?.soulMd`) dan `AiService` tidak menemukan `knowledgeBaseId`
    // — tester menjalankan bot TANPA kepribadian dan TANPA knowledge base,
    // persis kebalikan dari tujuan F3b ("tester sama persis dengan produksi").
    // Baseline `chat-session.manager` DULU memuat keduanya, jadi ini regresi.
    // Urutan pemilihannya meniru produksi: bot yang ditugaskan ke akun dulu,
    // baru bot terbaru sebagai cadangan. <<<
    const akun = await this.prisma.whatsappAccount.findUnique({
      where: { id: TEST_HARNESS_ACCOUNT_ID },
      select: { assignedBotId: true, aiMode: true },
    });
    const botId =
      akun?.assignedBotId ??
      (await this.prisma.bot.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }))?.id ??
      null;
    if (!botId) {
      this.logger.warn(
        'Tidak ada Bot di database — sesi uji akan berjalan tanpa persona/knowledge base, TIDAK sama dengan produksi.',
      );
    }
    const conversation = await this.prisma.conversation.create({
      data: {
        customerId: customer.id,
        whatsappAccountId: TEST_HARNESS_ACCOUNT_ID,
        botId,
        // Ikut mode akun uji, sama seperti `message-ingest.service.ts` mengikuti
        // `account.aiMode`. Kalau tidak diisi, mode-nya terkunci di default
        // skema selamanya dan cabang `ai_supervised`/`ai_on` (Sentinel, aset,
        // lead score, follow-up) MUSTAHIL diuji lewat tester.
        // >>> ANGGA — fix (2026-08-10, ketok Bossfren): sesi uji DIPAKSA
        // `ai_on`, TIDAK mewarisi mode akun.
        //
        // Alasannya bukan kenyamanan. Sejak langkah funnel hanya dicatat saat
        // balasan BENAR-BENAR TERKIRIM (`kind === 'sent'`), sesi uji yang
        // mewarisi `ai_draft` tidak akan pernah memajukan funnel — dan itu
        // BENAR menurut aturannya, karena draft memang belum sampai ke
        // pelanggan. Akibatnya tester berhenti menguji apa pun: ia menampilkan
        // draft sebagai "balasan bot", sesuatu yang di produksi tidak pernah
        // dilihat pelanggan tanpa persetujuan admin.
        //
        // Ketimpangan itu sudah ada sebelum perubahan ini; ia baru kelihatan
        // waktu funnel berhenti maju. Ditutup di sini, bukan diakomodasi
        // dengan cabang khusus tester — karena cabang khusus justru
        // menyamarkan bedanya alih-alih menghapusnya.
        aiMode: AiMode.ai_on,
      },
    });
    const sesi = await (this.prisma as any).testSession.create({
      data: { ...data, conversationId: conversation.id },
    });
    return sesi as TestSession;
  }

  /** Id percakapan asli di balik sebuah sesi uji — dipakai pipeline & debug. */
  async conversationIdOf(sessionId: string): Promise<string | null> {
    const s = await (this.prisma as any).testSession.findUnique({
      where: { id: sessionId },
      select: { conversationId: true },
    });
    return s?.conversationId ?? null;
  }

  async getSession(sessionId: string): Promise<(TestSession & { messages: TestMessage[] }) | null> {
    const sesi = await (this.prisma as any).testSession.findUnique({ where: { id: sessionId } });
    if (!sesi) return null;
    return { ...(sesi as TestSession), messages: await this.getMessages(sessionId) };
  }

  async listSessions(limit = 20): Promise<TestSession[]> {
    return (this.prisma as any).testSession.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }) as Promise<TestSession[]>;
  }

  async addMessage(data: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    debugInfo?: DebugSnapshot;
    /**
     * >>> ANGGA — koreksi AUDIT (2026-08-10): true = pesan ini CATATAN ALAT UJI,
     * bukan ucapan bot. Disimpan `pending` supaya `PromptBuilderService`
     * membuangnya dari riwayat (ia menyaring `pending`/`failed` untuk pesan
     * non-pelanggan). Tanpa ini, teks "⚠️ [sistem] Bot tidak mengirim apa pun…"
     * kembali ke model di giliran berikutnya SEBAGAI UCAPAN BOT SENDIRI, dan
     * sesi uji berhenti mengukur perilaku yang sesungguhnya. <<<
     */
    catatanSistem?: boolean;
    /** >>> ANGGA — LANGKAH 5 (2026-08-10): langkah funnel yang ditanyakan pesan
     *  ini, dititipkan `UiReplyChannel`. Dipersist supaya sesi uji memakai jalur
     *  promosi yang SAMA dengan produksi, bukan jalur khusus tester. <<< */
    funnelStep?: string | null;
  }): Promise<TestMessage> {
    const conversationId = await this.conversationIdOf(data.sessionId);
    if (!conversationId) throw new Error(`Session ${data.sessionId} not found`);

    await (this.prisma as any).testSession.update({
      where: { id: data.sessionId },
      data: { updatedAt: new Date() },
    });

    // >>> ANGGA — koreksi AUDIT (2026-08-09, cowork): `status` WAJIB `sent`.
    // Default skema `Message.status` adalah `pending`, dan `PromptBuilderService`
    // MEMBUANG pesan kami yang `pending`/`failed` dari riwayat percakapan.
    // Akibatnya balasan bot uji tidak pernah masuk prompt giliran berikutnya —
    // bot di tester amnesia tiap giliran, jauh lebih bodoh dari produksi. Di
    // produksi `sendAndStore` yang menyetelnya; harness tidak punya jalur itu,
    // jadi disetel di sini. `lastMessageAt` ikut diperbarui supaya percakapan
    // uji tidak nangkring di puncak Inbox/CRM (Postgres mengurut NULLS FIRST
    // pada `DESC`). <<<
    const pesan = await this.prisma.message.create({
      data: {
        conversationId,
        senderType: data.role === 'user' ? SenderType.customer : SenderType.ai,
        content: data.content,
        aiGenerated: data.role !== 'user',
        status: data.catatanSistem ? MessageStatus.pending : MessageStatus.sent,
        funnelStep: data.funnelStep ?? undefined,
      },
    });
    await this.prisma.conversation
      .update({ where: { id: conversationId }, data: { lastMessageAt: pesan.createdAt } })
      .catch(() => undefined);

    if (data.debugInfo) {
      try {
        await this.debugTable?.upsert({
          where: { messageId: pesan.id },
          create: { messageId: pesan.id, debugInfo: data.debugInfo as any },
          update: { debugInfo: data.debugInfo as any },
        });
      } catch (err) {
        // Panel debug kehilangan satu snapshot, percakapannya sendiri utuh.
        this.logger.warn(`Simpan debug snapshot gagal untuk ${pesan.id}: ${err}`);
      }
    }

    return {
      id: pesan.id,
      sessionId: data.sessionId,
      role: data.role,
      content: data.content,
      timestamp: pesan.createdAt,
      debugInfo: data.debugInfo,
    } as unknown as TestMessage;
  }

  async getMessages(sessionId: string, limit?: number): Promise<TestMessage[]> {
    const conversationId = await this.conversationIdOf(sessionId);
    if (!conversationId) return [];

    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true, senderType: true, content: true, createdAt: true },
    });

    let debugByMessage = new Map<string, unknown>();
    try {
      const debugRows = (await this.debugTable?.findMany({
        where: { messageId: { in: rows.map((r) => r.id) } },
      })) ?? [];
      debugByMessage = new Map(debugRows.map((d) => [d.messageId, d.debugInfo]));
    } catch (err) {
      this.logger.warn(`Baca debug snapshot gagal untuk sesi ${sessionId}: ${err}`);
    }

    return rows.map((r) => ({
      id: r.id,
      sessionId,
      role: r.senderType === SenderType.customer ? 'user' : 'assistant',
      content: r.content ?? '',
      timestamp: r.createdAt,
      debugInfo: debugByMessage.get(r.id),
    })) as unknown as TestMessage[];
  }

  /**
   * Hapus sesi = hapus percakapannya. Cascade menyapu messages,
   * order_context_events, sentinel_reviews, dan baris sesi ini.
   *
   * >>> ANGGA — koreksi AUDIT (2026-08-09, cowork): komentar lama mengklaim
   * cascade juga menyapu `Customer`. SALAH — arah relasinya anak→induk, jadi
   * menghapus percakapan TIDAK menyentuh pelanggannya. Ratusan baris pelanggan
   * `test-<ts>` menumpuk permanen di CRM, ikut dihitung `customer.count` di
   * dashboard & laporan harian Sentinel, dan (karena `lastMessageAt` bisa
   * kosong) memakan kuota kandidat kampanye di depan antrean. Pelanggannya
   * ikut dihapus di sini. `FollowUp`/`CampaignRecipient` juga BUKAN cascade
   * melainkan `SetNull`, jadi barisnya tetap ada dengan `conversationId` null
   * — dibiarkan, karena menghapusnya bisa menyentuh data non-uji. <<<
   */
  async deleteSession(sessionId: string): Promise<void> {
    const conversationId = await this.conversationIdOf(sessionId);
    if (!conversationId) {
      await (this.prisma as any).testSession.delete({ where: { id: sessionId } });
      return;
    }
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { customerId: true },
    });
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    if (!convo?.customerId) return;
    // Hanya hapus pelanggan yang MEMANG milik akun uji dan tidak lagi punya
    // percakapan — supaya tidak pernah menyentuh pelanggan sungguhan.
    const sisa = await this.prisma.conversation.count({ where: { customerId: convo.customerId } });
    if (sisa > 0) return;
    await this.prisma.customer
      .deleteMany({ where: { id: convo.customerId, sourceAccountId: TEST_HARNESS_ACCOUNT_ID } })
      .catch((err: unknown) => this.logger.warn(`Gagal menghapus pelanggan uji: ${err}`));
  }

  async exportSession(sessionId: string): Promise<any> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    return {
      session: {
        id: session.id,
        name: session.name,
        provider: session.provider,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      messages: session.messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        debugInfo: msg.debugInfo,
      })),
    };
  }

  async updateSessionProvider(sessionId: string, provider: string, model: string): Promise<TestSession> {
    return (this.prisma as any).testSession.update({
      where: { id: sessionId },
      data: { provider, model, updatedAt: new Date() },
    }) as Promise<TestSession>;
  }
}

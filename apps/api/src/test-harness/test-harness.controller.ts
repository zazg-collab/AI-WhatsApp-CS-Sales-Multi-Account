/**
 * Test Harness Controller
 * 
 * REST API endpoints untuk Web Chat Simulator.
 * Port-safe design: running di NestJS app yang sama di port 3001.
 * 
 * Endpoints:
 * - POST   /api/v1/test-harness/sessions          → createSession
 * - GET    /api/v1/test-harness/sessions          → listSessions
 * - GET    /api/v1/test-harness/sessions/:id      → getSession
 * - POST   /api/v1/test-harness/sessions/:id/send → sendMessage
 * - DELETE /api/v1/test-harness/sessions/:id      → deleteSession
 * - PATCH  /api/v1/test-harness/sessions/:id/provider → switchProvider
 * - GET    /api/v1/test-harness/sessions/:id/export  → exportSession
 * - POST   /api/v1/test-harness/sessions/:id/load    → loadScenario
 * - GET    /api/v1/test-harness/providers            → listProviders
 * - GET    /api/v1/test-harness/scenarios/:name      → getScenario
 * 
 * Created: 2026-08-08
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { TestHarnessRepository } from './test-harness.repository';
import { ChatSessionManager } from './chat-session.manager';
import { DebugInfoCollector } from './debug-info.collector';
// >>> ANGGA — F3c (2026-08-09, cowork): provider NON-mock kini lewat otak yang
// SAMA dengan produksi (`ReplyPipelineService`), bukan pipeline tester sendiri. <<<
import { ReplyPipelineService } from '../modules/reply/reply-pipeline.service';
import { UiReplyChannel } from './ui-reply.channel';
import { ScenarioLoader } from './scenario.loader';
import type {
  CreateSessionRequest,
  SendMessageRequest,
  SendMessageResponse,
  LoadScenarioRequest,
  SwitchProviderRequest,
} from './types';

@Controller('test-harness')
export class TestHarnessController {
  constructor(
    private readonly repository: TestHarnessRepository,
    private readonly chatManager: ChatSessionManager,
    private readonly debugCollector: DebugInfoCollector,
    private readonly pipeline: ReplyPipelineService,
    private readonly scenarioLoader: ScenarioLoader,
  ) {}

  /**
   * POST /api/v1/test-harness/sessions
   * Create new test session
   */
  @Post('sessions')
  async createSession(@Body() body: CreateSessionRequest) {
    const session = await this.repository.createSession({
      name: body.name,
      provider: body.provider || 'mock',
      model: body.model || 'mock-v1',
    });

    return { session };
  }

  /**
   * GET /api/v1/test-harness/sessions
   * List all sessions (most recent first)
   */
  @Get('sessions')
  async listSessions() {
    const sessions = await this.repository.listSessions();
    return { sessions };
  }

  /**
   * GET /api/v1/test-harness/sessions/:id
   * Get session with all messages
   */
  @Get('sessions/:id')
  async getSession(@Param('id') sessionId: string) {
    const session = await this.repository.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    return { session };
  }

  /**
   * POST /api/v1/test-harness/sessions/:id/send
   * Send user message and get AI reply
   */
  @Post('sessions/:id/send')
  async sendMessage(
    @Param('id') sessionId: string,
    @Body() body: SendMessageRequest,
  ): Promise<SendMessageResponse> {
    const session = await this.repository.getSession(sessionId);
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Build chat history for context
    const history = session.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }));

    // Add user message
    const userMessage = await this.repository.addMessage({
      sessionId,
      role: 'user',
      content: body.text,
    });

    // >>> ANGGA — F3c: SATU OTAK, DUA PINTU.
    //  - provider 'mock'  → tetap lewat ChatSessionManager (balasan kalengan,
    //    tanpa LLM; berguna untuk menguji UI tanpa biaya token).
    //  - provider lain    → `ReplyPipelineService`, persis yang dipakai
    //    WhatsApp. Artinya tester akhirnya ikut menjalankan prompt builder
    //    produksi, grounding ongkir, gerbang uang, funnel, memori order, dan
    //    review Sentinel — bukan tiruan yang bisa menyimpang.
    //
    // ⚠️ Perbaikan bug ikut di sini: baris lama memanggil
    // `resolvePriceTokens(sessionId, ...)` padahal fungsi itu mengharapkan
    // conversationId. Sekarang tidak dipanggil manual sama sekali —
    // substitusi penanda sudah terjadi di dalam `ai.generateReply`
    // (gerbang uang), sama seperti produksi.
    let resolvedText: string;
    let executedTools: any[] | undefined;
    let outcome: string | undefined;
    let moneyGateIssues: string[] = [];
    let conversationIdUntukDebug: string | undefined;
    // >>> ANGGA — koreksi AUDIT (2026-08-10): penanda "ini catatan alat uji,
    // bukan ucapan bot" — menentukan apakah pesannya boleh masuk riwayat prompt. <<<
    let catatanSistem = false;

    if (session.provider === 'mock') {
      const hasil = await this.chatManager.sendMessage(sessionId, body.text, history, 'mock', session.model);
      resolvedText = hasil.replyText;
      executedTools = hasil.executedTools;
    } else {
      const conversationId = await this.repository.conversationIdOf(sessionId);
      if (!conversationId) throw new NotFoundException(`Session ${sessionId} has no conversation`);
      conversationIdUntukDebug = conversationId;
      const channel = new UiReplyChannel();
      const hasil = await this.pipeline.run(conversationId, channel, { model: session.model });
      // >>> ANGGA — koreksi AUDIT (2026-08-10, cowork): JANGAN PERNAH gelembung
      // kosong. Dulu `channel.text ?? ''` — kalau pipeline berhenti sebelum
      // menyentuh kanal (`skipped`/`paused`), yang tersimpan & tampil adalah
      // pesan asisten BERISI STRING KOSONG. Bossfren menemukannya di sesi uji
      // nyata: satu gelembung hijau melompong tanpa satu pun petunjuk kenapa,
      // sementara ALASANNYA sudah dipegang `ReplyOutcome` dan tinggal dibuang
      // begitu saja di baris berikutnya.
      //
      // Kenapa alasannya ditulis ke BADAN pesan, bukan cuma ke panel debug:
      // panel hanya menampilkan giliran TERAKHIR, jadi begitu Bossfren
      // mengirim pesan berikutnya, jejak kenapa giliran ini kosong hilang
      // selamanya. Ditulis di badan = melekat pada gilirannya, bisa dibaca
      // ulang berhari-hari kemudian saat menelusuri percakapan.
      //
      // `reason` juga ikut ke `outcome` untuk SEMUA jenis, bukan cuma
      // `drafted` — dulu justru jenis yang paling butuh penjelasan
      // (`skipped`) yang alasannya dibuang. <<<
      outcome = 'reason' in hasil && hasil.reason ? `${hasil.kind}:${hasil.reason}` : hasil.kind;
      moneyGateIssues = channel.moneyGateIssues;
      resolvedText = channel.text ?? '';
      catatanSistem = !resolvedText.trim();
      if (!resolvedText.trim()) {
        resolvedText = `⚠️ [sistem] Bot tidak mengirim apa pun di giliran ini — pipeline berhenti di "${outcome}". Ini catatan alat uji, BUKAN balasan yang akan diterima pelanggan.`;
      }
    }

    const debugInfo = await this.debugCollector.collectDebugInfo(
      sessionId,
      resolvedText,
      executedTools,
      session.provider,
      conversationIdUntukDebug,
    );
    if (outcome) (debugInfo as any).status = outcome;
    if (moneyGateIssues.length) debugInfo.gateWarnings = [...debugInfo.gateWarnings, ...moneyGateIssues];

    // Add assistant message with debug info
    const assistantMessage = await this.repository.addMessage({
      sessionId,
      role: 'assistant',
      content: resolvedText,
      debugInfo,
      catatanSistem,
    });

    return {
      message: userMessage,
      reply: assistantMessage,
    };
  }

  /**
   * DELETE /api/v1/test-harness/sessions/:id
   * Delete session and all messages
   */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSession(@Param('id') sessionId: string) {
    await this.repository.deleteSession(sessionId);
  }

  /**
   * GET /api/v1/test-harness/sessions/:id/export
   * Export session as JSON
   */
  @Get('sessions/:id/export')
  async exportSession(@Param('id') sessionId: string) {
    const data = await this.repository.exportSession(sessionId);
    return data;
  }

  /**
   * POST /api/v1/test-harness/sessions/:id/load
   * Load predefined scenario into session
   */
  @Post('sessions/:id/load')
  async loadScenario(
    @Param('id') sessionId: string,
    @Body() body: LoadScenarioRequest,
  ) {
    const scenario = this.scenarioLoader.getScenario(body.scenarioName);
    if (!scenario) {
      throw new NotFoundException(`Scenario ${body.scenarioName} not found`);
    }

    // Add scenario messages to session
    for (const msg of scenario.messages) {
      await this.repository.addMessage({
        sessionId,
        role: msg.role,
        content: msg.content,
      });
    }

    return { success: true, loaded: scenario.messages.length };
  }

  /**
   * GET /api/v1/test-harness/providers
   * List available AI providers
   */
  @Get('providers')
  async listProviders() {
    const providers = this.chatManager.getAvailableProviders();
    return { providers };
  }

  /**
   * PATCH /api/v1/test-harness/sessions/:id/provider
   * Switch provider/model for session
   */
  @Patch('sessions/:id/provider')
  async switchProvider(
    @Param('id') sessionId: string,
    @Body() body: SwitchProviderRequest,
  ) {
    await this.repository.updateSessionProvider(sessionId, body.provider, body.model);
    await this.chatManager.switchProvider(sessionId, body.provider, body.model);

    return { success: true };
  }

  /**
   * GET /api/v1/test-harness/scenarios/:name
   * Get predefined scenario by name
   */
  @Get('scenarios/:name')
  async getScenario(@Param('name') name: string) {
    const scenario = this.scenarioLoader.getScenario(name);
    if (!scenario) {
      throw new NotFoundException(`Scenario ${name} not found`);
    }

    return { scenario };
  }
}

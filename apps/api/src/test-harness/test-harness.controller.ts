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

    // Generate AI reply — real AI jika provider != 'mock', else MOCK
    const { replyText, model, executedTools } = await this.chatManager.sendMessage(
      sessionId,
      body.text,
      history,
      session.provider,
      session.model,
    );

    // Resolve price tokens (like what wa-chat.service does)
    const resolvedResult = await this.chatManager['shipping'].resolvePriceTokens(sessionId, replyText);
    const resolvedText = resolvedResult.text;

    // Collect debug info (MOCK for Fase 1 + Tool Calls)
    const debugInfo = await this.debugCollector.collectDebugInfo(sessionId, resolvedText, executedTools, session.provider);

    // Add assistant message with debug info
    const assistantMessage = await this.repository.addMessage({
      sessionId,
      role: 'assistant',
      content: resolvedText,
      debugInfo,
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

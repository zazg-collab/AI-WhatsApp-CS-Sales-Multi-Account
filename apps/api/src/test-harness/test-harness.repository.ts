/**
 * Test Harness Repository
 * 
 * Prisma-based CRUD operations for Test Harness v2.
 * Isolated database tables (test_sessions, test_messages) — no FK ke production.
 * 
 * Created: 2026-08-08
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TestSession, TestMessage, DebugSnapshot } from './types';

@Injectable()
export class TestHarnessRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create new test session
   */
  async createSession(data: {
    name: string;
    provider: string;
    model: string;
  }): Promise<TestSession> {
    return this.prisma.testSession.create({
      data,
    }) as Promise<TestSession>;
  }

  /**
   * Get session by ID with all messages
   */
  async getSession(sessionId: string): Promise<TestSession & { messages: TestMessage[] } | null> {
    return this.prisma.testSession.findUnique({
      where: { id: sessionId },
      include: { messages: { orderBy: { timestamp: 'asc' } } },
    }) as Promise<(TestSession & { messages: TestMessage[] }) | null>;
  }

  /**
   * List all sessions (most recent first)
   */
  async listSessions(limit = 20): Promise<TestSession[]> {
    return this.prisma.testSession.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }) as Promise<TestSession[]>;
  }

  /**
   * Add message to session
   */
  async addMessage(data: {
    sessionId: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    debugInfo?: DebugSnapshot;
  }): Promise<TestMessage> {
    // Update session updatedAt timestamp
    await this.prisma.testSession.update({
      where: { id: data.sessionId },
      data: { updatedAt: new Date() },
    });

    const result = await this.prisma.testMessage.create({
      data: {
        sessionId: data.sessionId,
        role: data.role,
        content: data.content,
        debugInfo: data.debugInfo as any,
      },
    });

    return result as unknown as TestMessage;
  }

  /**
   * Get messages for session
   */
  async getMessages(sessionId: string, limit?: number): Promise<TestMessage[]> {
    const results = await this.prisma.testMessage.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
      take: limit,
    });

    return results as unknown as TestMessage[];
  }

  /**
   * Delete session and all messages (CASCADE)
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.testSession.delete({
      where: { id: sessionId },
    });
  }

  /**
   * Export session as JSON
   */
  async exportSession(sessionId: string): Promise<any> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

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

  /**
   * Update session provider/model
   */
  async updateSessionProvider(
    sessionId: string,
    provider: string,
    model: string,
  ): Promise<TestSession> {
    return this.prisma.testSession.update({
      where: { id: sessionId },
      data: { provider, model, updatedAt: new Date() },
    }) as Promise<TestSession>;
  }
}

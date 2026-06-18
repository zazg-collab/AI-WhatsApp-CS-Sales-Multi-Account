import { Injectable } from '@nestjs/common';
import type { WASocket } from '@whiskeysockets/baileys';

export interface WaSession {
  sock: WASocket;
  qr?: string;
}

/**
 * Shared in-memory store for live Baileys sessions and per-account
 * anti-ban / reconnect counters. Extracted so WaSendService and
 * WaMirrorService can read the socket without a circular dependency on WaService.
 */
@Injectable()
export class WaSessionStore {
  private readonly sessions = new Map<string, WaSession>();

  readonly reconnectAttempts = new Map<string, number>();
  readonly sendTimestamps = new Map<string, number[]>();
  readonly reconnectingSince = new Map<string, number>();

  get(accountId: string): WaSession | undefined {
    return this.sessions.get(accountId);
  }

  set(accountId: string, session: WaSession): void {
    this.sessions.set(accountId, session);
  }

  has(accountId: string): boolean {
    return this.sessions.has(accountId);
  }

  delete(accountId: string): void {
    this.sessions.delete(accountId);
  }

  getSock(accountId: string): WASocket | undefined {
    return this.sessions.get(accountId)?.sock;
  }

  getQr(accountId: string): string | null {
    return this.sessions.get(accountId)?.qr ?? null;
  }

  setQr(accountId: string, qr: string | undefined): void {
    const s = this.sessions.get(accountId);
    if (s) s.qr = qr;
  }

  /** Wipe all per-account state on delete/logout. */
  clearAll(accountId: string): void {
    this.sessions.delete(accountId);
    this.reconnectAttempts.delete(accountId);
    this.reconnectingSince.delete(accountId);
    this.sendTimestamps.delete(accountId);
  }
}

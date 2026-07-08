import { Injectable } from '@nestjs/common';
import type { WASocket } from '@whiskeysockets/baileys';

export interface WaSession {
  sock: WASocket;
  qr?: string;
}

export interface HistorySyncState {
  status: 'idle' | 'syncing' | 'completed';
  messages: number;
  contacts: number;
  startedAt: number;
  completedAt?: number;
  /** Bumped each time a sync (re)starts, so a stale "no-history" timer from a
   *  prior connection can detect it's outdated and skip overriding state. */
  generation: number;
}

/**
 * Shared in-memory store for live Baileys sessions and per-account
 * anti-ban / reconnect counters. Lets the gateway (outbound ops) and mirror
 * read the live socket without a circular dependency on WaService (lifecycle).
 *
 * ponytail: in-process Map — fine for the single-instance deployment. If this
 * ever goes multi-instance, sessions must move to a shared/sticky-routed store.
 */
@Injectable()
export class WaSessionStore {
  private readonly sessions = new Map<string, WaSession>();

  readonly reconnectAttempts = new Map<string, number>();
  readonly reconnectingSince = new Map<string, number>();
  private readonly historySync = new Map<string, HistorySyncState>();

  getHistorySync(accountId: string): HistorySyncState | undefined {
    return this.historySync.get(accountId);
  }

  /**
   * Starts (or restarts) tracking. Returns the generation stamped onto this
   * sync so callers (the "no history arrived" fallback timer) can tell
   * whether a NEWER sync has since started and bail out instead of
   * clobbering its state.
   */
  startHistorySync(accountId: string): number {
    // A reconnect onto an already-`completed` session shouldn't wipe that
    // result back to "syncing" unless we're actually starting fresh — but we
    // have no explicit "sync starting" event from Baileys, only `connection
    // === open`, which also fires on reconnects where no new history will
    // ever arrive. Bumping the generation (not the counts) lets the stale
    // 15s fallback timer detect it's outdated without forcing every
    // reconnect to re-show "syncing".
    const prev = this.historySync.get(accountId);
    const generation = (prev?.generation ?? 0) + 1;
    this.historySync.set(accountId, {
      status: 'syncing',
      messages: 0,
      contacts: 0,
      startedAt: Date.now(),
      generation,
    });
    return generation;
  }

  /** Accumulates one `messaging-history.set` batch's counts onto the running total. */
  addHistorySyncBatch(accountId: string, messages: number, contacts: number, isLatest: boolean): HistorySyncState {
    const prev = this.historySync.get(accountId) ?? { status: 'syncing' as const, messages: 0, contacts: 0, startedAt: Date.now(), generation: 1 };
    const next: HistorySyncState = {
      ...prev,
      messages: prev.messages + messages,
      contacts: prev.contacts + contacts,
      status: isLatest ? 'completed' : 'syncing',
      completedAt: isLatest ? Date.now() : prev.completedAt,
    };
    this.historySync.set(accountId, next);
    return next;
  }

  /** True when `generation` is still the most recent one started for this account. */
  isCurrentHistorySyncGeneration(accountId: string, generation: number): boolean {
    return this.historySync.get(accountId)?.generation === generation;
  }

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
    this.historySync.delete(accountId);
  }
}

import { Injectable, Logger } from '@nestjs/common';

/**
 * Per-account rate limiter for WhatsApp sends. Enforces a maximum of 20 sends
 * per 60-second window per account, with serialized slot reservation to prevent
 * concurrent sends from all observing a sub-limit count and bursting past the cap.
 */
@Injectable()
export class WaRateLimiter {
  private readonly logger = new Logger(WaRateLimiter.name);
  private static readonly MAX_SENDS_PER_MINUTE = 20;
  private static readonly WINDOW_MS = 60_000;

  /**
   * Per-account serialization chain for slot reservation. Concurrent sends to
   * the same account must reserve their rate-limit slot one at a time, otherwise
   * they all read `stamps.length < limit` together and burst past the cap
   * (anti-ban hazard). Each account's chain links reservations serially.
   */
  private readonly throttleChains = new Map<string, Promise<unknown>>();

  /**
   * Per-account send timestamps. Stores millisecond timestamps of the last
   * 20 sends per account to enforce the rate limit.
   */
  private readonly sendTimestamps = new Map<string, number[]>();

  /**
   * Reserve a rate-limit slot for the given account. Waits if necessary to
   * respect the per-minute cap. Once resolved, a slot is reserved and the caller
   * must proceed with the send within a reasonable window (do not defer for
   * minutes after calling this).
   *
   * This method serializes all concurrent slot reservations for a given account
   * to prevent the "observe-low-count-and-burst" race condition that would
   * circumvent the rate limit.
   *
   * @param accountId the account to reserve a slot for
   */
  async throttle(accountId: string): Promise<void> {
    // Serialize reservation per account so concurrent sends can't all observe a
    // sub-limit count and burst together. The chain tail is wrapped so a failed
    // reservation never breaks the chain for subsequent sends.
    const prev = this.throttleChains.get(accountId) ?? Promise.resolve();
    const run = prev.then(() => this.reserveSlot(accountId));
    this.throttleChains.set(accountId, run.catch(() => undefined));
    await run;
  }

  /**
   * Internal: reserve a single slot for the account, waiting if necessary.
   * Called serially per account to avoid race conditions.
   */
  private async reserveSlot(accountId: string): Promise<void> {
    const limit = WaRateLimiter.MAX_SENDS_PER_MINUTE;
    const windowMs = WaRateLimiter.WINDOW_MS;
    let stamps = (this.sendTimestamps.get(accountId) ?? []).filter((t) => t > Date.now() - windowMs);

    if (stamps.length >= limit) {
      // Wait until enough of the oldest stamps expire to drop below the limit.
      // stamps is ascending; the stamp at index (length - limit) must age out of
      // the window before a fresh slot is available.
      const mustExpire = stamps[stamps.length - limit];
      const wait = mustExpire + windowMs - Date.now();
      if (wait > 0) {
        this.logger.warn(`Throttling account ${accountId}: waiting ${wait}ms (rate limit)`);
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      stamps = (this.sendTimestamps.get(accountId) ?? []).filter((t) => t > Date.now() - windowMs);
    }

    stamps.push(Date.now());
    this.sendTimestamps.set(accountId, stamps);
  }

  /**
   * Clear all rate-limit state for the given account. Removes both timestamps
   * and the throttle chain.
   *
   * @param accountId the account to clear
   */
  clearAccount(accountId: string): void {
    this.sendTimestamps.delete(accountId);
    this.throttleChains.delete(accountId);
  }
}

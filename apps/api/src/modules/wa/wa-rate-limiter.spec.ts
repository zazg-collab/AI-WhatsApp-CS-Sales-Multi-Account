import { WaRateLimiter } from './wa-rate-limiter';

describe('WaRateLimiter', () => {
  let limiter: WaRateLimiter;

  beforeEach(() => {
    limiter = new WaRateLimiter();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows 20 sends per account without throttling', async () => {
    const results: void[] = [];
    for (let i = 0; i < 20; i++) {
      results.push(await limiter.throttle('acc1'));
    }
    expect(results).toHaveLength(20);
  });

  it('isolates rate limits per account: saturating acc1 does not throttle acc2', async () => {
    // Fill acc1 to the limit
    for (let i = 0; i < 20; i++) {
      await limiter.throttle('acc1');
    }
    // acc2 should not be throttled at all
    const start = Date.now();
    await limiter.throttle('acc2');
    // Should complete immediately (no wait triggered)
    expect(Date.now() - start).toBeLessThan(50);
  });

  it('clears timestamps and chains for an account', async () => {
    await limiter.throttle('acc3');
    limiter.clearAccount('acc3');
    // After clear, throttle should work as if fresh
    await expect(limiter.throttle('acc3')).resolves.toBeUndefined();
  });

  it('allows a new send after the 60s window expires', async () => {
    // Fill the window
    for (let i = 0; i < 20; i++) {
      await limiter.throttle('acc4');
    }
    // Advance time past the 60s window
    jest.advanceTimersByTime(61_000);
    // Should resolve immediately without blocking
    await expect(limiter.throttle('acc4')).resolves.toBeUndefined();
  });
});

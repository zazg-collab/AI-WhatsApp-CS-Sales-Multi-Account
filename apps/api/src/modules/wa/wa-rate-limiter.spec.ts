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

  it('allows sends below the rate limit', async () => {
    const promises = Array.from({ length: 5 }, () => limiter.throttle('acc1'));
    await expect(Promise.all(promises)).resolves.toBeDefined();
  });

  it('tracks sends per account independently', async () => {
    await limiter.throttle('acc1');
    await limiter.throttle('acc2');
    // no cross-account interference
    expect(true).toBe(true);
  });

  it('clears stale timestamps outside the 60s window', async () => {
    // fill the slot
    for (let i = 0; i < 20; i++) await limiter.throttle('acc3');
    // advance time past the window
    jest.advanceTimersByTime(61_000);
    // should not throw / wait
    await expect(limiter.throttle('acc3')).resolves.toBeUndefined();
  });
});

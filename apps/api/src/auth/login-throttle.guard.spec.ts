import { HttpException } from '@nestjs/common';
import { LoginThrottleGuard } from './login-throttle.guard';

function ctx(email: string, ip = '1.2.3.4') {
  const request = { body: { email }, ip, socket: {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;
}

function makeGuard(max = 3) {
  const env: Record<string, string> = {
    LOGIN_MAX_ATTEMPTS: String(max),
    LOGIN_LOCKOUT_WINDOW_MS: '900000',
  };
  return new LoginThrottleGuard({ get: (k: string) => env[k] } as any);
}

describe('LoginThrottleGuard', () => {
  it('allows attempts up to the limit', () => {
    const guard = makeGuard(3);
    expect(guard.canActivate(ctx('a@b.com'))).toBe(true);
    expect(guard.canActivate(ctx('a@b.com'))).toBe(true);
    expect(guard.canActivate(ctx('a@b.com'))).toBe(true);
  });

  it('blocks once the limit is exceeded', () => {
    const guard = makeGuard(3);
    for (let i = 0; i < 3; i += 1) guard.canActivate(ctx('a@b.com'));
    expect(() => guard.canActivate(ctx('a@b.com'))).toThrow(HttpException);
  });

  it('tracks IP+email independently', () => {
    const guard = makeGuard(2);
    guard.canActivate(ctx('a@b.com'));
    guard.canActivate(ctx('a@b.com'));
    // Different email on same IP gets its own bucket.
    expect(guard.canActivate(ctx('other@b.com'))).toBe(true);
    // Same email from a different IP gets its own bucket too.
    expect(guard.canActivate(ctx('a@b.com', '9.9.9.9'))).toBe(true);
  });
});

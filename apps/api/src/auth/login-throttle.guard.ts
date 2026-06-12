import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

interface Attempt {
  count: number;
  resetAt: number;
}

/**
 * Brute-force guard for the login route (M3). The global rate limiter only
 * bounds overall request volume; this adds a much tighter per-IP+email cap
 * with a lockout window so an attacker cannot grind a single owner account.
 * Successful logins are not tracked here (the controller doesn't reset state),
 * so a legitimate user typing one wrong password is unaffected in practice.
 */
@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly attempts = new Map<string, Attempt>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(config: ConfigService) {
    this.maxAttempts = Number(config.get<string>('LOGIN_MAX_ATTEMPTS') ?? 10);
    this.windowMs = Number(
      config.get<string>('LOGIN_LOCKOUT_WINDOW_MS') ?? 15 * 60_000,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { body?: { email?: string } }>();
    const email = (request.body?.email ?? '').toLowerCase().trim();
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const key = `${ip}:${email}`;
    const now = Date.now();

    const existing = this.attempts.get(key);
    const bucket =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + this.windowMs };

    bucket.count += 1;
    this.attempts.set(key, bucket);
    this.cleanup(now);

    if (bucket.count > this.maxAttempts) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      throw new HttpException(
        `Too many login attempts. Try again in ${retryAfter}s.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  private cleanup(now: number) {
    if (this.attempts.size < 10_000) return;
    for (const [key, bucket] of this.attempts.entries()) {
      if (bucket.resetAt <= now) this.attempts.delete(key);
    }
  }
}

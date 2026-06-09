import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { createHash } from 'crypto';

interface Bucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly perIpLimit: number;
  private readonly perUserLimit: number;

  constructor(config: ConfigService) {
    this.windowMs = Number(config.get<string>('RATE_LIMIT_WINDOW_MS') ?? 60_000);
    this.perIpLimit = Number(config.get<string>('RATE_LIMIT_PER_IP') ?? 300);
    this.perUserLimit = Number(config.get<string>('RATE_LIMIT_PER_USER') ?? 600);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: { id?: string } }>();
    const response = context.switchToHttp().getResponse<Response>();
    const key = this.keyFor(request);
    const limit = request.user?.id ? this.perUserLimit : this.perIpLimit;
    const now = Date.now();
    const bucket = this.nextBucket(key, now);

    bucket.count += 1;
    const remaining = Math.max(0, limit - bucket.count);
    response.setHeader('x-ratelimit-limit', limit);
    response.setHeader('x-ratelimit-remaining', remaining);
    response.setHeader('x-ratelimit-reset', Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > limit) {
      throw new HttpException('Rate limit exceeded. Please retry later.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private nextBucket(key: string, now: number) {
    const existing = this.buckets.get(key);
    if (existing && existing.resetAt > now) return existing;
    this.cleanup(now);
    const bucket = { count: 0, resetAt: now + this.windowMs };
    this.buckets.set(key, bucket);
    return bucket;
  }

  private keyFor(request: Request & { user?: { id?: string } }) {
    if (request.user?.id) return `user:${request.user.id}`;
    const auth = request.headers.authorization ?? '';
    if (auth) return `token:${this.hash(auth)}`;
    return `ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 24);
  }

  private cleanup(now: number) {
    if (this.buckets.size < 10_000) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

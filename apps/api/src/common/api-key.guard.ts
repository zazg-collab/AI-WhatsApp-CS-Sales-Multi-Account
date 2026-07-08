import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Machine authentication for read-only service callers (e.g. the Hermes Agent
 * gateway pulling CRM reports). The caller presents a stable shared secret in
 * the `x-api-key` header, matched against AGENT_API_KEY.
 *
 * This is deliberately a *supervisor*, not an owner: it only guards read-only
 * report endpoints. It never grants mutation, user management, settings, or
 * message-send access — those stay behind human JWT + RolesGuard.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('AGENT_API_KEY') ?? '';
    if (!expected) {
      // Fail closed: an unconfigured key must not silently allow access.
      this.logger.warn('AGENT_API_KEY is not set; rejecting agent request');
      throw new ServiceUnavailableException('Agent API is not configured');
    }

    const req = context.switchToHttp().getRequest();
    const provided =
      (req.headers?.['x-api-key'] as string | undefined) ??
      this.fromBearer(req.headers?.['authorization'] as string | undefined);

    if (!provided || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }

  private fromBearer(header?: string): string | undefined {
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' ? value : undefined;
  }

  /** Constant-time comparison to avoid leaking the key via timing. */
  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}

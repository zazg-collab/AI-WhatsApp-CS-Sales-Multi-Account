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
 * Machine authentication for the Alertmanager webhook receiver — same shape as
 * ApiKeyGuard but its own secret (ALERTMANAGER_WEBHOOK_TOKEN) so rotating one
 * credential never affects the other caller.
 */
@Injectable()
export class AlertmanagerWebhookGuard implements CanActivate {
  private readonly logger = new Logger(AlertmanagerWebhookGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('ALERTMANAGER_WEBHOOK_TOKEN') ?? '';
    if (!expected) {
      this.logger.warn('ALERTMANAGER_WEBHOOK_TOKEN is not set; rejecting alert webhook request');
      throw new ServiceUnavailableException('Alertmanager webhook is not configured');
    }

    const req = context.switchToHttp().getRequest();
    const provided =
      (req.headers?.['x-webhook-token'] as string | undefined) ??
      this.fromBearer(req.headers?.['authorization'] as string | undefined);

    if (!provided || !this.safeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid or missing webhook token');
    }
    return true;
  }

  private fromBearer(header?: string): string | undefined {
    if (!header) return undefined;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' ? value : undefined;
  }

  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  }
}

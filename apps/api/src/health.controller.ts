import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { access, mkdir } from 'fs/promises';
import { constants } from 'fs';
import { ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { Roles, RolesGuard } from './auth/roles';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue('health') private readonly healthQueue: Queue,
  ) {}

  @Get()
  check() {
    return { status: 'ok', service: 'hermes-api', ts: new Date().toISOString() };
  }

  // WhatsApp session liveness — the system's #1 silent-outage signal. Returns
  // aggregate counts only (no account names/numbers) so an external uptime
  // monitor can poll it unauthenticated and alert when connected accounts drop.
  // status: 'ok' only when there are accounts and none are down/banned.
  @Get('whatsapp')
  async whatsapp() {
    const rows = await this.prisma.whatsappAccount.groupBy({
      by: ['sessionStatus'],
      _count: { _all: true },
    });
    const byState: Record<string, number> = {};
    for (const r of rows) byState[String(r.sessionStatus)] = r._count._all;
    const total = Object.values(byState).reduce((a, b) => a + b, 0);
    const connected = byState['connected'] ?? 0;
    const down = (byState['disconnected'] ?? 0) + (byState['banned'] ?? 0);
    return {
      status: total > 0 && down === 0 ? 'ok' : 'degraded',
      total,
      connected,
      down,
      byState,
      ts: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready() {
    const checks = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkSessionDirectory(),
      this.checkRequiredConfig(),
    ]);
    const ready = checks.every((check) => check.status === 'ok');
    return {
      status: ready ? 'ok' : 'degraded',
      service: 'hermes-api',
      checks,
      ts: new Date().toISOString(),
    };
  }

  // Config summary leaks recon-useful detail (M5): require an authenticated
  // owner/supervisor rather than exposing it publicly.
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'supervisor')
  @Get('config')
  configSummary() {
    const aiBaseUrl = this.config.get<string>('AI_BASE_URL') ?? 'https://api.openai.com/v1';
    return {
      apiPort: this.config.get<string>('API_PORT') ?? '3001',
      jwtConfigured: Boolean(this.config.get<string>('JWT_SECRET')),
      databaseConfigured: Boolean(this.config.get<string>('DATABASE_URL')),
      redisConfigured: Boolean(this.config.get<string>('REDIS_URL')),
      ai: {
        baseUrl: aiBaseUrl.replace(/\/$/, ''),
        model: this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini',
        apiKeyConfigured: Boolean(this.config.get<string>('AI_API_KEY')),
      },
      whatsapp: {
        sessionDir: this.config.get<string>('WA_SESSION_DIR') ?? './.wa-sessions',
      },
      notifications: {
        hermesTargetConfigured: Boolean(this.config.get<string>('HERMES_NOTIFY_TARGET')),
        hermesBin: this.config.get<string>('HERMES_BIN') ?? 'hermes',
      },
      hermesSidecarConfigured: Boolean(this.config.get<string>('HERMES_SIDECAR_URL')),
    };
  }

  private async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { name: 'database', status: 'ok' as const };
    } catch (error) {
      return {
        name: 'database',
        status: 'error' as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkRedis() {
    try {
      const client = await this.healthQueue.client;
      // bullmq's client type doesn't surface ping(), but ioredis provides it.
      const pong = await (client as unknown as { ping(): Promise<string> }).ping();
      return {
        name: 'redis',
        status: pong === 'PONG' ? ('ok' as const) : ('error' as const),
      };
    } catch (error) {
      return {
        name: 'redis',
        status: 'error' as const,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkSessionDirectory() {
    const sessionDir = this.config.get<string>('WA_SESSION_DIR') ?? './.wa-sessions';
    try {
      await mkdir(sessionDir, { recursive: true });
      await access(sessionDir, constants.R_OK | constants.W_OK);
      return { name: 'wa_session_dir', status: 'ok' as const, path: sessionDir };
    } catch (error) {
      return {
        name: 'wa_session_dir',
        status: 'error' as const,
        path: sessionDir,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkRequiredConfig() {
    const missing = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET'].filter(
      (key) => !this.config.get<string>(key),
    );
    return {
      name: 'required_config',
      status: missing.length === 0 ? 'ok' as const : 'error' as const,
      missing,
    };
  }
}

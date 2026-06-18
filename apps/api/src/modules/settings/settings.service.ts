import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AppSettings,
  AiSettings,
  WaSettings,
  NotificationSettings,
  SlaSettings,
} from './settings.types';

/**
 * Layers runtime-editable settings (app_settings table) over env-derived
 * defaults. Consumers (AiProvider, WaService, Notifications, SLA) read through
 * this so an admin can change behaviour from the dashboard without a redeploy.
 *
 * Values are cached in memory and refreshed on write, so the hot path stays a
 * cheap object read.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: AppSettings | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private num(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  /** Env-derived defaults — the baseline before any DB override. */
  private defaults(): AppSettings {
    return {
      ai: {
        baseUrl: (this.config.get<string>('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
        apiKey: this.config.get<string>('AI_API_KEY') ?? '',
        model: this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini',
        hermesModel: this.config.get<string>('HERMES_MODEL') ?? '',
        temperature: this.num(this.config.get('AI_TEMPERATURE'), 0.6),
        timeoutMs: this.num(this.config.get('AI_TIMEOUT_MS'), 30_000),
      },
      wa: {
        humanDelayMinMs: this.num(this.config.get('WA_HUMAN_DELAY_MIN_MS'), 600),
        humanDelayMaxMs: this.num(this.config.get('WA_HUMAN_DELAY_MAX_MS'), 1800),
        typingPerCharMs: this.num(this.config.get('WA_TYPING_PER_CHAR_MS'), 50),
        typingMinMs: this.num(this.config.get('WA_TYPING_MIN_MS'), 800),
        typingMaxMs: this.num(this.config.get('WA_TYPING_MAX_MS'), 6000),
      },
      notifications: {
        hermesNotifyTarget: this.config.get<string>('HERMES_NOTIFY_TARGET') ?? '',
      },
      sla: {
        responseMinutes: this.num(this.config.get('SLA_RESPONSE_MINUTES'), 15),
      },
    };
  }

  /** Load + cache the merged settings (defaults overlaid with DB rows). */
  async getAll(): Promise<AppSettings> {
    if (this.cache) return this.cache;
    const merged = this.defaults();
    try {
      const rows = await this.prisma.appSetting.findMany();
      for (const row of rows) {
        const cat = row.key as keyof AppSettings;
        if (cat in merged && row.value && typeof row.value === 'object') {
          merged[cat] = { ...merged[cat], ...(row.value as Record<string, unknown>) } as never;
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to load app settings, using env defaults: ${err}`);
    }
    this.cache = merged;
    return merged;
  }

  async ai(): Promise<AiSettings> {
    return (await this.getAll()).ai;
  }
  async wa(): Promise<WaSettings> {
    return (await this.getAll()).wa;
  }
  async notifications(): Promise<NotificationSettings> {
    return (await this.getAll()).notifications;
  }
  async sla(): Promise<SlaSettings> {
    return (await this.getAll()).sla;
  }

  /** Persist a category's values (partial merge) and invalidate the cache. */
  async updateCategory<K extends keyof AppSettings>(
    category: K,
    patch: Partial<AppSettings[K]>,
  ): Promise<AppSettings[K]> {
    const current = await this.getAll();
    const next = { ...current[category], ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: category },
      create: { key: category, value: next as object },
      update: { value: next as object },
    });
    this.cache = null;
    return next;
  }
}

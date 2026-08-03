import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AppSettings,
  AiSettings,
  WaSettings,
  NotificationSettings,
  SlaSettings,
  SentinelSettings,
  CampaignSettings,
  ShippingSettings, // >>> ANGGA <<<
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

  // >>> ANGGA: parser daftar dari env (CSV) untuk config modul shipping.
  // Nilai kosong/tidak diset → pakai fallback (daftar default §6 LAMPIRAN).
  private list(value: unknown, fallback: string[]): string[] {
    if (Array.isArray(value)) return value.map(String).map((v) => v.trim()).filter(Boolean);
    const raw = typeof value === 'string' ? value : '';
    const parsed = raw.split(',').map((v) => v.trim()).filter(Boolean);
    return parsed.length ? parsed : fallback;
  }
  // <<< ANGGA

  /** Env-derived defaults — the baseline before any DB override. */
  private defaults(): AppSettings {
    return {
      ai: {
        baseUrl: (this.config.get<string>('AI_BASE_URL') ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
        apiKey: this.config.get<string>('AI_API_KEY') ?? '',
        model: this.config.get<string>('AI_MODEL') ?? 'gpt-4o-mini',
        sentinelModel: this.config.get<string>('SENTINEL_MODEL') ?? this.config.get<string>('HERMES_MODEL') ?? '',
        temperature: this.num(this.config.get('AI_TEMPERATURE'), 0.6),
        timeoutMs: this.num(this.config.get('AI_TIMEOUT_MS'), 30_000),
        embedModel: this.config.get<string>('AI_EMBED_MODEL') ?? '',
        embedDim: this.num(this.config.get('AI_EMBED_DIM'), 1536),
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
        idleCloseDays: this.num(this.config.get('IDLE_CLOSE_DAYS'), 3),
      },
      sentinel: {
        autoSendConfidenceMin: this.num(this.config.get('SENTINEL_AUTO_SEND_MIN'), 90),
        draftConfidenceMin: this.num(this.config.get('SENTINEL_DRAFT_MIN'), 50),
        riskKeywords: this.config.get<string>('SENTINEL_RISK_KEYWORDS') ?? '',
        defaultAiMode: (this.config.get<string>('SENTINEL_DEFAULT_AI_MODE') as SentinelSettings['defaultAiMode']) ?? 'ai_draft',
      },
      campaign: {
        defaultRateLimitPerMinute: this.num(this.config.get('CAMPAIGN_DEFAULT_RATE_LIMIT'), 6),
        requireApproval: (this.config.get<string>('CAMPAIGN_REQUIRE_APPROVAL') ?? 'true') !== 'false',
      },
      // >>> ANGGA: default modul shipping. Angka & daftar di sini SAMA PERSIS
      // dengan tabel §6 LAMPIRAN; kode modul shipping tidak boleh punya salinan
      // angka-angka ini sendiri.
      shipping: {
        mengantarApiKey: this.config.get<string>('MENGANTAR_API_KEY') ?? '',
        mengantarOriginId: this.config.get<string>('MENGANTAR_ORIGIN_ID') ?? '',
        baseUrl: (this.config.get<string>('MENGANTAR_BASE_URL') ?? 'https://app.mengantar.com').replace(/\/$/, ''),
        courierExclude: this.list(this.config.get('SHIPPING_COURIER_EXCLUDE'), [
          'paxel', 'JNECargo', 'SiCepatCargo', 'SapCargo', 'iDexpressCargo', 'SAPLite', 'iDlite',
        ]),
        codAllowlist: this.list(this.config.get('SHIPPING_COD_ALLOWLIST'), ['JNE']),
        codBlockedRegionKeywords: this.list(
          this.config.get('SHIPPING_COD_BLOCKED_REGION_KEYWORDS'), ['papua', 'maluku'],
        ),
        defaultWeightGrams: this.num(this.config.get('SHIPPING_DEFAULT_WEIGHT_GRAMS'), 1000),
        quoteCacheTtlMs: this.num(this.config.get('SHIPPING_QUOTE_CACHE_TTL_MS'), 21_600_000),
        discountMaxPerOrder: this.num(this.config.get('SHIPPING_DISCOUNT_MAX_PER_ORDER'), 5000),
        priceRoundingIncrement: this.num(this.config.get('SHIPPING_PRICE_ROUNDING_INCREMENT'), 500),
      },
      // <<< ANGGA
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
  async sentinel(): Promise<SentinelSettings> {
    return (await this.getAll()).sentinel;
  }
  async campaign(): Promise<CampaignSettings> {
    return (await this.getAll()).campaign;
  }
  // >>> ANGGA
  async shipping(): Promise<ShippingSettings> {
    return (await this.getAll()).shipping;
  }
  // <<< ANGGA

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

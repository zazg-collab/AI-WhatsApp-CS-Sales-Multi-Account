import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

/**
 * >>> ANGGA — Klien HTTP API Mengantar (LAMPIRAN §5).
 *
 * Sengaja tipis dan bodoh: hanya bicara HTTP + membentuk URL, TIDAK memuat satu
 * pun aturan bisnis (filter kurir, kelayakan COD, pembulatan) — semua itu milik
 * `shipping.service.ts`. Pola meniru `hermes-agent.client.ts`: gagal apa pun
 * (jaringan, timeout, HTTP non-2xx, JSON rusak) dikembalikan sebagai `null`,
 * bukan lemparan — pemanggilnya lalu masuk jalur jujur "ongkir belum bisa
 * dipastikan" (Langkah "API error" LAMPIRAN §2), tidak pernah menebak angka.
 *
 * KEAMANAN: kunci API Mengantar ikut di PATH URL, bukan header. Karena itu URL
 * TIDAK PERNAH boleh masuk log/pesan galat apa adanya — selalu lewat `redact()`.
 */

/** Batas waktu satu panggilan HTTP ke Mengantar. Parameter teknis (bukan angka
 *  bisnis §6): lebih panjang dari ini, pelanggan WhatsApp sudah keburu menunggu
 *  terlalu lama dan lebih baik masuk jalur "belum bisa dipastikan". */
export const MENGANTAR_TIMEOUT_MS = 15_000;

export interface MengantarAddress {
  _id: string;
  PROVINCE_NAME: string;
  CITY_NAME: string;
  /** Nama resmi berlabel, mis. "Kota Bogor" / "Kab. Bogor". Dipakai untuk
   *  menyusun kalimat disambiguasi dengan kata-kata milik Mengantar sendiri,
   *  bukan karangan bot. */
  CITY_NAME_SI?: string;
  DISTRICT_NAME?: string;
  SUBDISTRICT_NAME?: string;
}

/** Satu entri kurir di dalam objek `data` respons allEstimatePublic.
 *  Field opsional semua: terbukti live bahwa sebagian kurir TIDAK mengirim
 *  `unsupported`/`unsupported_cod` sama sekali (lihat Rule 2 LAMPIRAN). */
export interface CourierEstimate {
  price?: number;
  discount?: number;
  codFee?: number;
  estimatedPrice?: number;
  estimatedSpecialPrice?: number;
  estimate_delivery?: string;
  unsupported?: boolean;
  unsupported_cod?: boolean;
  /** Diuji live dan diputuskan TIDAK dipakai (§11 poin 6) — didaftar di sini
   *  hanya supaya jelas bahwa ketiadaannya disengaja, bukan kelupaan. */
  coverage_cod?: boolean;
  isDangerousGoodsSupported?: boolean;
}

export type EstimateData = Record<string, CourierEstimate>;

export interface PerformanceData {
  couriers: Array<{ key: string; score: number }>;
  bestCourier?: string;
  recommendedDGCourier?: string;
  recommended?: string;
}

@Injectable()
export class MengantarClient {
  private readonly logger = new Logger(MengantarClient.name);

  constructor(private readonly settings: SettingsService) {}

  /** Samarkan kunci API dari teks URL sebelum masuk log. */
  static redact(url: string, apiKey: string): string {
    const safe = apiKey ? url.split(apiKey).join('***') : url;
    return safe.replace(/([?&]API_KEY=)[^&]*/gi, '$1***');
  }

  private async call<T>(url: string, apiKey: string, init?: RequestInit): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MENGANTAR_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        this.logger.warn(`Mengantar HTTP ${res.status} — ${MengantarClient.redact(url, apiKey)}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      // `err` bisa memuat URL (mis. pesan fetch) — jangan pernah cetak mentah.
      const msg = MengantarClient.redact(String(err), apiKey);
      this.logger.warn(`Mengantar gagal (${MengantarClient.redact(url, apiKey)}): ${msg}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** LAMPIRAN §5 #1 — Search Address. Mengembalikan [] kalau gagal/kosong. */
  async searchAddress(keyword: string): Promise<MengantarAddress[] | null> {
    const cfg = await this.settings.shipping();
    if (!cfg.mengantarApiKey) return null;
    const url = `${cfg.baseUrl}/api/public/${encodeURIComponent(cfg.mengantarApiKey)}/address/search?keyword=${encodeURIComponent(keyword)}`;
    const json = await this.call<{ success?: boolean; data?: MengantarAddress[] }>(url, cfg.mengantarApiKey);
    if (!json || !Array.isArray(json.data)) return null;
    return json.data;
  }

  /**
   * LAMPIRAN §5 #2/#3 — Check Shipping Fee Public.
   *
   * `weightKg` WAJIB dalam KILOGRAM. Ini bukan yang tertulis di Langkah 4-5
   * LAMPIRAN (yang menyebut gram) — dibuktikan live 2026-08-03: tarif naik
   * linear per kg (JNE Medan w=1 → 47.000, w=2 → 94.000, w=3 → 141.000), jadi
   * mengirim gram akan mengalikan ongkir 1000x. Konversi gram→kg (dibulatkan ke
   * ATAS) dilakukan di `shipping.service.ts`.
   */
  async estimate(params: {
    destinationId: string;
    weightKg: number;
    codAmount?: number;
  }): Promise<EstimateData | null> {
    const cfg = await this.settings.shipping();
    if (!cfg.mengantarApiKey || !cfg.mengantarOriginId) return null;
    const qs = new URLSearchParams({
      origin_id: cfg.mengantarOriginId,
      destination_id: params.destinationId,
      weight: String(params.weightKg),
    });
    // COD_AMOUNT sengaja HANYA disertakan di panggilan kedua (Langkah 8):
    // tanpa parameter ini `codFee` selalu 0 (Rule 6).
    if (params.codAmount != null) qs.set('COD_AMOUNT', String(Math.round(params.codAmount)));
    const url = `${cfg.baseUrl}/api/order/allEstimatePublic?${qs.toString()}`;
    const json = await this.call<{ data?: EstimateData }>(url, cfg.mengantarApiKey);
    if (!json || !json.data || typeof json.data !== 'object') return null;
    return json.data;
  }

  /** LAMPIRAN §5 #4 — Get Courier Performance. */
  async performance(city: string, allEstimateData: EstimateData): Promise<PerformanceData | null> {
    const cfg = await this.settings.shipping();
    if (!cfg.mengantarApiKey) return null;
    const url = `${cfg.baseUrl}/api/public/${encodeURIComponent(cfg.mengantarApiKey)}/order/getPerformancePublic`;
    const json = await this.call<{ success?: boolean; data?: PerformanceData }>(url, cfg.mengantarApiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city, allEstimateData }),
    });
    if (!json || !json.data || !Array.isArray(json.data.couriers)) return null;
    return json.data;
  }
}

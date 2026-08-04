'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Cpu,
  FloppyDisk,
  Package,
  ShieldWarning,
  MagnifyingGlass,
  CheckCircle,
  Warning,
} from '@/components/ui/core-essential-icons';
import { api } from '@/lib/api';
import { useHasRole } from '@/lib/use-has-role';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import { useT, type Dict } from '@/lib/i18n';

/**
 * >>> ANGGA — Pengaturan modul Shipping Service Mengantar.
 *
 * Halaman terpisah, bukan tab keenam di `/settings/ai`: berkas itu sudah 640
 * baris sementara konvensi repo (CLAUDE.md) menetapkan batas 400. Rasanya tetap
 * satu area Pengaturan karena baris tab di atas menautkan keduanya.
 *
 * Seluruh angka & daftar di sini adalah config §6 LAMPIRAN. Tidak ada satu pun
 * yang disalin sebagai nilai tetap di frontend — semuanya dibaca dari server dan
 * ditulis balik ke server, supaya tidak pernah ada dua sumber kebenaran.
 */

const dict: Dict = {
  title: { id: 'Pengaturan', en: 'Settings' },
  subtitle: {
    id: 'Ongkir live Mengantar: kredensial, aturan kurir, kebijakan COD, dan pembulatan harga',
    en: 'Live Mengantar shipping: credentials, courier rules, COD policy, and price rounding',
  },
  tabGeneral: { id: 'Pengaturan umum', en: 'General settings' },
  tabShipping: { id: 'Ongkir (Mengantar)', en: 'Shipping (Mengantar)' },
  readOnly: {
    id: 'Hanya owner yang dapat mengubah pengaturan. Anda melihat dalam mode baca.',
    en: 'Only owners can change settings. You are viewing in read-only mode.',
  },
  loadError: { id: 'Gagal memuat pengaturan dari API.', en: 'Failed to load settings from the API.' },
  saveError: { id: 'Gagal menyimpan pengaturan.', en: 'Failed to save settings.' },
  saved: { id: 'Tersimpan.', en: 'Saved.' },
  save: { id: 'Simpan perubahan', en: 'Save changes' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },

  // Status
  statusReady: { id: 'Modul ongkir aktif', en: 'Shipping module active' },
  statusNotReady: { id: 'Kredensial belum lengkap', en: 'Credentials incomplete' },
  statusNotReadyHint: {
    id: 'Selama kredensial kosong, bot TIDAK PERNAH menebak angka — ia selalu menjawab bahwa ongkir belum bisa dipastikan.',
    en: 'While credentials are empty the bot NEVER guesses a number — it always says shipping cannot be confirmed yet.',
  },
  cacheStat: { id: 'Cache kutipan: {n} percakapan aktif', en: 'Quote cache: {n} active conversations' },

  // Kredensial
  credTitle: { id: 'Kredensial Mengantar', en: 'Mengantar credentials' },
  apiKey: { id: 'API Key', en: 'API Key' },
  apiKeySet: { id: 'Tersimpan — kosongkan untuk tidak mengubah', en: 'Stored — leave blank to keep unchanged' },
  apiKeyEmpty: { id: 'Belum diatur', en: 'Not set' },
  originId: { id: 'Origin ID (titik asal kirim)', en: 'Origin ID (pickup point)' },
  originIdHint: {
    id: 'ID alamat gudang/toko di Mengantar. Dipakai sebagai origin_id di setiap panggilan tarif.',
    en: 'Your warehouse/store address id at Mengantar. Sent as origin_id on every rate call.',
  },
  baseUrl: { id: 'Base URL', en: 'Base URL' },
  baseUrlHint: { id: 'Bawaan https://app.mengantar.com. Ubah hanya untuk sandbox/uji.', en: 'Defaults to https://app.mengantar.com. Change only for sandbox/testing.' },

  // Aturan kurir
  courierTitle: { id: 'Aturan kurir & COD', en: 'Courier & COD rules' },
  listHint: { id: 'Dipisah koma.', en: 'Comma-separated.' },
  courierExclude: { id: 'Kurir yang tidak pernah ditawarkan', en: 'Couriers never offered' },
  courierExcludeHint: {
    id: 'Dibuang sebelum kurir dipilih, apa pun tarif atau skornya. Varian Cargo & Lite ada di sini karena keputusan bisnis, bukan keterbatasan teknis.',
    en: 'Dropped before courier selection regardless of price or score. Cargo & Lite variants are here as a business decision, not a technical limit.',
  },
  codAllowlist: { id: 'Kurir yang boleh COD walau flag API kosong', en: 'Couriers allowed COD despite an empty API flag' },
  codAllowlistHint: {
    id: 'Sebagian kurir tidak mengirim field unsupported_cod sama sekali. Yang tidak ada di daftar ini hanya ditawarkan non-COD. JANGAN tambah kurir sebelum COD-nya benar-benar diuji kirim.',
    en: 'Some couriers omit the unsupported_cod field entirely. Anything not listed here is offered non-COD only. Do NOT add a courier before a real COD shipment proves it works.',
  },
  codBlocked: { id: 'Kata kunci wilayah tanpa COD', en: 'No-COD region keywords' },
  codBlockedHint: {
    id: 'Dicocokkan sebagai bagian nama provinsi (huruf besar-kecil diabaikan), bukan nama persis — jadi provinsi hasil pemekaran ikut terblokir otomatis. Kebijakan toko, bukan keterbatasan ekspedisi.',
    en: 'Matched as a substring of the province name (case-insensitive), not an exact name — so newly split provinces are blocked automatically. A store policy, not a carrier limit.',
  },

  // >>> ANGGA: kamus nama panggilan daerah.
  aliasTitle: { id: 'Nama panggilan daerah', en: 'Place nicknames' },
  alias: { id: 'Tukar nama sebelum dicari', en: 'Rewrite before searching' },
  aliasHint: {
    id: 'Satu baris per nama: yang diketik pelanggan = yang dicari ke Mengantar. Data Mengantar memakai nama resmi, pelanggan memakai nama panggilan — "solo", "jogja", "sby", "tangsel" semuanya nihil hasil di sana. Dicocokkan ke SELURUH kata kunci, huruf besar-kecil diabaikan; kalau tidak ada di daftar, yang diketik dipakai apa adanya. Isi kanan boleh nama kota resmi atau nama kecamatan.',
    en: 'One line per name: what the customer types = what is searched at Mengantar. Mengantar uses official names while customers use nicknames — "solo", "jogja", "sby", "tangsel" all return nothing there. Matched against the WHOLE keyword, case-insensitive; anything not listed is searched as typed. The right-hand side may be an official city or a district name.',
  },

  // Angka
  numbersTitle: { id: 'Berat & harga', en: 'Weight & pricing' },
  defaultWeight: { id: 'Berat default per produk (gram)', en: 'Default weight per product (grams)' },
  defaultWeightHint: {
    id: 'Dipakai hanya untuk produk yang kolom beratnya dikosongkan di halaman Produk & Stok.',
    en: 'Used only for products whose weight field is left empty on the Products & Stock page.',
  },
  rounding: { id: 'Pembulatan harga (rupiah)', en: 'Price rounding (rupiah)' },
  roundingHint: {
    id: 'Total transfer & COD dibulatkan ke kelipatan terdekat sebelum disebut ke pelanggan. Isi 1 untuk mematikan pembulatan.',
    en: 'Transfer & COD totals are rounded to the nearest multiple before being quoted. Set 1 to disable rounding.',
  },
  cacheTtl: { id: 'Umur cache kutipan (jam)', en: 'Quote cache lifetime (hours)' },
  cacheTtlHint: {
    id: 'Selama ini, tujuan yang sama dalam satu percakapan tidak memanggil API lagi. Cache tetap direset kalau pelanggan menyebut kota lain atau menambah barang.',
    en: 'Within this window the same destination in one conversation skips the API. The cache still resets when the customer names another city or adds an item.',
  },
  discountMax: { id: 'Batas diskon ongkir per order (rupiah)', en: 'Max shipping discount per order (rupiah)' },
  discountMaxHint: {
    id: 'v1: dokumentasi untuk bot saja — belum ditegakkan lewat gate numerik. Angka ini tidak memotong total secara otomatis.',
    en: 'v1: guidance for the bot only — not yet enforced by a numeric gate. This does not deduct from totals automatically.',
  },

  // Uji
  testTitle: { id: 'Uji hitung ongkir', en: 'Test a shipping quote' },
  testIntro: {
    id: 'Memanggil API Mengantar sungguhan dengan kredensial di atas, persis seperti yang dilakukan bot. Tidak mengirim apa pun ke pelanggan.',
    en: 'Calls the real Mengantar API with the credentials above, exactly like the bot does. Nothing is sent to any customer.',
  },
  testCity: { id: 'Kota/kabupaten tujuan', en: 'Destination city/regency' },
  testItems: { id: 'Barang (satu per baris: nama produk, qty)', en: 'Items (one per line: product name, qty)' },
  testItemsHint: {
    id: 'Contoh: Golok Cordova, 2 — nama dicocokkan ke katalog Produk & Stok, harga & beratnya diambil dari sana.',
    en: 'Example: Golok Cordova, 2 — the name is matched against the Products & Stock catalog; price & weight come from there.',
  },
  testRun: { id: 'Hitung', en: 'Calculate' },
  testRunning: { id: 'Menghitung…', en: 'Calculating…' },
  testFail: { id: 'Gagal memanggil API ongkir.', en: 'Failed to call the shipping API.' },
  resTransfer: { id: 'Total transfer', en: 'Transfer total' },
  resCod: { id: 'Total COD', en: 'COD total' },
  resNoCod: { id: 'COD tidak ditawarkan', en: 'COD not offered' },
  resWeight: { id: 'Berat ditagih', en: 'Chargeable weight' },
  resGoods: { id: 'Harga barang', en: 'Goods subtotal' },
  resShippingOnly: {
    id: 'Dihitung TANPA barang — angka di bawah adalah ONGKIR saja (berat default toko, 1 unit), bukan total belanja. Isi kolom barang kalau ingin total yang sebenarnya.',
    en: 'Calculated with NO items — the numbers below are SHIPPING only (store default weight, 1 unit), not an order total. Fill the items box for a real total.',
  },

  stAmbiguous: { id: 'Nama kota cocok dengan beberapa daerah — bot akan bertanya dulu, tidak menebak.', en: 'The city name matches several places — the bot will ask first, never guess.' },
  stNeedDetail: {
    id: 'Nama daerahnya belum bisa dipastikan — bot akan minta KECAMATAN-nya (provinsi ditawarkan kalau pelanggan bingung).',
    en: 'The place could not be pinned down — the bot will ask for the DISTRICT (province offered if the customer is unsure).',
  },
  stUnresolved: { id: 'Barang belum cocok dengan katalog — bot memastikan produknya dulu, tanpa menyebut angka.', en: 'Items do not match the catalog — the bot confirms the product first, without quoting a number.' },
  stNoCourier: { id: 'API menjawab, tapi tidak ada kurir yang lolos saringan. Diperlakukan sama seperti API mati.', en: 'The API answered but no courier passed the filter. Treated the same as an API outage.' },
  stApiError: { id: 'API Mengantar tidak menjawab. Bot akan bilang ongkir belum bisa dipastikan.', en: 'The Mengantar API did not respond. The bot will say shipping cannot be confirmed.' },
  stNotConfigured: { id: 'Kredensial belum diisi.', en: 'Credentials are not set.' },
  stNoDestination: { id: 'Tidak ada tujuan yang terdeteksi.', en: 'No destination detected.' },
};

interface ShippingSettings {
  mengantarApiKeySet: boolean;
  mengantarOriginId: string;
  baseUrl: string;
  courierExclude: string[];
  codAllowlist: string[];
  codBlockedRegionKeywords: string[];
  defaultWeightGrams: number;
  quoteCacheTtlMs: number;
  discountMaxPerOrder: number;
  priceRoundingIncrement: number;
  destinationAliases: Record<string, string>; // >>> ANGGA <<<
}

interface QuoteOk {
  status: 'ok';
  quote: {
    city: string; province: string; weightKg: number; goodsTotal: number;
    transferCourier: string; transferTotal: number;
    codCourier: string | null; codTotal: number | null; codEligible: boolean;
    shippingOnly?: boolean;
  };
}
/** Semua status non-ok yang bisa dikembalikan ShippingService. Didaftar satu
 *  per satu (bukan `string`) supaya TypeScript bisa mempersempit tipe, dan
 *  supaya status baru di server memaksa halaman ini ikut diperbarui. */
interface QuoteOther {
  status: 'ambiguous' | 'need_more_detail' | 'unresolved_items' | 'no_courier'
    | 'api_error' | 'not_configured' | 'no_destination';
  candidates?: Array<{ city: string; province: string; label: string }>;
}
type QuoteResult = QuoteOk | QuoteOther;

const fieldCls =
  'h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-sentinel-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

const HOUR_MS = 3_600_000;

/** "a, b , ,c" → ["a","b","c"]. Entri kosong dibuang, bukan dikirim sebagai "". */
export function parseList(raw: string): string[] {
  return raw.split(',').map((v) => v.trim()).filter(Boolean);
}

/** "Golok Cordova, 2\nPisau, 1" → [{name,qty}]. qty default 1 kalau tidak wajar. */
export function parseItems(raw: string): Array<{ name: string; qty: number }> {
  return raw
    .split('\n')
    .map((line) => {
      const parts = line.split(',');
      const qtyRaw = parts.length > 1 ? Number(parts.pop()) : NaN;
      const name = parts.join(',').trim();
      if (!name) return null;
      return { name, qty: Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.floor(qtyRaw) : 1 };
    })
    .filter((x): x is { name: string; qty: number } => x !== null);
}

/**
 * >>> ANGGA — kamus alias sebagai teks biasa, satu baris per nama:
 *   `solo = surakarta`
 * Dipilih ketimbang tabel dua kolom karena isinya sering ditempel sekaligus
 * dari catatan, dan baris tanpa `=` cukup diabaikan diam-diam saat mengetik
 * (jangan sampai baris setengah jadi menghapus baris lain).
 */
export function parseAliases(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const baris of raw.split('\n')) {
    const i = baris.indexOf('=');
    if (i <= 0) continue;
    const dari = baris.slice(0, i).trim().toLowerCase().replace(/\s+/g, ' ');
    const ke = baris.slice(i + 1).trim();
    if (dari && ke) out[dari] = ke;
  }
  return out;
}

export function formatAliases(map: Record<string, string>): string {
  return Object.entries(map ?? {})
    .map(([dari, ke]) => `${dari} = ${ke}`)
    .join('\n');
}

export function formatIdr(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function ShippingSettingsPage() {
  const t = useT(dict);
  const { allowed: canEdit, ready: roleReady } = useHasRole('owner');
  const [data, setData] = useState<ShippingSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [aliasText, setAliasText] = useState(''); // >>> ANGGA <<<
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [cacheSize, setCacheSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Uji ongkir
  const [testCity, setTestCity] = useState('');
  const [testItems, setTestItems] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<QuoteResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  function loadStatus() {
    api<{ configured: boolean; cache: { size: number } }>('/shipping/status')
      .then((s) => { setConfigured(s.configured); setCacheSize(s.cache?.size ?? 0); })
      .catch(() => { setConfigured(null); setCacheSize(null); });
  }

  useEffect(() => {
    api<{ shipping: ShippingSettings }>('/settings')
      .then((all) => {
        setData(all.shipping);
        // >>> ANGGA: teks alias disimpan MENTAH di state sendiri. Kalau ia
        // di-parse setiap ketikan, baris yang baru setengah diketik ("solo"
        // tanpa "=") langsung hilang dari layar.
        setAliasText(formatAliases(all.shipping.destinationAliases));
      })
      .catch((err) => setError(err instanceof Error ? err.message : t('loadError')));
    loadStatus();
  }, [t]);

  function patch<K extends keyof ShippingSettings>(key: K, value: ShippingSettings[K] | string) {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
    setSavedMsg(null);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const payload: Record<string, unknown> = {
        mengantarOriginId: data.mengantarOriginId,
        baseUrl: data.baseUrl,
        courierExclude: data.courierExclude,
        codAllowlist: data.codAllowlist,
        codBlockedRegionKeywords: data.codBlockedRegionKeywords,
        defaultWeightGrams: Number(data.defaultWeightGrams),
        quoteCacheTtlMs: Number(data.quoteCacheTtlMs),
        discountMaxPerOrder: Number(data.discountMaxPerOrder),
        priceRoundingIncrement: Number(data.priceRoundingIncrement),
        destinationAliases: parseAliases(aliasText), // >>> ANGGA <<<
      };
      // Kunci kosong = pertahankan yang tersimpan (server juga menjaga ini).
      if (apiKeyInput.trim()) payload.mengantarApiKey = apiKeyInput.trim();

      const updated = await api<{ shipping: ShippingSettings }>('/settings', {
        method: 'PUT',
        body: JSON.stringify({ shipping: payload }),
      });
      setData(updated.shipping);
      setAliasText(formatAliases(updated.shipping.destinationAliases)); // >>> ANGGA <<<
      setApiKeyInput('');
      setSavedMsg(t('saved'));
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const r = await api<QuoteResult>('/shipping/test-quote', {
        method: 'POST',
        body: JSON.stringify({ keyword: testCity.trim(), items: parseItems(testItems) }),
      });
      setTestResult(r);
      loadStatus();
    } catch (err) {
      setTestError(err instanceof Error ? err.message : t('testFail'));
    } finally {
      setTesting(false);
    }
  }

  const statusNote: Record<string, string> = {
    ambiguous: t('stAmbiguous'),
    need_more_detail: t('stNeedDetail'),
    unresolved_items: t('stUnresolved'),
    no_courier: t('stNoCourier'),
    api_error: t('stApiError'),
    not_configured: t('stNotConfigured'),
    no_destination: t('stNoDestination'),
  };

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-4 sm:p-5">
        {/* Baris tab: menautkan halaman ini dengan pengaturan umum supaya tetap
            terasa satu area, walau rutenya terpisah. */}
        <div className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-gray-800">
          <Link
            href="/settings/ai"
            className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Cpu className="h-4 w-4" aria-hidden="true" />
            {t('tabGeneral')}
          </Link>
          <span className="flex shrink-0 items-center gap-1.5 border-b-2 border-sentinel-600 px-3 py-2.5 text-[13px] font-medium text-sentinel-700 dark:text-sentinel-300">
            <Package className="h-4 w-4" aria-hidden="true" />
            {t('tabShipping')}
          </span>
        </div>

        {roleReady && !canEdit && (
          <Card className="mb-4 flex items-start gap-2 border-review-200 bg-review-50 p-3 dark:border-review-700/40 dark:bg-review-900/20">
            <ShieldWarning className="mt-0.5 h-4 w-4 shrink-0 text-review-600" aria-hidden="true" />
            <p className="text-[13px] text-review-700 dark:text-review-300">{t('readOnly')}</p>
          </Card>
        )}

        {error && (
          <Card className="mb-4 border-danger-200 bg-danger-50 p-3 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
          </Card>
        )}

        {configured !== null && (
          <Card
            className={cn(
              'mb-4 flex items-start gap-2 p-3',
              configured
                ? 'border-channel-200 bg-channel-50 dark:border-channel-700/40 dark:bg-channel-900/20'
                : 'border-review-200 bg-review-50 dark:border-review-700/40 dark:bg-review-900/20',
            )}
          >
            {configured
              ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-channel-600" aria-hidden="true" />
              : <Warning className="mt-0.5 h-4 w-4 shrink-0 text-review-600" aria-hidden="true" />}
            <div className="min-w-0">
              <p className={cn('text-[13px] font-medium', configured ? 'text-channel-700 dark:text-channel-400' : 'text-review-700 dark:text-review-300')}>
                {configured ? t('statusReady') : t('statusNotReady')}
              </p>
              <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                {configured ? t('cacheStat', { n: cacheSize ?? 0 }) : t('statusNotReadyHint')}
              </p>
            </div>
          </Card>
        )}

        {!data ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-10 rounded animate-shimmer" />)}
          </div>
        ) : (
          <>
            <Card className="p-4 sm:p-5">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('credTitle')}</h2>
                <Field label={t('apiKey')} hint={data.mengantarApiKeySet ? t('apiKeySet') : t('apiKeyEmpty')}>
                  <input type="password" className={fieldCls} disabled={!canEdit}
                    placeholder={data.mengantarApiKeySet ? '••••••••' : ''}
                    value={apiKeyInput}
                    onChange={(e) => { setApiKeyInput(e.target.value); setSavedMsg(null); }} />
                </Field>
                <Field label={t('originId')} hint={t('originIdHint')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.mengantarOriginId}
                    onChange={(e) => patch('mengantarOriginId', e.target.value)} />
                </Field>
                <Field label={t('baseUrl')} hint={t('baseUrlHint')}>
                  <input className={fieldCls} disabled={!canEdit} value={data.baseUrl}
                    onChange={(e) => patch('baseUrl', e.target.value)} />
                </Field>

                <h2 className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('courierTitle')}</h2>
                <Field label={t('courierExclude')} hint={`${t('listHint')} ${t('courierExcludeHint')}`}>
                  <input className={fieldCls} disabled={!canEdit} value={data.courierExclude.join(', ')}
                    onChange={(e) => patch('courierExclude', parseList(e.target.value))} />
                </Field>
                <Field label={t('codAllowlist')} hint={`${t('listHint')} ${t('codAllowlistHint')}`}>
                  <input className={fieldCls} disabled={!canEdit} value={data.codAllowlist.join(', ')}
                    onChange={(e) => patch('codAllowlist', parseList(e.target.value))} />
                </Field>
                <Field label={t('codBlocked')} hint={`${t('listHint')} ${t('codBlockedHint')}`}>
                  <input className={fieldCls} disabled={!canEdit} value={data.codBlockedRegionKeywords.join(', ')}
                    onChange={(e) => patch('codBlockedRegionKeywords', parseList(e.target.value))} />
                </Field>

                {/* >>> ANGGA: kamus nama panggilan daerah. */}
                <h2 className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('aliasTitle')}</h2>
                <Field label={t('alias')} hint={t('aliasHint')}>
                  <textarea
                    rows={8}
                    spellCheck={false}
                    aria-label={t('alias')}
                    className={`${fieldCls} h-auto resize-y py-2 font-mono leading-5`}
                    disabled={!canEdit}
                    value={aliasText}
                    onChange={(e) => { setAliasText(e.target.value); setSavedMsg(null); }}
                  />
                </Field>

                <h2 className="pt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('numbersTitle')}</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('defaultWeight')} hint={t('defaultWeightHint')}>
                    <input type="number" min="1" className={fieldCls} disabled={!canEdit}
                      value={data.defaultWeightGrams}
                      onChange={(e) => patch('defaultWeightGrams', e.target.value)} />
                  </Field>
                  <Field label={t('rounding')} hint={t('roundingHint')}>
                    <input type="number" min="1" className={fieldCls} disabled={!canEdit}
                      value={data.priceRoundingIncrement}
                      onChange={(e) => patch('priceRoundingIncrement', e.target.value)} />
                  </Field>
                  <Field label={t('cacheTtl')} hint={t('cacheTtlHint')}>
                    <input type="number" min="0" step="0.5" className={fieldCls} disabled={!canEdit}
                      aria-label={t('cacheTtl')}
                      value={Number(data.quoteCacheTtlMs) / HOUR_MS}
                      onChange={(e) => patch('quoteCacheTtlMs', String(Number(e.target.value) * HOUR_MS))} />
                  </Field>
                  <Field label={t('discountMax')} hint={t('discountMaxHint')}>
                    <input type="number" min="0" className={fieldCls} disabled={!canEdit}
                      value={data.discountMaxPerOrder}
                      onChange={(e) => patch('discountMaxPerOrder', e.target.value)} />
                  </Field>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
                <Button onClick={save} disabled={!canEdit || saving}>
                  <FloppyDisk className="h-4 w-4" aria-hidden="true" />
                  {saving ? t('saving') : t('save')}
                </Button>
                {savedMsg && <span className="text-[13px] font-medium text-channel-700 dark:text-channel-400">{savedMsg}</span>}
              </div>
            </Card>

            {/* Uji ongkir — pola "kolom uji pertanyaan" di menu Knowledge. */}
            <Card className="mt-4 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('testTitle')}</h2>
              <p className="mb-4 mt-1 text-xs text-gray-500 dark:text-gray-400">{t('testIntro')}</p>
              <div className="space-y-4">
                <Field label={t('testCity')}>
                  <input className={fieldCls} value={testCity} placeholder="Medan"
                    onChange={(e) => setTestCity(e.target.value)} />
                </Field>
                <Field label={t('testItems')} hint={t('testItemsHint')}>
                  <textarea
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-sentinel-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    value={testItems}
                    onChange={(e) => setTestItems(e.target.value)}
                  />
                </Field>
                <Button variant="outline" size="sm" onClick={runTest} disabled={testing || !testCity.trim()}>
                  <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
                  {testing ? t('testRunning') : t('testRun')}
                </Button>

                {testError && (
                  <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{testError}</p>
                )}

                {testResult?.status === 'ok' && (
                  <div className="rounded-lg border border-gray-200 p-3 text-[13px] dark:border-gray-700">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone="success">{testResult.quote.city}</Badge>
                      <span className="text-xs text-gray-400">{testResult.quote.province}</span>
                    </div>
                    {testResult.quote.shippingOnly && (
                      <p className="mb-2 text-xs text-review-700 dark:text-review-300">{t('resShippingOnly')}</p>
                    )}
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                      <dt className="text-gray-500">{t('resGoods')}</dt>
                      <dd className="text-right tabular-nums">Rp{formatIdr(testResult.quote.goodsTotal)}</dd>
                      <dt className="text-gray-500">{t('resWeight')}</dt>
                      <dd className="text-right tabular-nums">{testResult.quote.weightKg} kg</dd>
                      <dt className="font-medium text-gray-700 dark:text-gray-200">{t('resTransfer')}</dt>
                      <dd className="text-right font-medium tabular-nums">
                        Rp{formatIdr(testResult.quote.transferTotal)}
                        <span className="ml-1 text-xs font-normal text-gray-400">{testResult.quote.transferCourier}</span>
                      </dd>
                      <dt className="font-medium text-gray-700 dark:text-gray-200">{t('resCod')}</dt>
                      <dd className="text-right font-medium tabular-nums">
                        {testResult.quote.codTotal != null ? (
                          <>
                            Rp{formatIdr(testResult.quote.codTotal as number)}
                            <span className="ml-1 text-xs font-normal text-gray-400">{testResult.quote.codCourier}</span>
                          </>
                        ) : (
                          <span className="text-xs font-normal text-gray-400">{t('resNoCod')}</span>
                        )}
                      </dd>
                    </dl>
                  </div>
                )}

                {testResult && testResult.status !== 'ok' && (
                  <div className="rounded-lg border border-review-200 bg-review-50 p-3 text-[13px] text-review-700 dark:border-review-700/40 dark:bg-review-900/20 dark:text-review-300">
                    <p>{statusNote[testResult.status] ?? testResult.status}</p>
                    {testResult.candidates && (
                      <ul className="mt-1 list-inside list-disc text-xs">
                        {testResult.candidates.map((c) => <li key={`${c.province}-${c.city}-${c.label}`}>{c.label}</li>)}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

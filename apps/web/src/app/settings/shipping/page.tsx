'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Brain, // >>> ANGGA — addendum v2 M5 <<<
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
import { parseList, parseItems, parseAliases, formatAliases, formatIdr } from './shipping.utils';

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
  tabOrderMemory: { id: 'Memori Order', en: 'Order Memory' }, // >>> ANGGA — addendum v2 M5 <<<
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
  // >>> ANGGA — Fase 113 (2026-08-04): di-rename dari "diskon ongkir per
  // order" — nama & label lamanya BERBOHONG dua kali: field ini sebenarnya
  // untuk diskon BARANG (belum diimplementasikan), dan kebijakan Bossfren
  // untuk itu selalu per PCS, bukan per order. Diskon ongkir yang SUDAH
  // ditegakkan sistem ada di field terpisah di bawah (shippingDiscountPercentMax).
  discountMax: { id: 'Batas diskon barang per pcs (rupiah)', en: 'Max per-item goods discount (rupiah)' },
  discountMaxHint: {
    id: 'v1: dokumentasi untuk bot saja — belum ditegakkan lewat gate numerik. Diskon ONGKIR (persen, ditegakkan sistem) diatur terpisah di bawah.',
    en: 'v1: guidance for the bot only — not yet enforced by a numeric gate. Shipping discount (percentage, system-enforced) is configured separately below.',
  },
  shippingDiscountPercent: { id: 'Diskon ongkir maksimum (%)', en: 'Max shipping discount (%)' },
  shippingDiscountPercentHint: {
    id: 'Dihitung dari ONGKIR (bukan total), dibulatkan ke bawah supaya tidak pernah melewati batas ini. Sistem yang menghitung & menuliskan nominalnya lewat penanda {{diskon_ongkir}} — bot tidak pernah mengarang angka diskon sendiri.',
    en: 'Calculated from the SHIPPING FEE (not the total), rounded down so it never exceeds this cap. The system computes and writes the amount via the {{diskon_ongkir}} placeholder — the bot never invents a discount figure itself.',
  },

  // >>> ANGGA — addendum v2 M5: dict & kartu "Memori order percakapan"
  // PINDAH ke halaman sendiri /settings/order-memory (ketok Bossfren). <<<

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

  // >>> ANGGA — P5 (2026-08-05, ketok Bossfren): debug search keyword.
  searchTitle: { id: 'Uji search keyword tujuan', en: 'Destination keyword search debug' },
  searchIntro: {
    id: 'Melihat PERSIS apa yang dilihat sistem untuk satu kata kunci tujuan: hasil mentah API Mengantar (maks 50 baris) + pengelompokan kandidat ber-level. Alias tujuan ikut diterapkan. Berguna melacak kota yang "tenggelam" (kasus Mataram NTB vs Lampung).',
    en: 'Shows EXACTLY what the system sees for one destination keyword: raw Mengantar rows (max 50) + level-ranked candidate groups. Destination aliases apply.',
  },
  searchKwLabel: { id: 'Kata kunci', en: 'Keyword' },
  searchRun: { id: 'Cari', en: 'Search' },
  searchRunning: { id: 'Mencari…', en: 'Searching…' },
  searchFail: { id: 'Gagal memanggil API search.', en: 'Search API call failed.' },
  searchAliasNote: { id: 'Alias aktif — yang dicari:', en: 'Alias applied — searched for:' },
  searchGroups: { id: 'Kelompok kandidat (urutan yang dipakai sistem)', en: 'Candidate groups (system order)' },
  searchRowsT: { id: 'Baris mentah API', en: 'Raw API rows' },
  searchEmpty: { id: 'Nol baris hasil.', en: 'Zero rows returned.' },
  // <<< ANGGA
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
  discountMaxPerPcs: number; // >>> ANGGA — Fase 113: di-rename dari discountMaxPerOrder <<<
  priceRoundingIncrement: number;
  shippingDiscountPercentMax: number; // >>> ANGGA — Fase 113 <<<
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
  // >>> ANGGA — P5 (2026-08-05): debug search keyword.
  const [searchKw, setSearchKw] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [searchRes, setSearchRes] = useState<{
    keyword: string;
    dicari: string;
    total: number;
    gagal?: boolean;
    rows: Array<{ kelurahan: string; kecamatan: string; kota: string; provinsi: string }>;
    groups: Array<{ city: string; cityLabel: string; province: string; level: string; rows: number }>;
  } | null>(null);
  // <<< ANGGA

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
        discountMaxPerPcs: Number(data.discountMaxPerPcs), // >>> ANGGA — Fase 113 <<<
        priceRoundingIncrement: Number(data.priceRoundingIncrement),
        shippingDiscountPercentMax: Number(data.shippingDiscountPercentMax), // >>> ANGGA — Fase 113 <<<
        destinationAliases: parseAliases(aliasText), // >>> ANGGA <<<
        // Field "Memori order percakapan" SENGAJA tidak ikut di sini —
        // section itu punya tombol simpan sendiri (permintaan Bossfren
        // 2026-08-04): kebijakan memori order tersimpan terpisah dari
        // kredensial/aturan kurir, walau sama-sama kategori `shipping`
        // (server melakukan partial merge per kategori).
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

  // >>> ANGGA — P5 (2026-08-05)
  async function runSearch() {
    setSearching(true);
    setSearchRes(null);
    setSearchErr(null);
    try {
      const r = await api<NonNullable<typeof searchRes>>(
        `/shipping/search-address?keyword=${encodeURIComponent(searchKw.trim())}`,
      );
      setSearchRes(r);
    } catch (err) {
      setSearchErr(err instanceof Error ? err.message : t('searchFail'));
    } finally {
      setSearching(false);
    }
  }
  // <<< ANGGA

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
          {/* >>> ANGGA — addendum v2 M5: tab Memori Order (halaman sendiri) */}
          <Link
            href="/settings/order-memory"
            className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-[13px] font-medium text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Brain className="h-4 w-4" aria-hidden="true" />
            {t('tabOrderMemory')}
          </Link>
          {/* <<< ANGGA */}
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
                      value={data.discountMaxPerPcs}
                      onChange={(e) => patch('discountMaxPerPcs', e.target.value)} />
                  </Field>
                  <Field label={t('shippingDiscountPercent')} hint={t('shippingDiscountPercentHint')}>
                    <input type="number" min="0" max="100" className={fieldCls} disabled={!canEdit}
                      value={data.shippingDiscountPercentMax}
                      onChange={(e) => patch('shippingDiscountPercentMax', e.target.value)} />
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

            {/* >>> ANGGA — P5 (2026-08-05, ketok Bossfren): debug search keyword */}
            <Card className="mt-4 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('searchTitle')}</h2>
              <p className="mb-4 mt-1 text-xs text-gray-500 dark:text-gray-400">{t('searchIntro')}</p>
              <div className="space-y-4">
                <Field label={t('searchKwLabel')}>
                  <input className={fieldCls} value={searchKw} placeholder="mataram"
                    onChange={(e) => setSearchKw(e.target.value)} />
                </Field>
                <Button variant="outline" size="sm" onClick={runSearch} disabled={searching || !searchKw.trim()}>
                  <MagnifyingGlass className="h-4 w-4" aria-hidden="true" />
                  {searching ? t('searchRunning') : t('searchRun')}
                </Button>

                {searchErr && (
                  <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{searchErr}</p>
                )}
                {searchRes?.gagal && (
                  <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{t('searchFail')}</p>
                )}
                {searchRes && !searchRes.gagal && (
                  <div className="space-y-3 text-[13px]">
                    {searchRes.dicari.toLowerCase() !== searchRes.keyword.toLowerCase() && (
                      <p className="text-xs text-review-700 dark:text-review-300">
                        {t('searchAliasNote')} <span className="font-semibold">{searchRes.dicari}</span>
                      </p>
                    )}
                    {searchRes.total === 0 ? (
                      <p className="text-xs text-gray-500">{t('searchEmpty')}</p>
                    ) : (
                      <>
                        <div>
                          <p className="mb-1 font-medium text-gray-800 dark:text-gray-200">
                            {t('searchGroups')} · {searchRes.groups.length}
                          </p>
                          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                <tr>
                                  <th className="px-2 py-1.5">#</th>
                                  <th className="px-2 py-1.5">Kandidat</th>
                                  <th className="px-2 py-1.5">Provinsi</th>
                                  <th className="px-2 py-1.5">Level cocok</th>
                                  <th className="px-2 py-1.5 text-right">Baris</th>
                                </tr>
                              </thead>
                              <tbody>
                                {searchRes.groups.map((g, i) => (
                                  <tr key={`${g.province}-${g.cityLabel}`} className="border-t border-gray-100 dark:border-gray-800">
                                    <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                                    <td className="px-2 py-1.5">{g.cityLabel}</td>
                                    <td className="px-2 py-1.5">{g.province}</td>
                                    <td className="px-2 py-1.5">{g.level}</td>
                                    <td className="px-2 py-1.5 text-right tabular-nums">{g.rows}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div>
                          <p className="mb-1 font-medium text-gray-800 dark:text-gray-200">
                            {t('searchRowsT')} · {searchRes.total}
                          </p>
                          <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                            <table className="w-full text-left text-xs">
                              <thead className="sticky top-0 bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                <tr>
                                  <th className="px-2 py-1.5">Kelurahan</th>
                                  <th className="px-2 py-1.5">Kecamatan</th>
                                  <th className="px-2 py-1.5">Kota/Kab.</th>
                                  <th className="px-2 py-1.5">Provinsi</th>
                                </tr>
                              </thead>
                              <tbody>
                                {searchRes.rows.map((r, i) => (
                                  <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
                                    <td className="px-2 py-1.5">{r.kelurahan}</td>
                                    <td className="px-2 py-1.5">{r.kecamatan}</td>
                                    <td className="px-2 py-1.5">{r.kota}</td>
                                    <td className="px-2 py-1.5">{r.provinsi}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </Card>
            {/* <<< ANGGA */}
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

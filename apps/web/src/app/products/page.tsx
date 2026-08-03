'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube, UploadSimple, ArrowsClockwise, Trash, Plus, MagnifyingGlass, Package, Warning, Lock, LockOpen } from '@/components/ui/core-essential-icons';
import { api, uploadFile } from '@/lib/api';
import { useHasRole } from '@/lib/use-has-role'; // >>> ANGGA <<<
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useT, useLang, type Dict } from '@/lib/i18n';

const PRICE_LOCALE: Record<string, string> = { id: 'id-ID', en: 'en-US', es: 'es-ES', pt: 'pt-BR', ar: 'ar-SA', ms: 'ms-MY' };
/**
 * Format a product price.
 * - If the product has a stored currency code (e.g. "USD"), use Intl currency format.
 * - Otherwise fall back to the UI language locale (Indonesian-style Rp prefix for IDR).
 */
function formatPrice(price: number, lang: string, currency?: string | null): string {
  if (currency) {
    try {
      return price.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 0 });
    } catch { /* unknown ISO code — fall through */ }
  }
  const locale = PRICE_LOCALE[lang] ?? 'en-US';
  if (lang === 'id') return `Rp${price.toLocaleString(locale)}`;
  return price.toLocaleString(locale);
}

const dict: Dict = {
  title: { id: 'Produk & Stok', en: 'Products & Stock' },
  subtitle: { id: 'Sinkron stok dari spreadsheet, Google Sheet, atau database gudang. Bot menjawab ketersediaan dari data nyata ini.', en: 'Sync stock from spreadsheet, Google Sheet, or warehouse database. Bots answer availability from this live data.' },
  lastSync: { id: 'Disinkron {time}', en: 'Synced {time}' },
  totalProducts: { id: 'Total produk', en: 'Total products' },
  lowStock: { id: 'Stok menipis (≤{n})', en: 'Low stock (≤{n})' },
  outOfStock: { id: 'Habis', en: 'Out of stock' },
  loadError: { id: 'Gagal memuat', en: 'Failed to load' },
  csvSync: { id: '{n} produk disinkronkan dari CSV.', en: '{n} products synced from CSV.' },
  csvError: { id: 'Gagal upload CSV', en: 'Failed to upload CSV' },
  uploadCSV: { id: 'Upload CSV', en: 'Upload CSV' },
  csvColumns: { id: 'Kolom: sku, nama, harga, stok (alias ID/EN didukung)', en: 'Columns: sku, name, price, stock (ID/EN aliases supported)' },
  stockSources: { id: 'Sumber data stok', en: 'Stock sources' },
  syncable: { id: 'Sumber yang bisa di-sync ulang', en: 'Syncable sources' },
  addSource: { id: 'Tambah sumber', en: 'Add source' },
  sourceError: { id: 'Gagal menambah sumber', en: 'Failed to add source' },
  testPreview: { id: 'Tes & pratinjau', en: 'Test & preview' },
  testing: { id: 'Menguji…', en: 'Testing…' },
  previewError: { id: 'Gagal menguji koneksi sumber', en: 'Failed to test the source connection' },
  previewOk: { id: 'Koneksi OK — {total} baris terbaca. Pratinjau 10 pertama:', en: 'Connection OK — {total} rows parsed. Preview of first 10:' },
  detectedColumns: { id: 'Kolom terdeteksi', en: 'Detected columns' },
  syncSuccess: { id: '{n} produk disinkronkan dari Google Sheet.', en: '{n} products synced from Google Sheet.' },
  syncError: { id: 'Gagal sync', en: 'Sync failed' },
  search: { id: 'Cari produk / SKU / kategori', en: 'Search product / SKU / category' },
  noProducts: { id: 'Belum ada produk. Upload CSV, hubungkan Google Sheet, atau database gudang di atas untuk mulai.', en: 'No products. Upload CSV, connect a Google Sheet, or warehouse database above to get started.' },
  noProductsMatching: { id: 'Tidak ada produk cocok "{search}".', en: 'No products matching "{search}".' },
  colProduct: { id: 'Produk', en: 'Product' },
  colSku: { id: 'SKU', en: 'SKU' },
  colPrice: { id: 'Harga', en: 'Price' },
  colStock: { id: 'Stok', en: 'Stock' },
  // >>> ANGGA: berat satuan produk, dipakai modul ongkir Mengantar.
  colWeight: { id: 'Berat', en: 'Weight' },
  weightUnlock: { id: 'Buka kunci berat', en: 'Unlock weight' },
  weightLock: { id: 'Kunci berat', en: 'Lock weight' },
  weightLocked: {
    id: 'Terkunci — klik gembok dulu untuk mengubah.',
    en: 'Locked — click the padlock to edit.',
  },
  weightHint: {
    id: 'Berat satuan dalam gram, dipakai untuk hitung ongkir. Angka abu-abu = berat default toko yang otomatis dipakai selama kolom ini dibiarkan kosong.',
    en: 'Per-unit weight in grams, used to compute shipping. The greyed number is the store default that applies while this is left empty.',
  },
  weightSaved: { id: 'Berat produk tersimpan.', en: 'Product weight saved.' },
  // <<< ANGGA
  sourceNamePlaceholder: { id: 'Nama sumber (mis. Gudang Utama)', en: 'Source name (e.g. Main Warehouse)' },
  gsheetCsvOption: { id: 'Google Sheet (link CSV)', en: 'Google Sheet (CSV link)' },
  gsheetApiOption: { id: 'Google Sheet (API, privat)', en: 'Google Sheet (API, private)' },
  postgresOption: { id: 'Database (Postgres/Supabase)', en: 'Database (Postgres/Supabase)' },
  gsheetCsvUrl: { id: 'https://docs.google.com/.../pub?output=csv', en: 'https://docs.google.com/.../pub?output=csv' },
  postgresConn: { id: 'postgresql://user:password@host:5432/db (read-only)', en: 'postgresql://user:password@host:5432/db (read-only)' },
  postgresQuery: { id: 'SELECT sku, nama, stok, harga FROM produk  (hanya SELECT)', en: 'SELECT sku, name, stock, price FROM products  (SELECT only)' },
  postgresNote: { id: 'Kolom hasil query: sku, nama/name, stok/stock, harga/price, kategori. Kredensial disimpan & ditutup di tampilan.', en: 'Query result columns: sku, name, stock, price, category. Credentials saved & hidden in view.' },
  gsheetSheetId: { id: 'Spreadsheet ID (dari URL sheet)', en: 'Spreadsheet ID (from sheet URL)' },
  gsheetRange: { id: 'Range (mis. Sheet1!A:Z)', en: 'Range (e.g. Sheet1!A:Z)' },
  gsheetEmail: { id: 'Service account email (xxx@yyy.iam.gserviceaccount.com)', en: 'Service account email (xxx@yyy.iam.gserviceaccount.com)' },
  gsheetKey: { id: 'Private key service account (-----BEGIN PRIVATE KEY----- ...)', en: 'Private key service account (-----BEGIN PRIVATE KEY----- ...)' },
  gsheetApiNote: { id: 'Share sheet ke email service account (Viewer). Baris pertama = header (sku, nama, stok, harga…). Kunci disimpan & ditutup di tampilan.', en: 'Share sheet with service account email (Viewer). First row = headers (sku, name, stock, price…). Key saved & hidden in view.' },
  syncNow: { id: 'Sync sekarang', en: 'Sync now' },
  delete: { id: 'Hapus', en: 'Delete' },
  outOfStockBadge: { id: 'Habis', en: 'Out of stock' },
  lowStockTitle: { id: 'Stok menipis', en: 'Low stock' },
  cancel: { id: 'Batal', en: 'Cancel' },
  deleteSource: { id: 'Hapus sumber', en: 'Delete source' },
  timeJustNow: { id: 'baru saja', en: 'just now' },
  timeMinutes: { id: '{m} mnt lalu', en: '{m}m ago' },
  timeHours: { id: '{h} jam lalu', en: '{h}h ago' },
  timeDays: { id: '{d} hr lalu', en: '{d}d ago' },
  pricePrefix: { id: 'Rp', en: '' },
};

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  price: number | null;
  currency: string | null;
  stock: number;
  unit: string | null;
  status: string;
  lastSyncedAt: string | null;
  weightGrams: number | null; // >>> ANGGA <<<
}

interface Source {
  id: string;
  type: string;
  name: string;
  config: { url?: string };
  lastSyncedAt: string | null;
  lastResult: string | null;
}

type ProductCol = 'sku' | 'name' | 'category' | 'price' | 'stock' | 'unit' | 'description';
interface SourcePreview {
  totalParsed: number;
  detectedColumns: ProductCol[];
  sample: Array<Partial<Record<ProductCol, string | number>>>;
}

export default function ProductsPage() {
  const t = useT(dict);
  const { lang } = useLang();
  // >>> ANGGA: `hasRole()` membaca JWT dari localStorage SAAT RENDER — di server
  // selalu false, di browser bisa true. Dipakai langsung untuk memilih JENIS
  // elemen (input vs span di kolom berat), React gagal hydrate seluruh halaman.
  // `useHasRole` adalah helper resmi repo ini untuk itu: render pertama selalu
  // `allowed:false` di kedua sisi, peran sungguhan dibaca sesudah mount.
  const { allowed: canManage } = useHasRole('admin');
  const { allowed: canConfigure } = useHasRole('supervisor');
  // <<< ANGGA
  // Nilai berat yang sedang diketik admin, per produk. Input dibuat controlled
  // (bukan defaultValue) supaya angkanya ikut segar setelah daftar produk
  // di-refetch — defaultValue hanya berlaku saat node DOM pertama dibuat.
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});
  // Berat default toko (config modul ongkir) — ditampilkan sebagai placeholder
  // abu-abu supaya jelas angka apa yang berlaku selama kolom dikosongkan.
  // Diambil dari server, TIDAK ditulis di sini: angkanya milik config, dan
  // menyalinnya ke frontend berarti dua sumber kebenaran yang bisa berbeda.
  const [defaultWeight, setDefaultWeight] = useState<number | null>(null);
  // Tiap baris terkunci secara bawaan supaya berat tidak keubah tidak sengaja.
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const weightRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // <<< ANGGA
  const [products, setProducts] = useState<Product[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [srcType, setSrcType] = useState<'gsheet_csv' | 'gsheet_api' | 'postgres'>('gsheet_csv');
  const [srcName, setSrcName] = useState('');
  const [srcUrl, setSrcUrl] = useState('');
  const [srcConn, setSrcConn] = useState('');
  const [srcQuery, setSrcQuery] = useState('');
  const [srcSheetId, setSrcSheetId] = useState('');
  const [srcRange, setSrcRange] = useState('');
  const [srcEmail, setSrcEmail] = useState('');
  const [srcKey, setSrcKey] = useState('');
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(handle);
  }, [search]);

  function load() {
    setLoading(true);
    api<Product[]>(`/products${debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}` : ''}`)
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : t('loadError')))
      .finally(() => setLoading(false));
    loadAdminExtras();
  }
  useEffect(load, [debouncedSearch, t]);

  // >>> ANGGA: data khusus admin dipisah dari load().
  // `canManage` baru bernilai true SESUDAH mount (lihat useHasRole), jadi kalau
  // fetch ini tetap menempel di load() — yang deps-nya cuma [debouncedSearch, t]
  // — ia selamanya berjalan saat peran masih false dan tidak pernah dicoba lagi.
  // Menambahkan `canManage` ke deps load() juga bukan jawabannya: daftar produk
  // jadi ikut ditarik dua kali tiap halaman dibuka.
  function loadAdminExtras() {
    if (!canManage) return;
    api<Source[]>('/products/sources/list').then(setSources).catch(() => setSources([]));
    api<{ defaultWeightGrams: number }>('/shipping/status')
      .then((s) => setDefaultWeight(s.defaultWeightGrams))
      .catch(() => setDefaultWeight(null));
  }
  useEffect(loadAdminExtras, [canManage]);
  // <<< ANGGA

  // >>> ANGGA: simpan berat satuan produk (gram). Kosong = null, artinya
  // kembali memakai fallback berat default di config ongkir.
  async function saveWeight(id: string, raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 1)) return;
    const before = products.find((x) => x.id === id)?.weightGrams ?? null;
    if (before === value) return;
    // Optimistic: tabel langsung ikut berubah, dikembalikan kalau server tolak.
    setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, weightGrams: value } : x)));
    try {
      await api(`/products/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ weightGrams: value }),
      });
      // Buang draft supaya input kembali mengikuti nilai dari server.
      setWeightDraft((d) => { const next = { ...d }; delete next[id]; return next; });
      setNotice(t('weightSaved'));
    } catch (e) {
      setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, weightGrams: before } : x)));
      setError(e instanceof Error ? e.message : t('loadError'));
    }
  }
  // <<< ANGGA

  // >>> ANGGA: buka gembok -> fokus ke kolom. Tutup gembok -> simpan lalu kunci.
  function toggleWeightLock(id: string) {
    setUnlocked((u) => {
      const next = !u[id];
      if (next) setTimeout(() => weightRefs.current[id]?.focus(), 0);
      else void saveWeight(id, weightRefs.current[id]?.value ?? '');
      return { ...u, [id]: next };
    });
  }
  // <<< ANGGA

  const LOW_STOCK = 5;
  const stats = useMemo(() => {
    const out = products.filter((p) => p.stock <= 0).length;
    const low = products.filter((p) => p.stock > 0 && p.stock <= LOW_STOCK).length;
    const lastSync = products.reduce<string | null>(
      (acc, p) => (p.lastSyncedAt && (!acc || p.lastSyncedAt > acc) ? p.lastSyncedAt : acc),
      null,
    );
    return { total: products.length, out, low, lastSync };
  }, [products]);

  function relTime(iso: string | null): string {
    if (!iso) return '—';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.round(diff / 60000);
    if (m < 1) return t('timeJustNow');
    if (m < 60) return t('timeMinutes', { m: String(m) });
    const h = Math.round(m / 60);
    if (h < 24) return t('timeHours', { h: String(h) });
    return t('timeDays', { d: String(Math.round(h / 24)) });
  }

  async function uploadCsv(file: File) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await uploadFile<{ upserted: number; parsed: number }>('/products/sync/csv', form);
      setNotice(t('csvSync', { n: r.upserted }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('csvError'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // Build the source payload from the form, or null if required fields missing.
  function buildSourcePayload(): Record<string, string> | null {
    if (!srcName.trim()) return null;
    if (srcType === 'gsheet_csv') {
      if (!srcUrl.trim()) return null;
      return { type: 'gsheet_csv', name: srcName.trim(), url: srcUrl.trim() };
    }
    if (srcType === 'postgres') {
      if (!srcConn.trim() || !srcQuery.trim()) return null;
      return { type: 'postgres', name: srcName.trim(), connectionString: srcConn.trim(), query: srcQuery.trim() };
    }
    if (!srcSheetId.trim() || !srcEmail.trim() || !srcKey.trim()) return null;
    return { type: 'gsheet_api', name: srcName.trim(), spreadsheetId: srcSheetId.trim(), range: srcRange.trim() || 'A:Z', clientEmail: srcEmail.trim(), privateKey: srcKey };
  }

  async function previewSource() {
    const payload = buildSourcePayload();
    if (!payload) return;
    setPreviewing(true); setError(null); setPreview(null);
    try {
      setPreview(await api<SourcePreview>('/products/sources/preview', { method: 'POST', body: JSON.stringify(payload) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('previewError'));
    } finally { setPreviewing(false); }
  }

  async function addSource() {
    const payload = buildSourcePayload();
    if (!payload) return;
    setBusy(true); setError(null);
    try {
      await api('/products/sources', { method: 'POST', body: JSON.stringify(payload) });
      setSrcName(''); setSrcUrl(''); setSrcConn(''); setSrcQuery(''); setSrcSheetId(''); setSrcRange(''); setSrcEmail(''); setSrcKey('');
      setPreview(null);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sourceError'));
    } finally { setBusy(false); }
  }

  async function syncSource(id: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await api<{ upserted: number }>(`/products/sources/${id}/sync`, { method: 'POST' });
      setNotice(t('syncSuccess', { n: r.upserted }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('syncError'));
    } finally { setBusy(false); }
  }

  async function delSource(id: string) {
    try {
      await api(`/products/sources/${id}`, { method: 'DELETE' });
      setSources((p) => p.filter((s) => s.id !== id));
    } catch { /* ignore */ }
  }

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        {stats.total > 0 && (
          <span className="hidden text-[12px] text-gray-400 sm:inline" title={t('lastSync', { time: relTime(stats.lastSync) })}>
            {t('lastSync', { time: relTime(stats.lastSync) })}
          </span>
        )}
      </PageHeader>
      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-5">
        {/* Needs-attention summary — decision-first */}
        {stats.total > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Card className="p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{t('totalProducts')}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{stats.total}</p>
            </Card>
            <Card className={stats.low > 0 ? 'border-amber-200 bg-amber-50/60 p-3 dark:border-amber-700/40 dark:bg-amber-900/15' : 'p-3'}>
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400"><Warning className="h-3 w-3" aria-hidden="true" />{t('lowStock', { n: LOW_STOCK })}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{stats.low}</p>
            </Card>
            <Card className={stats.out > 0 ? 'border-danger-200 bg-danger-50/60 p-3 dark:border-danger-700/40 dark:bg-danger-900/15' : 'p-3'}>
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-danger-600 dark:text-danger-400"><Package className="h-3 w-3" aria-hidden="true" />{t('outOfStock')}</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{stats.out}</p>
            </Card>
          </div>
        )}
        {error && <Card className="mb-4 border-danger-200 bg-danger-50 p-3 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20"><button onClick={() => setError(null)} className="flex items-center justify-between w-full"><span>{error}</span><span className="ml-2">×</span></button></Card>}
        {notice && <Card className="mb-4 border-sentinel-200 bg-sentinel-50 p-3 text-[13px] text-sentinel-700 dark:border-sentinel-700/40 dark:bg-sentinel-900/20"><button onClick={() => setNotice(null)} className="flex items-center justify-between w-full"><span>{notice}</span><span className="ml-2">×</span></button></Card>}

        {canManage && (
          <Card className="mb-5 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('stockSources')}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCsv(f); }} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <UploadSimple className="h-4 w-4" aria-hidden="true" /> {t('uploadCSV')}
              </Button>
              <span className="text-[11px] text-gray-400">{t('csvColumns')}</span>
            </div>

            {canConfigure && (
              <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="mb-2 text-[12px] font-medium text-gray-600 dark:text-gray-300">{t('syncable')}</p>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select value={srcType} onChange={(e) => setSrcType(e.target.value as 'gsheet_csv' | 'gsheet_api' | 'postgres')} className="h-9 rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      <option value="gsheet_csv">{t('gsheetCsvOption')}</option>
                      <option value="gsheet_api">{t('gsheetApiOption')}</option>
                      <option value="postgres">{t('postgresOption')}</option>
                    </select>
                    <input value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder={t('sourceNamePlaceholder') || 'Nama sumber (mis. Gudang Utama)'} className="h-9 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                  </div>
                  {srcType === 'gsheet_csv' && (
                    <input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder={t('gsheetCsvUrl')} className="h-9 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                  )}
                  {srcType === 'postgres' && (
                    <>
                      <input value={srcConn} onChange={(e) => setSrcConn(e.target.value)} placeholder={t('postgresConn')} className="h-9 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <textarea value={srcQuery} onChange={(e) => setSrcQuery(e.target.value)} rows={2} placeholder={t('postgresQuery')} className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <p className="text-[11px] text-gray-400">{t('postgresNote')}</p>
                    </>
                  )}
                  {srcType === 'gsheet_api' && (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input value={srcSheetId} onChange={(e) => setSrcSheetId(e.target.value)} placeholder={t('gsheetSheetId')} className="h-9 flex-[2] rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                        <input value={srcRange} onChange={(e) => setSrcRange(e.target.value)} placeholder={t('gsheetRange')} className="h-9 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      </div>
                      <input value={srcEmail} onChange={(e) => setSrcEmail(e.target.value)} placeholder={t('gsheetEmail')} className="h-9 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <textarea value={srcKey} onChange={(e) => setSrcKey(e.target.value)} rows={2} placeholder={t('gsheetKey')} className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <p className="text-[11px] text-gray-400">{t('gsheetApiNote')}</p>
                    </>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={previewSource} disabled={previewing || busy || !srcName.trim()}>
                      <MagnifyingGlass className="h-4 w-4" aria-hidden="true" /> {previewing ? t('testing') : t('testPreview')}
                    </Button>
                    <Button size="sm" onClick={addSource} disabled={busy || !srcName.trim()}><Plus className="h-4 w-4" aria-hidden="true" /> {t('addSource')}</Button>
                  </div>
                  {preview && (
                    <div className="rounded-lg border border-channel-200 bg-channel-50 p-3 dark:border-channel-900/30 dark:bg-channel-900/20">
                      <p className="mb-1 text-[12px] font-semibold text-channel-700 dark:text-channel-300">
                        {t('previewOk', { total: preview.totalParsed })}
                      </p>
                      <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                        {t('detectedColumns')}: {preview.detectedColumns.join(', ') || '—'}
                      </p>
                      {preview.sample.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-left text-gray-400">
                                {preview.detectedColumns.map((c) => <th key={c} className="px-1.5 py-0.5 font-medium">{c}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {preview.sample.map((row, i) => (
                                <tr key={i} className="border-t border-channel-100 dark:border-channel-900/30">
                                  {preview.detectedColumns.map((c) => <td key={c} className="px-1.5 py-0.5 text-gray-700 dark:text-gray-300">{String(row[c] ?? '')}</td>)}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {sources.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {sources.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 rounded bg-gray-50 px-2.5 py-1.5 text-[12px] dark:bg-gray-800">
                        <span className="min-w-0 flex-1 truncate"><strong>{s.name}</strong> {s.lastResult && <span className="text-gray-400">· {s.lastResult}</span>}</span>
                        <button type="button" onClick={() => syncSource(s.id)} disabled={busy} aria-label={t('syncNow')} title={t('syncNow')} className="text-sentinel-600 hover:text-sentinel-700"><ArrowsClockwise className="h-4 w-4" aria-hidden="true" /></button>
                        <button type="button" onClick={() => setDeletingSourceId(s.id)} aria-label={t('delete')} title={t('delete')} className="text-gray-400 hover:text-danger-600"><Trash className="h-4 w-4" aria-hidden="true" /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}

        <div className="relative mb-3">
          <MagnifyingGlass className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </div>

        {loading && products.length === 0 ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="h-10 rounded animate-shimmer" />)}</div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center text-sm text-gray-400">
            <Cube className="mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
            {debouncedSearch ? t('noProductsMatching', { search: debouncedSearch }) : t('noProducts')}
          </div>
        ) : (
          <>
            {/* Desktop / tablet: data table */}
            <div className="scrollbar-thin hidden overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800 sm:block">
              <table className="w-full min-w-[28rem] text-[13px]">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  <tr><th scope="col" className="px-3 py-2">{t('colProduct')}</th><th scope="col" className="px-3 py-2">{t('colSku')}</th><th scope="col" className="px-3 py-2 text-right">{t('colPrice')}</th><th scope="col" className="px-3 py-2 text-right">{t('colStock')}</th><th scope="col" className="px-3 py-2 text-right" title={t('weightHint')}>{t('colWeight')}</th></tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="px-3 py-2"><span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>{p.category && <span className="ml-1 text-gray-400">· {p.category}</span>}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-500">{p.sku}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">{p.price != null ? formatPrice(p.price, lang, p.currency) : '-'}</td>
                      <td className="px-3 py-2 text-right">
                        {p.stock <= 0 ? (
                          <Badge tone="danger">{t('outOfStockBadge')}</Badge>
                        ) : p.stock <= LOW_STOCK ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium tabular-nums text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" title={t('lowStockTitle')}>
                            <Warning className="h-3 w-3" aria-hidden="true" />{p.stock}{p.unit ? ` ${p.unit}` : ''}
                          </span>
                        ) : (
                          <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{p.stock}{p.unit ? ` ${p.unit}` : ''}</span>
                        )}
                      </td>
                      {/* >>> ANGGA: berat satuan (gram) untuk modul ongkir. */}
                      <td className="px-3 py-2 text-right">
                        {canManage ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              disabled={!unlocked[p.id]}
                              ref={(el) => { weightRefs.current[p.id] = el; }}
                              aria-label={`${t('colWeight')} ${p.name}`}
                              title={unlocked[p.id] ? t('weightHint') : t('weightLocked')}
                              value={weightDraft[p.id] ?? (p.weightGrams != null ? String(p.weightGrams) : '')}
                              onChange={(e) => setWeightDraft((d) => ({ ...d, [p.id]: e.target.value.replace(/\D/g, '') }))}
                              placeholder={defaultWeight != null ? String(defaultWeight) : ''}
                              onBlur={(e) => { void saveWeight(p.id, e.target.value); setUnlocked((u) => ({ ...u, [p.id]: false })); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                              className="w-14 rounded border border-gray-200 bg-white px-1.5 py-0.5 text-right text-[13px] tabular-nums text-gray-900 placeholder:text-gray-400 disabled:cursor-default disabled:border-transparent disabled:bg-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-transparent"
                            />
                            <span className="text-[11px] text-gray-400">g</span>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => toggleWeightLock(p.id)}
                              aria-label={`${unlocked[p.id] ? t('weightLock') : t('weightUnlock')} ${p.name}`}
                              title={unlocked[p.id] ? t('weightLock') : t('weightUnlock')}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                            >
                              {unlocked[p.id]
                                ? <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                                : <Lock className="h-3.5 w-3.5" aria-hidden="true" />}
                            </button>
                          </span>
                        ) : (
                          <span className="tabular-nums text-gray-500">{p.weightGrams != null ? `${p.weightGrams} g` : '\u2014'}</span>
                        )}
                      </td>
                      {/* <<< ANGGA */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list */}
            <div className="space-y-2 sm:hidden">
              {products.map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{p.name}</div>
                      {p.category && <div className="text-xs text-gray-400">{p.category}</div>}
                    </div>
                    {p.stock <= 0 ? (
                      <Badge tone="danger">{t('outOfStockBadge')}</Badge>
                    ) : p.stock <= LOW_STOCK ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium tabular-nums text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" title={t('lowStockTitle')}>
                        <Warning className="h-3 w-3" aria-hidden="true" />{p.stock}{p.unit ? ` ${p.unit}` : ''}
                      </span>
                    ) : (
                      <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-gray-100">{p.stock}{p.unit ? ` ${p.unit}` : ''}</span>
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span className="tabular-nums">{p.sku}</span>
                    {/* >>> ANGGA */}
                    <span className="tabular-nums" title={t('weightHint')}>{`${t('colWeight')}: ${p.weightGrams ?? defaultWeight ?? '\u2014'} g`}</span>
                    {/* <<< ANGGA */}
                    <span className="tabular-nums text-gray-700 dark:text-gray-200">{p.price != null ? formatPrice(p.price, lang, p.currency) : '-'}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Modal open={!!deletingSourceId} onClose={() => setDeletingSourceId(null)} title={t('deleteSource')}>
        {deletingSourceId && sources.find(s => s.id === deletingSourceId) && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('delete')} "{sources.find(s => s.id === deletingSourceId)?.name}"?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingSourceId(null)}>{t('cancel')}</Button>
              <Button variant="danger" size="sm" onClick={() => { delSource(deletingSourceId); setDeletingSourceId(null); }}>
                {t('delete')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

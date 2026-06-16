'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Cube, UploadSimple, ArrowsClockwise, Trash, Plus, MagnifyingGlass, Package, Warning } from '@phosphor-icons/react';
import { api, uploadFile, hasRole } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface Product {
  id: string;
  sku: string;
  name: string;
  category: string | null;
  price: number | null;
  stock: number;
  unit: string | null;
  status: string;
  lastSyncedAt: string | null;
}

interface Source {
  id: string;
  type: string;
  name: string;
  config: { url?: string };
  lastSyncedAt: string | null;
  lastResult: string | null;
}

export default function ProductsPage() {
  const canManage = hasRole('admin');
  const canConfigure = hasRole('supervisor');
  const [products, setProducts] = useState<Product[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
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

  function load() {
    setLoading(true);
    api<Product[]>(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`)
      .then(setProducts)
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat'))
      .finally(() => setLoading(false));
    if (canManage) api<Source[]>('/products/sources/list').then(setSources).catch(() => setSources([]));
  }
  useEffect(load, [search]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (m < 1) return 'baru saja';
    if (m < 60) return `${m} mnt lalu`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} jam lalu`;
    return `${Math.round(h / 24)} hr lalu`;
  }

  async function uploadCsv(file: File) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await uploadFile<{ upserted: number; parsed: number }>('/products/sync/csv', form);
      setNotice(`${r.upserted} produk disinkronkan dari CSV.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal upload CSV');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function addSource() {
    if (!srcName.trim()) return;
    let payload: Record<string, string>;
    if (srcType === 'gsheet_csv') {
      if (!srcUrl.trim()) return;
      payload = { type: 'gsheet_csv', name: srcName.trim(), url: srcUrl.trim() };
    } else if (srcType === 'postgres') {
      if (!srcConn.trim() || !srcQuery.trim()) return;
      payload = { type: 'postgres', name: srcName.trim(), connectionString: srcConn.trim(), query: srcQuery.trim() };
    } else {
      if (!srcSheetId.trim() || !srcEmail.trim() || !srcKey.trim()) return;
      payload = { type: 'gsheet_api', name: srcName.trim(), spreadsheetId: srcSheetId.trim(), range: srcRange.trim() || 'A:Z', clientEmail: srcEmail.trim(), privateKey: srcKey };
    }
    setBusy(true); setError(null);
    try {
      await api('/products/sources', { method: 'POST', body: JSON.stringify(payload) });
      setSrcName(''); setSrcUrl(''); setSrcConn(''); setSrcQuery(''); setSrcSheetId(''); setSrcRange(''); setSrcEmail(''); setSrcKey('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah sumber');
    } finally { setBusy(false); }
  }

  async function syncSource(id: string) {
    setBusy(true); setError(null); setNotice(null);
    try {
      const r = await api<{ upserted: number }>(`/products/sources/${id}/sync`, { method: 'POST' });
      setNotice(`${r.upserted} produk disinkronkan dari Google Sheet.`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal sync');
    } finally { setBusy(false); }
  }

  async function delSource(id: string) {
    try { await api(`/products/sources/${id}`, { method: 'DELETE' }); setSources((p) => p.filter((s) => s.id !== id)); } catch { /* ignore */ }
  }

  return (
    <AppLayout>
      <PageHeader title="Produk & Stok" subtitle="Sinkron stok dari spreadsheet, Google Sheet, atau database gudang. Bot menjawab ketersediaan dari data nyata ini.">
        {stats.total > 0 && (
          <span className="hidden text-[12px] text-gray-400 sm:inline" title="Stok terakhir disinkronkan">
            Disinkron {relTime(stats.lastSync)}
          </span>
        )}
      </PageHeader>
      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-5">
        {/* Needs-attention summary — decision-first */}
        {stats.total > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Card className="p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Total produk</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{stats.total}</p>
            </Card>
            <Card className={stats.low > 0 ? 'border-amber-200 bg-amber-50/60 p-3 dark:border-amber-700/40 dark:bg-amber-900/15' : 'p-3'}>
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400"><Warning className="h-3 w-3" aria-hidden="true" />Stok menipis (≤{LOW_STOCK})</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{stats.low}</p>
            </Card>
            <Card className={stats.out > 0 ? 'border-danger-200 bg-danger-50/60 p-3 dark:border-danger-700/40 dark:bg-danger-900/15' : 'p-3'}>
              <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-danger-600 dark:text-danger-400"><Package className="h-3 w-3" aria-hidden="true" />Habis</p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">{stats.out}</p>
            </Card>
          </div>
        )}
        {error && <Card className="mb-4 border-danger-200 bg-danger-50 p-3 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20">{error}</Card>}
        {notice && <Card className="mb-4 border-hermes-200 bg-hermes-50 p-3 text-[13px] text-hermes-700 dark:border-hermes-700/40 dark:bg-hermes-900/20">{notice}</Card>}

        {canManage && (
          <Card className="mb-5 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Sumber data stok</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCsv(f); }} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <UploadSimple className="h-4 w-4" aria-hidden="true" /> Upload CSV
              </Button>
              <span className="text-[11px] text-gray-400">Kolom: sku, nama, harga, stok (alias ID/EN didukung)</span>
            </div>

            {canConfigure && (
              <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="mb-2 text-[12px] font-medium text-gray-600 dark:text-gray-300">Sumber yang bisa di-sync ulang</p>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <select value={srcType} onChange={(e) => setSrcType(e.target.value as 'gsheet_csv' | 'gsheet_api' | 'postgres')} className="h-9 rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      <option value="gsheet_csv">Google Sheet (link CSV)</option>
                      <option value="gsheet_api">Google Sheet (API, privat)</option>
                      <option value="postgres">Database (Postgres/Supabase)</option>
                    </select>
                    <input value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder="Nama sumber (mis. Gudang Utama)" className="h-9 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                  </div>
                  {srcType === 'gsheet_csv' && (
                    <input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder="https://docs.google.com/.../pub?output=csv" className="h-9 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                  )}
                  {srcType === 'postgres' && (
                    <>
                      <input value={srcConn} onChange={(e) => setSrcConn(e.target.value)} placeholder="postgresql://user:password@host:5432/db (read-only)" className="h-9 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <textarea value={srcQuery} onChange={(e) => setSrcQuery(e.target.value)} rows={2} placeholder="SELECT sku, nama, stok, harga FROM produk  (hanya SELECT)" className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <p className="text-[11px] text-gray-400">Kolom hasil query: sku, nama/name, stok/stock, harga/price, kategori. Kredensial disimpan & ditutup di tampilan.</p>
                    </>
                  )}
                  {srcType === 'gsheet_api' && (
                    <>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input value={srcSheetId} onChange={(e) => setSrcSheetId(e.target.value)} placeholder="Spreadsheet ID (dari URL sheet)" className="h-9 flex-[2] rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                        <input value={srcRange} onChange={(e) => setSrcRange(e.target.value)} placeholder="Range (mis. Sheet1!A:Z)" className="h-9 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      </div>
                      <input value={srcEmail} onChange={(e) => setSrcEmail(e.target.value)} placeholder="Service account email (xxx@yyy.iam.gserviceaccount.com)" className="h-9 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <textarea value={srcKey} onChange={(e) => setSrcKey(e.target.value)} rows={2} placeholder="Private key service account (-----BEGIN PRIVATE KEY----- ...)" className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <p className="text-[11px] text-gray-400">Share sheet ke email service account (Viewer). Baris pertama = header (sku, nama, stok, harga…). Kunci disimpan & ditutup di tampilan.</p>
                    </>
                  )}
                  <div><Button size="sm" onClick={addSource} disabled={busy || !srcName.trim()}><Plus className="h-4 w-4" aria-hidden="true" /> Tambah sumber</Button></div>
                </div>
                {sources.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {sources.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 rounded bg-gray-50 px-2.5 py-1.5 text-[12px] dark:bg-gray-800">
                        <span className="min-w-0 flex-1 truncate"><strong>{s.name}</strong> {s.lastResult && <span className="text-gray-400">· {s.lastResult}</span>}</span>
                        <button type="button" onClick={() => syncSource(s.id)} disabled={busy} title="Sync sekarang" className="text-hermes-600 hover:text-hermes-700"><ArrowsClockwise className="h-4 w-4" /></button>
                        <button type="button" onClick={() => delSource(s.id)} title="Hapus" className="text-gray-400 hover:text-danger-600"><Trash className="h-4 w-4" /></button>
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk / SKU / kategori" className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </div>

        {loading && products.length === 0 ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((n) => <div key={n} className="h-10 rounded animate-shimmer" />)}</div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center text-sm text-gray-400">
            <Cube className="mb-2 h-8 w-8 text-gray-300" aria-hidden="true" />
            {search ? `Tidak ada produk cocok "${search}".` : 'Belum ada produk. Upload CSV, hubungkan Google Sheet, atau database gudang di atas untuk mulai.'}
          </div>
        ) : (
          <div className="scrollbar-thin overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full min-w-[28rem] text-[13px]">
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr><th className="px-3 py-2">Produk</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">Harga</th><th className="px-3 py-2 text-right">Stok</th></tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="px-3 py-2"><span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span>{p.category && <span className="ml-1 text-gray-400">· {p.category}</span>}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-500">{p.sku}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700 dark:text-gray-200">{p.price != null ? `Rp${p.price.toLocaleString('id-ID')}` : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {p.stock <= 0 ? (
                        <Badge tone="danger">Habis</Badge>
                      ) : p.stock <= LOW_STOCK ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium tabular-nums text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" title="Stok menipis">
                          <Warning className="h-3 w-3" aria-hidden="true" />{p.stock}{p.unit ? ` ${p.unit}` : ''}
                        </span>
                      ) : (
                        <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{p.stock}{p.unit ? ` ${p.unit}` : ''}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { Boxes, Upload, RefreshCw, Trash2, Plus, Search } from 'lucide-react';
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [srcName, setSrcName] = useState('');
  const [srcUrl, setSrcUrl] = useState('');

  function load() {
    api<Product[]>(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`).then(setProducts).catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat'));
    if (canManage) api<Source[]>('/products/sources/list').then(setSources).catch(() => setSources([]));
  }
  useEffect(load, [search]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!srcName.trim() || !srcUrl.trim()) return;
    setBusy(true); setError(null);
    try {
      await api('/products/sources', { method: 'POST', body: JSON.stringify({ type: 'gsheet_csv', name: srcName.trim(), url: srcUrl.trim() }) });
      setSrcName(''); setSrcUrl('');
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
      <PageHeader title="Produk & Stok" subtitle="Sinkron stok dari spreadsheet (upload CSV atau Google Sheet). Bot menjawab ketersediaan dari data nyata ini." />
      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-5">
        {error && <Card className="mb-4 border-danger-200 bg-danger-50 p-3 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20">{error}</Card>}
        {notice && <Card className="mb-4 border-hermes-200 bg-hermes-50 p-3 text-[13px] text-hermes-700 dark:border-hermes-700/40 dark:bg-hermes-900/20">{notice}</Card>}

        {canManage && (
          <Card className="mb-5 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Sumber data stok</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCsv(f); }} />
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Upload CSV
              </Button>
              <span className="text-[11px] text-gray-400">Kolom: sku, nama, harga, stok (alias ID/EN didukung)</span>
            </div>

            {canConfigure && (
              <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
                <p className="mb-2 text-[12px] font-medium text-gray-600 dark:text-gray-300">Google Sheet (publish-to-web CSV) — bisa di-sync ulang kapan saja</p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input value={srcName} onChange={(e) => setSrcName(e.target.value)} placeholder="Nama sumber (mis. Gudang Utama)" className="h-9 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                  <input value={srcUrl} onChange={(e) => setSrcUrl(e.target.value)} placeholder="https://docs.google.com/.../pub?output=csv" className="h-9 flex-[2] rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                  <Button size="sm" onClick={addSource} disabled={busy || !srcName.trim() || !srcUrl.trim()}><Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tambah</Button>
                </div>
                {sources.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {sources.map((s) => (
                      <li key={s.id} className="flex items-center gap-2 rounded bg-gray-50 px-2.5 py-1.5 text-[12px] dark:bg-gray-800">
                        <span className="min-w-0 flex-1 truncate"><strong>{s.name}</strong> {s.lastResult && <span className="text-gray-400">· {s.lastResult}</span>}</span>
                        <button type="button" onClick={() => syncSource(s.id)} disabled={busy} title="Sync sekarang" className="text-hermes-600 hover:text-hermes-700"><RefreshCw className="h-4 w-4" strokeWidth={1.75} /></button>
                        <button type="button" onClick={() => delSource(s.id)} title="Hapus" className="text-gray-400 hover:text-danger-600"><Trash2 className="h-4 w-4" strokeWidth={1.75} /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>
        )}

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk / SKU / kategori" className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center text-sm text-gray-400">
            <Boxes className="mb-2 h-8 w-8 text-gray-300" strokeWidth={1.5} aria-hidden="true" />
            Belum ada produk. Upload CSV atau hubungkan Google Sheet di atas.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full text-[13px]">
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
                      {p.stock > 0 ? (
                        <span className="tabular-nums font-medium text-gray-900 dark:text-gray-100">{p.stock}{p.unit ? ` ${p.unit}` : ''}</span>
                      ) : (
                        <Badge tone="danger">HABIS</Badge>
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

'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Video, Upload, Trash2, Pencil, Link as LinkIcon } from 'lucide-react';
import { api, uploadFile, resolveMediaUrl, hasRole } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';

type Purpose = 'brochure' | 'product' | 'testimonial';

interface Asset {
  id: string;
  kind: 'image' | 'video' | 'document';
  purpose: Purpose;
  title: string;
  caption: string | null;
  mediaUrl: string;
  marketplaceUrl: string | null;
  tags: string[];
  triggerKeywords: string[];
  status: string;
}

const purposeMeta: Record<Purpose, { label: string; tone: 'hermes' | 'channel' | 'review' }> = {
  brochure: { label: 'Brosur / Dokumen', tone: 'hermes' },
  product: { label: 'Produk', tone: 'channel' },
  testimonial: { label: 'Testimoni', tone: 'review' },
};

const kindIcon = { image: ImageIcon, video: Video, document: FileText };

export default function AssetsPage() {
  const canManage = hasRole('admin');
  const canDelete = hasRole('supervisor');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [filter, setFilter] = useState<Purpose | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // upload form
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('brochure');
  const [caption, setCaption] = useState('');
  const [marketplaceUrl, setMarketplaceUrl] = useState('');
  const [triggerKeywords, setTriggerKeywords] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // edit modal
  const [editing, setEditing] = useState<Asset | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  function load() {
    setLoading(true);
    const q = filter === 'all' ? '' : `?purpose=${filter}`;
    api<Asset[]>(`/assets${q}`)
      .then(setAssets)
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat aset'))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filter]);

  async function submit() {
    if (!file || !title.trim()) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('title', title.trim());
      form.append('purpose', purpose);
      if (caption.trim()) form.append('caption', caption.trim());
      if (purpose === 'product' && marketplaceUrl.trim()) form.append('marketplaceUrl', marketplaceUrl.trim());
      triggerKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
        .forEach((k) => form.append('triggerKeywords[]', k));
      await uploadFile('/assets/upload', form);
      setNotice('Aset diunggah.');
      setFile(null); setTitle(''); setCaption(''); setMarketplaceUrl(''); setTriggerKeywords('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengunggah');
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    try {
      await api(`/assets/${id}`, { method: 'DELETE' });
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus');
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSavingEdit(true);
    setError(null);
    try {
      const body = {
        title: editing.title,
        purpose: editing.purpose,
        caption: editing.caption ?? '',
        marketplaceUrl: editing.marketplaceUrl ?? '',
        triggerKeywords: editing.triggerKeywords,
        status: editing.status,
      };
      const updated = await api<Asset>(`/assets/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan');
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title="Media Library" subtitle="Brosur, produk (foto + link), dan testimoni yang bisa dikirim bot/admin ke pelanggan." />
      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-5">
        {error && <Card className="mb-4 border-danger-200 bg-danger-50 p-3 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20">{error}</Card>}
        {notice && <Card className="mb-4 border-hermes-200 bg-hermes-50 p-3 text-[13px] text-hermes-700 dark:border-hermes-700/40 dark:bg-hermes-900/20">{notice}</Card>}

        {canManage && (
          <Card className="mb-5 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Unggah aset baru</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">File (gambar / video / dokumen)</span>
                <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-hermes-600 file:px-3 file:py-1.5 file:text-white" />
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Judul</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="mis. Brosur Pringland 2026" className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Tujuan</span>
                <select value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                  <option value="brochure">Brosur / Dokumen</option>
                  <option value="product">Produk</option>
                  <option value="testimonial">Testimoni</option>
                </select>
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Caption (opsional)</span>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Teks yang menyertai media" className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
              {purpose === 'product' && (
                <label className="block text-[13px] sm:col-span-2">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">Link marketplace (Shopee/Tokopedia)</span>
                  <input value={marketplaceUrl} onChange={(e) => setMarketplaceUrl(e.target.value)} placeholder="https://shopee.co.id/..." className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </label>
              )}
              <label className="block text-[13px] sm:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Kata pemicu (pisahkan koma) — bot akan menyarankan aset ini saat pelanggan menyebutnya</span>
                <input value={triggerKeywords} onChange={(e) => setTriggerKeywords(e.target.value)} placeholder="brosur, katalog, harga, pricelist" className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
            </div>
            <div className="mt-3">
              <Button onClick={submit} disabled={uploading || !file || !title.trim()}>
                <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {uploading ? 'Mengunggah…' : 'Unggah aset'}
              </Button>
            </div>
          </Card>
        )}

        <div className="mb-3 flex gap-1">
          {(['all', 'brochure', 'product', 'testimonial'] as const).map((p) => (
            <button key={p} onClick={() => setFilter(p)} className={cn('rounded px-2.5 py-1 text-xs font-medium', filter === p ? 'bg-hermes-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300')}>
              {p === 'all' ? 'Semua' : purposeMeta[p].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="h-16 rounded animate-shimmer" />)}</div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Belum ada aset. Unggah brosur, foto produk, atau testimoni.</div>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {assets.map((a) => {
              const Icon = kindIcon[a.kind];
              const meta = purposeMeta[a.purpose];
              const src = resolveMediaUrl(a.mediaUrl);
              return (
                <li key={a.id}>
                  <Card className="flex gap-3 p-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-gray-100 dark:bg-gray-800">
                      {a.kind === 'image' && src ? (
                        <img src={src} alt={a.title} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-gray-400"><Icon className="h-6 w-6" strokeWidth={1.5} /></span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        <span className="text-[11px] text-gray-400">{a.kind}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{a.title}</p>
                      {a.caption && <p className="truncate text-xs text-gray-500 dark:text-gray-400">{a.caption}</p>}
                      {a.marketplaceUrl && (
                        <a href={a.marketplaceUrl} target="_blank" rel="noreferrer" className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-channel-600 hover:underline">
                          <LinkIcon className="h-3 w-3" /> {a.marketplaceUrl}
                        </a>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {a.status === 'draft' && <Badge tone="neutral" className="text-[10px]">draft</Badge>}
                        {a.triggerKeywords.map((k) => (
                          <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{k}</span>
                        ))}
                      </div>
                    </div>
                    {canManage && (
                      <button type="button" onClick={() => setEditing(a)} title="Edit" className="shrink-0 self-start text-gray-400 hover:text-hermes-600">
                        <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => remove(a.id)} title="Hapus" className="shrink-0 self-start text-gray-400 hover:text-danger-600">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit aset">
        {editing && (
          <div className="space-y-3 text-[13px]">
            <label className="block">
              <span className="mb-1 block text-gray-600 dark:text-gray-300">Judul</span>
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Tujuan</span>
                <select value={editing.purpose} onChange={(e) => setEditing({ ...editing, purpose: e.target.value as Purpose })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                  <option value="brochure">Brosur / Dokumen</option>
                  <option value="product">Produk</option>
                  <option value="testimonial">Testimoni</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Status</span>
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                  <option value="active">Aktif</option>
                  <option value="draft">Draft</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-gray-600 dark:text-gray-300">Caption</span>
              <input value={editing.caption ?? ''} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            {editing.purpose === 'product' && (
              <label className="block">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">Link marketplace</span>
                <input value={editing.marketplaceUrl ?? ''} onChange={(e) => setEditing({ ...editing, marketplaceUrl: e.target.value })} placeholder="https://shopee.co.id/..." className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-gray-600 dark:text-gray-300">Kata pemicu (pisahkan koma)</span>
              <input value={editing.triggerKeywords.join(', ')} onChange={(e) => setEditing({ ...editing, triggerKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} placeholder="brosur, katalog, harga" className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Batal</Button>
              <Button size="sm" onClick={saveEdit} disabled={savingEdit || !editing.title.trim()}>{savingEdit ? 'Menyimpan…' : 'Simpan'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

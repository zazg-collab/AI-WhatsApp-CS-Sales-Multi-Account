'use client';

import { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, Video, UploadSimple, Trash, PencilSimple, Link as LinkIcon } from '@phosphor-icons/react';
import { api, uploadFile, resolveMediaUrl, hasRole } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/cn';
import { useT, type Dict } from '@/lib/i18n';

type Purpose = 'brochure' | 'product' | 'testimonial';

const dict: Dict = {
  title: { id: 'Media Library', en: 'Media Library' },
  subtitle: { id: 'Brosur, produk (foto + link), dan testimoni yang bisa dikirim bot/admin ke pelanggan.', en: 'Brochures, products (photos + links), and testimonials that bots/admins can send to customers.' },
  upload: { id: 'Unggah aset', en: 'Upload asset' },
  uploading: { id: 'Mengunggah…', en: 'Uploading…' },
  uploadTitle: { id: 'Unggah aset baru', en: 'Upload new asset' },
  loadError: { id: 'Gagal memuat aset', en: 'Failed to load assets' },
  uploadSuccess: { id: 'Aset diunggah.', en: 'Asset uploaded.' },
  uploadError: { id: 'Gagal mengunggah', en: 'Failed to upload' },
  deleteError: { id: 'Gagal menghapus', en: 'Failed to delete' },
  saveError: { id: 'Gagal menyimpan', en: 'Failed to save' },
  fileLabel: { id: 'File (gambar / video / dokumen)', en: 'File (image / video / document)' },
  titleLabel: { id: 'Judul', en: 'Title' },
  titlePlaceholder: { id: 'mis. Brosur Pringland 2026', en: 'e.g. Pringland Brochure 2026' },
  purposeLabel: { id: 'Tujuan', en: 'Purpose' },
  purposeBrochure: { id: 'Brosur / Dokumen', en: 'Brochure / Document' },
  purposeProduct: { id: 'Produk', en: 'Product' },
  purposeTestimonial: { id: 'Testimoni', en: 'Testimonial' },
  captionLabel: { id: 'Caption (opsional)', en: 'Caption (optional)' },
  captionPlaceholder: { id: 'Teks yang menyertai media', en: 'Text to accompany media' },
  marketplaceLabel: { id: 'Link marketplace (Shopee/Tokopedia)', en: 'Marketplace link (Shopee/Tokopedia)' },
  keywordsLabel: { id: 'Kata pemicu (pisahkan koma) — bot akan menyarankan aset ini saat pelanggan menyebutnya', en: 'Trigger keywords (comma-separated) — bot will suggest this asset when customers mention them' },
  keywordsPlaceholder: { id: 'brosur, katalog, harga, pricelist', en: 'brochure, catalog, price, pricelist' },
  autoSendLabel: { id: 'Boleh dikirim <strong>otomatis</strong> oleh bot saat AI ON & kata pemicu cocok <span className="text-gray-400">(perlu diaktifkan server: ASSET_AUTOSEND_ENABLED)</span>', en: 'Can be sent <strong>automatically</strong> by bot when AI ON & trigger keywords match <span className="text-gray-400">(server setting: ASSET_AUTOSEND_ENABLED)</span>' },
  all: { id: 'Semua', en: 'All' },
  noAssets: { id: 'Belum ada aset. Unggah brosur, foto produk, atau testimoni.', en: 'No assets. Upload brochures, product photos, or testimonials.' },
  edit: { id: 'Edit', en: 'Edit' },
  delete: { id: 'Hapus', en: 'Delete' },
  editModalTitle: { id: 'Edit aset', en: 'Edit asset' },
  statusLabel: { id: 'Status', en: 'Status' },
  statusActive: { id: 'Aktif', en: 'Active' },
  statusDraft: { id: 'Draft', en: 'Draft' },
  autoSendEditLabel: { id: 'Boleh dikirim <strong>otomatis</strong> oleh bot (AI ON + kata pemicu cocok)', en: 'Can be sent <strong>automatically</strong> by bot (AI ON + trigger keywords match)' },
  cancel: { id: 'Batal', en: 'Cancel' },
  save: { id: 'Simpan', en: 'Save' },
  saving: { id: 'Menyimpan…', en: 'Saving…' },
};

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
  autoSend: boolean;
}

const getPurposeMeta = (t: ReturnType<typeof useT>) => ({
  brochure: { label: t('purposeBrochure'), tone: 'hermes' as const },
  product: { label: t('purposeProduct'), tone: 'channel' as const },
  testimonial: { label: t('purposeTestimonial'), tone: 'review' as const },
});

const kindIcon = { image: ImageIcon, video: Video, document: FileText };

export default function AssetsPage() {
  const t = useT(dict);
  const canManage = hasRole('admin');
  const canDelete = hasRole('supervisor');
  const purposeMeta = getPurposeMeta(t);
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
  const [autoSend, setAutoSend] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // edit modal
  const [editing, setEditing] = useState<Asset | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    const q = filter === 'all' ? '' : `?purpose=${filter}`;
    api<Asset[]>(`/assets${q}`)
      .then(setAssets)
      .catch((e) => setError(e instanceof Error ? e.message : t('loadError')))
      .finally(() => setLoading(false));
  }
  useEffect(load, [filter, t]);

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
      if (autoSend) form.append('autoSend', 'true');
      await uploadFile('/assets/upload', form);
      setNotice(t('uploadSuccess'));
      setFile(null); setTitle(''); setCaption(''); setMarketplaceUrl(''); setTriggerKeywords(''); setAutoSend(false);
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('uploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      await api(`/assets/${id}`, { method: 'DELETE' });
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('deleteError'));
    } finally {
      setDeletingId(null);
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
        autoSend: editing.autoSend,
      };
      const updated = await api<Asset>(`/assets/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setAssets((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveError'));
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 sm:p-5">
        {error && <Card className="mb-4 border-danger-200 bg-danger-50 p-3 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20">{error}</Card>}
        {notice && <Card className="mb-4 border-hermes-200 bg-hermes-50 p-3 text-[13px] text-hermes-700 dark:border-hermes-700/40 dark:bg-hermes-900/20">{notice}</Card>}

        {canManage && (
          <Card className="mb-5 p-4">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('uploadTitle')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('fileLabel')}</span>
                <input ref={fileRef} type="file" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-xs text-gray-600 file:mr-2 file:rounded file:border-0 file:bg-hermes-600 file:px-3 file:py-1.5 file:text-white" />
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('titleLabel')}</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePlaceholder')} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('purposeLabel')}</span>
                <select value={purpose} onChange={(e) => setPurpose(e.target.value as Purpose)} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                  <option value="brochure">{t('purposeBrochure')}</option>
                  <option value="product">{t('purposeProduct')}</option>
                  <option value="testimonial">{t('purposeTestimonial')}</option>
                </select>
              </label>
              <label className="block text-[13px]">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('captionLabel')}</span>
                <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={t('captionPlaceholder')} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
              {purpose === 'product' && (
                <label className="block text-[13px] sm:col-span-2">
                  <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('marketplaceLabel')}</span>
                  <input value={marketplaceUrl} onChange={(e) => setMarketplaceUrl(e.target.value)} placeholder="https://shopee.co.id/..." className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                </label>
              )}
              <label className="block text-[13px] sm:col-span-2">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('keywordsLabel')}</span>
                <input value={triggerKeywords} onChange={(e) => setTriggerKeywords(e.target.value)} placeholder={t('keywordsPlaceholder')} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
              <label className="flex items-start gap-2 text-[13px] sm:col-span-2">
                <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                <span className="text-gray-600 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: t('autoSendLabel') }} />
              </label>
            </div>
            <div className="mt-3">
              <Button onClick={submit} disabled={uploading || !file || !title.trim()}>
                <UploadSimple className="h-4 w-4" aria-hidden="true" />
                {uploading ? t('uploading') : t('upload')}
              </Button>
            </div>
          </Card>
        )}

        <div className="mb-3 flex gap-1">
          {(['all', 'brochure', 'product', 'testimonial'] as const).map((p) => (
            <button key={p} onClick={() => setFilter(p)} className={cn('rounded px-2.5 py-1 text-xs font-medium', filter === p ? 'bg-hermes-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300')}>
              {p === 'all' ? t('all') : purposeMeta[p].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="h-16 rounded animate-shimmer" />)}</div>
        ) : assets.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">{t('noAssets')}</div>
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
                        <span className="flex h-full w-full items-center justify-center text-gray-400"><Icon className="h-6 w-6" /></span>
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
                        {a.autoSend && <Badge tone="hermes" className="text-[10px]">auto-send</Badge>}
                        {a.triggerKeywords.map((k) => (
                          <span key={k} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{k}</span>
                        ))}
                      </div>
                    </div>
                    {canManage && (
                      <button type="button" onClick={() => setEditing(a)} title={t('edit')} className="shrink-0 self-start text-gray-400 hover:text-hermes-600">
                        <PencilSimple className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {canDelete && (
                      <button type="button" onClick={() => setDeletingId(a.id)} title={t('delete')} className="shrink-0 self-start text-gray-400 hover:text-danger-600">
                        <Trash className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal open={!!deletingId && deletingId !== editing?.id} onClose={() => setDeletingId(null)} title={t('delete')}>
        {deletingId && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('delete')} "{assets.find(a => a.id === deletingId)?.title}"?
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>{t('cancel')}</Button>
              <Button variant="danger" size="sm" onClick={() => { remove(deletingId); setDeletingId(null); }} disabled={deletingId === null}>
                {t('delete')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={t('editModalTitle')}>
        {editing && (
          <div className="space-y-3 text-[13px]">
            <label className="block">
              <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('titleLabel')}</span>
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('purposeLabel')}</span>
                <select value={editing.purpose} onChange={(e) => setEditing({ ...editing, purpose: e.target.value as Purpose })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                  <option value="brochure">{t('purposeBrochure')}</option>
                  <option value="product">{t('purposeProduct')}</option>
                  <option value="testimonial">{t('purposeTestimonial')}</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('statusLabel')}</span>
                <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                  <option value="active">{t('statusActive')}</option>
                  <option value="draft">{t('statusDraft')}</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('captionLabel')}</span>
              <input value={editing.caption ?? ''} onChange={(e) => setEditing({ ...editing, caption: e.target.value })} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            {editing.purpose === 'product' && (
              <label className="block">
                <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('marketplaceLabel')}</span>
                <input value={editing.marketplaceUrl ?? ''} onChange={(e) => setEditing({ ...editing, marketplaceUrl: e.target.value })} placeholder="https://shopee.co.id/..." className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('keywordsLabel')}</span>
              <input value={editing.triggerKeywords.join(', ')} onChange={(e) => setEditing({ ...editing, triggerKeywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} placeholder={t('keywordsPlaceholder')} className="h-9 w-full rounded border border-gray-200 bg-gray-50 px-2.5 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={editing.autoSend} onChange={(e) => setEditing({ ...editing, autoSend: e.target.checked })} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
              <span className="text-gray-600 dark:text-gray-300" dangerouslySetInnerHTML={{ __html: t('autoSendEditLabel') }} />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>{t('cancel')}</Button>
              <Button size="sm" onClick={saveEdit} disabled={savingEdit || !editing.title.trim()}>{savingEdit ? t('saving') : t('save')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

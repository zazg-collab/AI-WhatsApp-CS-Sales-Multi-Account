'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { UploadSimple, Link, Plus, Books, PencilSimple, Trash } from '@/components/ui/core-essential-icons';
import { api, uploadFile } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, TextareaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/lib/i18n';
import { dict } from './knowledge.i18n';

interface Base { id: string; name: string; status: string; _count?: { items: number } }
interface Item { id: string; title: string; content: string; productName?: string; status: string }

export default function KnowledgePage() {
  const t = useT(dict);
  const [bases, setBases] = useState<Base[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [baseName, setBaseName] = useState('');
  const [item, setItem] = useState({ title: '', content: '', productName: '' });
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [ingestOk, setIngestOk] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingBases, setLoadingBases] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [renameBase, setRenameBase] = useState<Base | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteBase, setConfirmDeleteBase] = useState<Base | null>(null);
  const [editItem, setEditItem] = useState<Item | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', productName: '', status: 'active' });
  const [savingItem, setSavingItem] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<Item | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBases = useCallback(async () => {
    setError(null); setLoadingBases(true);
    try { setBases(await api<Base[]>('/knowledge-bases')); }
    catch (err) { setError(err instanceof Error ? err.message : t('loadBasesError')); }
    finally { setLoadingBases(false); }
  }, [t]);

  const loadBase = useCallback(async (id: string) => {
    setSelected(id); setError(null); setLoadingItems(true);
    try { const base = await api<{ items: Item[] }>(`/knowledge-bases/${id}`); setItems(base.items); }
    catch (err) { setError(err instanceof Error ? err.message : t('loadItemsError')); }
    finally { setLoadingItems(false); }
  }, [t]);

  useEffect(() => { loadBases(); }, [loadBases]);

  async function createBase(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/knowledge-bases', { method: 'POST', body: JSON.stringify({ name: baseName }) });
      setBaseName(''); loadBases();
    } catch (err) { setError(err instanceof Error ? err.message : t('loadBasesError')); }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!item.title.trim() || !item.content.trim()) return;
    let baseId = selected;
    // First save with no base selected auto-creates one (named after the item).
    if (!baseId) {
      const base = await api<Base>('/knowledge-bases', {
        method: 'POST',
        body: JSON.stringify({ name: item.title.trim().slice(0, 60) || t('defaultBaseName') }),
      });
      baseId = base.id;
    }
    try {
      await api(`/knowledge-bases/${baseId}/items`, { method: 'POST', body: JSON.stringify({ ...item, status: 'active' }) });
      setItem({ title: '', content: '', productName: '' });
      setPrefilled(false);
      await loadBases();
      loadBase(baseId);
    } catch (err) { setError(err instanceof Error ? err.message : t('loadItemsError')); }
  }

  // File/URL are now action-first: parse (no persistence) and pre-fill the form
  // so the user reviews/trims before saving, instead of silently creating items.
  async function saveRenameBase() {
    if (!renameBase) return;
    await api(`/knowledge-bases/${renameBase.id}`, { method: 'PATCH', body: JSON.stringify({ name: renameValue.trim() }) });
    setBases((prev) => prev.map((b) => b.id === renameBase.id ? { ...b, name: renameValue.trim() } : b));
    setRenameBase(null);
  }

  async function doDeleteBase() {
    if (!confirmDeleteBase) return;
    try {
      await api(`/knowledge-bases/${confirmDeleteBase.id}`, { method: 'DELETE' });
      setBases((prev) => prev.filter((b) => b.id !== confirmDeleteBase.id));
      if (selected === confirmDeleteBase.id) { setSelected(null); setItems([]); }
      setConfirmDeleteBase(null);
    } catch (err) { setError(err instanceof Error ? err.message : t('loadBasesError')); }
  }

  function openEditItem(it: Item) {
    setEditForm({ title: it.title, content: it.content, productName: it.productName ?? '', status: it.status });
    setEditItem(it);
  }

  async function saveEditItem() {
    if (!editItem) return;
    setSavingItem(true);
    try {
      const updated = await api<Item>(`/knowledge-items/${editItem.id}`, { method: 'PATCH', body: JSON.stringify(editForm) });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setEditItem(null);
    } finally {
      setSavingItem(false);
    }
  }

  async function doDeleteItem() {
    if (!confirmDeleteItem) return;
    try {
      await api(`/knowledge-items/${confirmDeleteItem.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((i) => i.id !== confirmDeleteItem.id));
      setConfirmDeleteItem(null);
    } catch (err) { setError(err instanceof Error ? err.message : t('loadItemsError')); }
  }

  async function handleFileUpload(file: File) {
    if (ingesting) return;
    setIngesting(true); setIngestMsg(null);
    const form = new FormData(); form.append('file', file);
    try {
      const r = await uploadFile<{ title: string; content: string; kind: string; chars: number; truncated: boolean }>('/knowledge/parse/upload', form);
      setItem({ title: r.title, content: r.content, productName: '' });
      setPrefilled(true);
      setIngestOk(true);
      setIngestMsg(r.truncated ? t('parsedTruncated', { chars: r.chars }) : t('parsedOk', { chars: r.chars }));
    } catch (e) { setIngestOk(false); setIngestMsg(e instanceof Error ? e.message : t('importFileError')); }
    finally { setIngesting(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function handleUrlIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!ingestUrl.trim() || ingesting) return;
    setIngesting(true); setIngestMsg(null);
    try {
      const r = await api<{ title: string; content: string; kind: string; chars: number; truncated: boolean }>('/knowledge/parse-url', { method: 'POST', body: JSON.stringify({ url: ingestUrl.trim() }) });
      setItem({ title: r.title, content: r.content, productName: '' });
      setPrefilled(true);
      setIngestUrl('');
      setIngestOk(true);
      setIngestMsg(r.truncated ? t('parsedTruncated', { chars: r.chars }) : t('parsedOk', { chars: r.chars }));
    } catch (e) { setIngestOk(false); setIngestMsg(e instanceof Error ? e.message : t('importUrlError')); }
    finally { setIngesting(false); }
  }

  return (
    <AppLayout>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      <div className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto p-5 md:flex-row">
        {error && (
          <Card className="fixed right-5 top-20 z-20 border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
            <p className="font-medium">{error}</p>
            <button onClick={() => (selected ? loadBase(selected) : loadBases())} className="mt-1 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400">{t('retry')}</button>
          </Card>
        )}

        <aside className="w-full shrink-0 space-y-4 md:w-64">
          <Card className="p-3">
            <form onSubmit={createBase} className="space-y-2">
              <Field label={t('newBaseLabel')} aria-label={t('newBaseAria')} placeholder={t('newBasePlaceholder')} value={baseName} onChange={(e) => setBaseName(e.target.value)} required />
              <Button type="submit" size="sm" className="w-full"><Plus className="h-4 w-4" aria-hidden="true" />{t('createBase')}</Button>
            </form>
          </Card>
          {loadingBases ? (
            <div className="space-y-1">{[1,2,3].map((n) => <div key={n} className="h-10 rounded-lg animate-shimmer" />)}</div>
          ) : bases.length === 0 ? (
            <p className="px-1 text-xs text-gray-400">{t('emptyBases')}</p>
          ) : (
            <ul className="space-y-1">
              {bases.map((b) => {
                const isActive = selected === b.id;
                return (
                  <li key={b.id} className="group relative">
                    <button onClick={() => loadBase(b.id)} className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${isActive ? 'border-sentinel-200 bg-sentinel-50 text-sentinel-700 dark:border-sentinel-800 dark:bg-sentinel-900/30 dark:text-sentinel-200' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`}>
                      <span className="truncate pr-8">{b.name}</span>
                      <Badge tone={isActive ? 'sentinel' : 'neutral'}>{b._count?.items ?? 0}</Badge>
                    </button>
                    <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden gap-0.5 group-hover:flex">
                      <button onClick={(e) => { e.stopPropagation(); setRenameValue(b.name); setRenameBase(b); }} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800" aria-label={t('renameBaseTitle')}><PencilSimple className="h-3 w-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteBase(b); }} className="rounded p-1 text-gray-400 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-900/20" aria-label={t('deleteBaseTitle')}><Trash className="h-3 w-3" /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="min-w-0 flex-1 space-y-5">
          <Card className="p-4">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <UploadSimple className="h-4 w-4 text-gray-400" aria-hidden="true" />{t('importHeading')}
            </h2>
            {/* Upload PDF, Word (.docx), Excel, CSV, TXT, Markdown, HTML, or pull from a web page / public file URL. The content is extracted into active items, split automatically when too long. */}
            <p className="mb-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t('importHint')}</p>
            <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{t('importHintPrefill')}</p>
            <div className="flex flex-wrap items-center gap-2">
              <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-sentinel-600 px-3.5 text-sm font-medium text-white hover:bg-sentinel-700 ${ingesting ? 'opacity-50' : ''}`}>
                <UploadSimple className="h-4 w-4" aria-hidden="true" />
                {ingesting ? t('processing') : t('uploadFile')}
                <input ref={fileRef} type="file" aria-label={t('uploadFileAria')} className="hidden" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.html,.htm,.json" disabled={ingesting} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} />
              </label>
              <form onSubmit={handleUrlIngest} className="flex flex-1 items-end gap-2">
                <div className="min-w-48 flex-1"><Field label={t('importFromUrl')} aria-label={t('urlSourceAria')} type="url" value={ingestUrl} onChange={(e) => setIngestUrl(e.target.value)} placeholder={t('urlPlaceholder')} /></div>
                <Button type="submit" variant="outline" size="md" disabled={!ingestUrl.trim() || ingesting}><Link className="h-4 w-4" aria-hidden="true" />{t('pullUrl')}</Button>
              </form>
            </div>
            {ingestMsg && <p className={`mt-2 text-xs ${ingestOk ? 'text-channel-700' : 'text-danger-600'}`}>{ingestMsg}</p>}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('addItemHeading')}
              {prefilled && <Badge tone="sentinel">{t('autoParsed')}</Badge>}
            </h2>
            {!selected && <p className="mb-2 text-[11px] text-gray-400">{t('willAutoCreateBase')}</p>}
            <form onSubmit={addItem} className="space-y-2">
              <Field label={t('titleLabel')} placeholder={t('titlePlaceholder')} value={item.title} onChange={(e) => setItem({ ...item, title: e.target.value })} required />
              <Field label={t('productNameLabel')} hint={t('productNameHint')} placeholder={t('productNamePlaceholder')} value={item.productName} onChange={(e) => setItem({ ...item, productName: e.target.value })} />
              <div>
                <TextareaField label={t('contentLabel')} placeholder={t('contentPlaceholder')} value={item.content} onChange={(e) => setItem({ ...item, content: e.target.value })} rows={prefilled ? 8 : 4} required />
                <div className="mt-1 flex justify-between text-[11px] text-gray-400 dark:text-gray-500">
                  <span>{t('contentFormatHint')}</span>
                  <span className={item.content.length > 3000 ? 'text-danger-500' : ''}>{item.content.length.toLocaleString()} {t('chars')}</span>
                </div>
              </div>
              <Button type="submit" size="sm"><Plus className="h-4 w-4" aria-hidden="true" />{t('addItem')}</Button>
            </form>
          </Card>

          {selected && (
            loadingItems ? (
              <div className="space-y-2">{[1,2,3].map((n) => <div key={n} className="h-20 rounded animate-shimmer" />)}</div>
            ) : items.length === 0 ? (
              <Card className="flex flex-col items-center justify-center py-12 text-center">
                <Books className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('emptyItemsTitle')}</p>
                <p className="mt-1 text-[13px] text-gray-400">{t('emptyItemsHint')}</p>
              </Card>
            ) : (
              <ul className="space-y-2">
                {items.map((it) => (
                  <li key={it.id}>
                    <Card className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 dark:text-gray-100">{it.title}</p>
                            <Badge tone={it.status === 'active' ? 'success' : 'neutral'}>{it.status === 'active' ? t('statusActive') : it.status}</Badge>
                          </div>
                          {it.productName && <p className="text-xs text-gray-400">{it.productName}</p>}
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-3">{it.content}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button onClick={() => openEditItem(it)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800" aria-label={t('editItemTitle')}><PencilSimple className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setConfirmDeleteItem(it)} className="rounded p-1 text-gray-400 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-900/20" aria-label={t('deleteItemTitle')}><Trash className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    </Card>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      </div>
      {renameBase && (
        <Modal open size="sm" title={t('renameBaseTitle')} onClose={() => setRenameBase(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRenameBase(null)}>{t('cancel')}</Button>
              <Button onClick={saveRenameBase} disabled={!renameValue.trim()}>{t('renameBaseBtn')}</Button>
            </>
          }
        >
          <Field label={t('renameBaseLabel')} value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus required />
        </Modal>
      )}

      {confirmDeleteBase && (
        <Modal open size="sm" title={t('deleteBaseTitle')} onClose={() => setConfirmDeleteBase(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDeleteBase(null)}>{t('cancel')}</Button>
              <Button variant="danger" onClick={doDeleteBase}><Trash className="h-4 w-4" aria-hidden="true" />{t('deleteBaseBtn')}</Button>
            </>
          }
        >
          <p className="text-sm text-gray-700 dark:text-gray-200">{t('deleteBaseBody')}</p>
          <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{confirmDeleteBase.name}</p>
        </Modal>
      )}

      {editItem && (
        <Modal open size="md" title={t('editItemTitle')} onClose={() => setEditItem(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditItem(null)}>{t('cancel')}</Button>
              <Button onClick={saveEditItem} disabled={savingItem}>{savingItem ? t('saving') : t('saveItem')}</Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label={t('titleLabel')} value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} required />
            <Field label={t('productNameLabel')} value={editForm.productName} onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })} />
            <TextareaField label={t('contentLabel')} value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} rows={6} required />
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Status</span>
              <button type="button"
                onClick={() => setEditForm({ ...editForm, status: editForm.status === 'active' ? 'inactive' : 'active' })}
                className={`rounded-full px-3 py-1 text-xs font-medium ${editForm.status === 'active' ? 'bg-channel-100 text-channel-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {editForm.status === 'active' ? t('toggleInactive') : t('toggleActive')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDeleteItem && (
        <Modal open size="sm" title={t('deleteItemTitle')} onClose={() => setConfirmDeleteItem(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setConfirmDeleteItem(null)}>{t('cancel')}</Button>
              <Button variant="danger" onClick={doDeleteItem}><Trash className="h-4 w-4" aria-hidden="true" />{t('deleteItemBtn')}</Button>
            </>
          }
        >
          <p className="text-sm text-gray-700 dark:text-gray-200">{t('deleteItemBody')}</p>
          <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{confirmDeleteItem.title}</p>
        </Modal>
      )}
    </AppLayout>
  );
}

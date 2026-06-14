'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Upload, Link2, Plus, BookOpen } from 'lucide-react';
import { api, uploadFile } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, TextareaField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  pageTitle: { id: 'Knowledge Base', en: 'Knowledge Base' },
  pageSubtitle: {
    id: 'Sumber yang menjadi dasar jawaban AI ke pelanggan',
    en: 'The sources that ground the AI replies to customers',
  },
  loadBasesError: { id: 'Gagal memuat knowledge base dari API', en: 'Failed to load knowledge bases from the API' },
  loadItemsError: { id: 'Gagal memuat isi knowledge base dari API', en: 'Failed to load knowledge base contents from the API' },
  importFileError: { id: 'Gagal mengimpor file', en: 'Failed to import file' },
  importUrlError: { id: 'Gagal mengimpor URL', en: 'Failed to import URL' },
  importFileOk: {
    id: 'Berhasil impor {name}: {count} item ({chars} karakter)',
    en: 'Imported {name} successfully: {count} items ({chars} characters)',
  },
  importUrlOk: {
    id: 'Berhasil impor {source}: {count} item ({chars} karakter)',
    en: 'Imported {source} successfully: {count} items ({chars} characters)',
  },
  retry: { id: 'Coba lagi', en: 'Try again' },
  newBaseLabel: { id: 'Knowledge base baru', en: 'New knowledge base' },
  newBaseAria: { id: 'Nama knowledge base baru', en: 'New knowledge base name' },
  newBasePlaceholder: { id: 'Mis. Knowledge base produk', en: 'e.g. Product knowledge base' },
  createBase: { id: 'Create base', en: 'Create base' },
  emptyBases: {
    id: 'Belum ada knowledge base. Buat satu di atas untuk mulai melatih jawaban AI.',
    en: 'No knowledge base yet. Create one above to start training the AI replies.',
  },
  importHeading: { id: 'Impor knowledge', en: 'Import knowledge' },
  importHint: {
    id: 'Unggah PDF, Word, Excel, CSV, TXT, Markdown, HTML, atau tarik dari halaman web / file URL publik. Konten diekstrak menjadi item aktif, dipecah otomatis bila terlalu panjang.',
    en: 'Upload PDF, Word, Excel, CSV, TXT, Markdown, HTML, or pull from a web page / public file URL. The content is extracted into active items, split automatically when too long.',
  },
  processing: { id: 'Memproses…', en: 'Processing…' },
  uploadFile: { id: 'Unggah file', en: 'Upload file' },
  uploadFileAria: { id: 'Unggah file knowledge', en: 'Upload knowledge file' },
  importFromUrl: { id: 'Impor dari URL', en: 'Import from URL' },
  urlSourceAria: { id: 'URL sumber knowledge', en: 'Knowledge source URL' },
  urlPlaceholder: {
    id: 'https://situs.com/produk atau .../daftar-harga.pdf',
    en: 'https://site.com/products or .../price-list.pdf',
  },
  pullUrl: { id: 'Tarik URL', en: 'Pull URL' },
  addItemHeading: { id: 'Tambah item manual', en: 'Add item manually' },
  titleLabel: { id: 'Judul', en: 'Title' },
  titlePlaceholder: { id: 'Mis. Harga Unit A', en: 'e.g. Price of Unit A' },
  productNameLabel: { id: 'Nama produk', en: 'Product name' },
  productNameHint: {
    id: 'Opsional — bantu AI mengaitkan item ke produk tertentu.',
    en: 'Optional — helps the AI link the item to a specific product.',
  },
  productNamePlaceholder: { id: 'Mis. Unit A', en: 'e.g. Unit A' },
  contentLabel: { id: 'Isi knowledge', en: 'Knowledge content' },
  contentPlaceholder: {
    id: 'Tulis fakta yang boleh dipakai AI untuk menjawab…',
    en: 'Write the facts the AI may use to answer…',
  },
  addItem: { id: 'Tambah item', en: 'Add item' },
  emptyItemsTitle: { id: 'Knowledge base masih kosong', en: 'Knowledge base is still empty' },
  emptyItemsHint: {
    id: 'Impor file/URL atau tambah item manual agar AI punya bahan untuk menjawab.',
    en: 'Import a file/URL or add an item manually so the AI has material to answer with.',
  },
  statusActive: { id: 'Aktif', en: 'Active' },
  pickBaseTitle: { id: 'Pilih knowledge base', en: 'Select a knowledge base' },
  pickBaseHint: {
    id: 'Pilih knowledge base di kiri, atau buat yang baru untuk mulai mengisi materi AI.',
    en: 'Select a knowledge base on the left, or create a new one to start filling AI material.',
  },
};

interface Base {
  id: string;
  name: string;
  status: string;
  _count?: { items: number };
}

interface Item {
  id: string;
  title: string;
  content: string;
  productName?: string;
  status: string;
}

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
  const [error, setError] = useState<string | null>(null);
  const [loadingBases, setLoadingBases] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBases = useCallback(async () => {
    setError(null);
    setLoadingBases(true);
    try {
      setBases(await api<Base[]>('/knowledge-bases'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadBasesError'));
    } finally {
      setLoadingBases(false);
    }
  }, [t]);

  const loadBase = useCallback(async (id: string) => {
    setSelected(id);
    setError(null);
    setLoadingItems(true);
    try {
      const base = await api<{ items: Item[] }>(`/knowledge-bases/${id}`);
      setItems(base.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('loadItemsError'));
    } finally {
      setLoadingItems(false);
    }
  }, [t]);

  useEffect(() => {
    loadBases();
  }, [loadBases]);

  async function createBase(e: React.FormEvent) {
    e.preventDefault();
    await api('/knowledge-bases', { method: 'POST', body: JSON.stringify({ name: baseName }) });
    setBaseName('');
    loadBases();
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await api(`/knowledge-bases/${selected}/items`, {
      method: 'POST',
      body: JSON.stringify({ ...item, status: 'active' }),
    });
    setItem({ title: '', content: '', productName: '' });
    loadBase(selected);
  }

  async function handleFileUpload(file: File) {
    if (!selected || ingesting) return;
    setIngesting(true);
    setIngestMsg(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const r = await uploadFile<{ items: unknown[]; chars: number }>(
        `/knowledge-bases/${selected}/items/upload`,
        form,
      );
      setIngestOk(true);
      setIngestMsg(t('importFileOk', { name: file.name, count: r.items.length, chars: r.chars }));
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestOk(false);
      setIngestMsg(e instanceof Error ? e.message : t('importFileError'));
    } finally {
      setIngesting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleUrlIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !ingestUrl.trim() || ingesting) return;
    setIngesting(true);
    setIngestMsg(null);
    try {
      const r = await api<{ items: unknown[]; chars: number; source: string }>(
        `/knowledge-bases/${selected}/items/from-url`,
        { method: 'POST', body: JSON.stringify({ url: ingestUrl.trim() }) },
      );
      setIngestOk(true);
      setIngestMsg(t('importUrlOk', { source: r.source, count: r.items.length, chars: r.chars }));
      setIngestUrl('');
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestOk(false);
      setIngestMsg(e instanceof Error ? e.message : t('importUrlError'));
    } finally {
      setIngesting(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title={t('pageTitle')} subtitle={t('pageSubtitle')} />

      <div className="scrollbar-thin flex flex-1 gap-5 overflow-y-auto p-5">
        {error && (
          <Card className="fixed right-5 top-20 z-20 border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
            <p className="font-medium">{error}</p>
            <button
              onClick={() => (selected ? loadBase(selected) : loadBases())}
              className="mt-1 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400"
            >
              {t('retry')}
            </button>
          </Card>
        )}
        {/* Bases list */}
        <aside className="w-64 shrink-0 space-y-4">
          <Card className="p-3">
            <form onSubmit={createBase} className="space-y-2">
              <Field
                label={t('newBaseLabel')}
                aria-label={t('newBaseAria')}
                placeholder={t('newBasePlaceholder')}
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                required
              />
              <Button type="submit" size="sm" className="w-full">
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                {t('createBase')}
              </Button>
            </form>
          </Card>
          {loadingBases ? (
            <div className="space-y-1">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-10 rounded-lg animate-shimmer" />
              ))}
            </div>
          ) : bases.length === 0 ? (
            <p className="px-1 text-xs text-gray-400">
              {t('emptyBases')}
            </p>
          ) : (
            <ul className="space-y-1">
              {bases.map((b) => {
                const isActive = selected === b.id;
                return (
                  <li key={b.id}>
                    <button
                      onClick={() => loadBase(b.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? 'border-hermes-200 bg-hermes-50 text-hermes-700 dark:border-hermes-800 dark:bg-hermes-900/30 dark:text-hermes-200'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="truncate">{b.name}</span>
                      <Badge tone={isActive ? 'hermes' : 'neutral'}>{b._count?.items ?? 0}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Detail */}
        <section className="min-w-0 flex-1 space-y-5">
          {selected ? (
            <>
              <Card className="p-4">
                <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <Upload className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  {t('importHeading')}
                </h2>
                <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  {t('importHint')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-hermes-600 px-3.5 text-sm font-medium text-white hover:bg-hermes-700 ${
                      ingesting ? 'opacity-50' : ''
                    }`}
                  >
                    <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {ingesting ? t('processing') : t('uploadFile')}
                    <input
                      ref={fileRef}
                      type="file"
                      aria-label={t('uploadFileAria')}
                      className="hidden"
                      accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.html,.htm,.json"
                      disabled={ingesting}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileUpload(f);
                      }}
                    />
                  </label>
                  <form onSubmit={handleUrlIngest} className="flex flex-1 items-end gap-2">
                    <div className="min-w-48 flex-1">
                      <Field
                        label={t('importFromUrl')}
                        aria-label={t('urlSourceAria')}
                        type="url"
                        value={ingestUrl}
                        onChange={(e) => setIngestUrl(e.target.value)}
                        placeholder={t('urlPlaceholder')}
                      />
                    </div>
                    <Button type="submit" variant="outline" size="md" disabled={!ingestUrl.trim() || ingesting}>
                      <Link2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      {t('pullUrl')}
                    </Button>
                  </form>
                </div>
                {ingestMsg && (
                  <p className={`mt-2 text-xs ${ingestOk ? 'text-channel-700' : 'text-danger-600'}`}>
                    {ingestMsg}
                  </p>
                )}
              </Card>

              <Card className="p-4">
                <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('addItemHeading')}</h2>
                <form onSubmit={addItem} className="space-y-2">
                  <Field
                    label={t('titleLabel')}
                    placeholder={t('titlePlaceholder')}
                    value={item.title}
                    onChange={(e) => setItem({ ...item, title: e.target.value })}
                    required
                  />
                  <Field
                    label={t('productNameLabel')}
                    hint={t('productNameHint')}
                    placeholder={t('productNamePlaceholder')}
                    value={item.productName}
                    onChange={(e) => setItem({ ...item, productName: e.target.value })}
                  />
                  <TextareaField
                    label={t('contentLabel')}
                    placeholder={t('contentPlaceholder')}
                    value={item.content}
                    onChange={(e) => setItem({ ...item, content: e.target.value })}
                    rows={4}
                    required
                  />
                  <Button type="submit" size="sm">
                    <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {t('addItem')}
                  </Button>
                </form>
              </Card>

              {loadingItems ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="h-20 rounded animate-shimmer" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-12 text-center">
                  <BookOpen className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('emptyItemsTitle')}</p>
                  <p className="mt-1 text-[13px] text-gray-400">
                    {t('emptyItemsHint')}
                  </p>
                </Card>
              ) : (
                <ul className="space-y-2">
                  {items.map((it) => (
                    <li key={it.id}>
                      <Card className="p-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{it.title}</p>
                          <Badge tone={it.status === 'active' ? 'success' : 'neutral'}>
                            {it.status === 'active' ? t('statusActive') : it.status}
                          </Badge>
                        </div>
                        {it.productName && (
                          <p className="text-xs text-gray-400">{it.productName}</p>
                        )}
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{it.content}</p>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('pickBaseTitle')}</p>
              <p className="mt-1 text-[13px] text-gray-400">
                {t('pickBaseHint')}
              </p>
            </Card>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

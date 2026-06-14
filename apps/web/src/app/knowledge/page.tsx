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
  const [bases, setBases] = useState<Base[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [baseName, setBaseName] = useState('');
  const [item, setItem] = useState({ title: '', content: '', productName: '' });
  const [ingestUrl, setIngestUrl] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
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
      setError(err instanceof Error ? err.message : 'Gagal memuat knowledge base dari API');
    } finally {
      setLoadingBases(false);
    }
  }, []);

  const loadBase = useCallback(async (id: string) => {
    setSelected(id);
    setError(null);
    setLoadingItems(true);
    try {
      const base = await api<{ items: Item[] }>(`/knowledge-bases/${id}`);
      setItems(base.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat isi knowledge base dari API');
    } finally {
      setLoadingItems(false);
    }
  }, []);

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
      setIngestMsg(`Berhasil impor ${file.name}: ${r.items.length} item (${r.chars} karakter)`);
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : 'Gagal mengimpor file');
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
      setIngestMsg(`Berhasil impor ${r.source}: ${r.items.length} item (${r.chars} karakter)`);
      setIngestUrl('');
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : 'Gagal mengimpor URL');
    } finally {
      setIngesting(false);
    }
  }

  const ingestOk = ingestMsg?.startsWith('Berhasil');

  return (
    <AppLayout>
      <PageHeader title="Knowledge Base" subtitle="Sumber yang menjadi dasar jawaban AI ke pelanggan" />

      <div className="scrollbar-thin flex flex-1 gap-5 overflow-y-auto p-5">
        {error && (
          <Card className="fixed right-5 top-20 z-20 border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
            <p className="font-medium">{error}</p>
            <button
              onClick={() => (selected ? loadBase(selected) : loadBases())}
              className="mt-1 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400"
            >
              Coba lagi
            </button>
          </Card>
        )}
        {/* Bases list */}
        <aside className="w-64 shrink-0 space-y-4">
          <Card className="p-3">
            <form onSubmit={createBase} className="space-y-2">
              <Field
                label="Knowledge base baru"
                aria-label="Nama knowledge base baru"
                placeholder="Mis. Knowledge base produk"
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                required
              />
              <Button type="submit" size="sm" className="w-full">
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Create base
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
              Belum ada knowledge base. Buat satu di atas untuk mulai melatih jawaban AI.
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
                  Impor knowledge
                </h2>
                <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Unggah PDF, Word, Excel, CSV, TXT, Markdown, HTML, atau tarik dari halaman web /
                  file URL publik. Konten diekstrak menjadi item aktif, dipecah otomatis bila terlalu
                  panjang.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-hermes-600 px-3.5 text-sm font-medium text-white hover:bg-hermes-700 ${
                      ingesting ? 'opacity-50' : ''
                    }`}
                  >
                    <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {ingesting ? 'Memproses…' : 'Unggah file'}
                    <input
                      ref={fileRef}
                      type="file"
                      aria-label="Unggah file knowledge"
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
                        label="Impor dari URL"
                        aria-label="URL sumber knowledge"
                        type="url"
                        value={ingestUrl}
                        onChange={(e) => setIngestUrl(e.target.value)}
                        placeholder="https://situs.com/produk atau .../daftar-harga.pdf"
                      />
                    </div>
                    <Button type="submit" variant="outline" size="md" disabled={!ingestUrl.trim() || ingesting}>
                      <Link2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Tarik URL
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
                <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Tambah item manual</h2>
                <form onSubmit={addItem} className="space-y-2">
                  <Field
                    label="Judul"
                    placeholder="Mis. Harga Unit A"
                    value={item.title}
                    onChange={(e) => setItem({ ...item, title: e.target.value })}
                    required
                  />
                  <Field
                    label="Nama produk"
                    hint="Opsional — bantu AI mengaitkan item ke produk tertentu."
                    placeholder="Mis. Unit A"
                    value={item.productName}
                    onChange={(e) => setItem({ ...item, productName: e.target.value })}
                  />
                  <TextareaField
                    label="Isi knowledge"
                    placeholder="Tulis fakta yang boleh dipakai AI untuk menjawab…"
                    value={item.content}
                    onChange={(e) => setItem({ ...item, content: e.target.value })}
                    rows={4}
                    required
                  />
                  <Button type="submit" size="sm">
                    <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Tambah item
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
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Knowledge base masih kosong</p>
                  <p className="mt-1 text-[13px] text-gray-400">
                    Impor file/URL atau tambah item manual agar AI punya bahan untuk menjawab.
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
                            {it.status === 'active' ? 'Aktif' : it.status}
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
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Pilih knowledge base</p>
              <p className="mt-1 text-[13px] text-gray-400">
                Pilih knowledge base di kiri, atau buat yang baru untuk mulai mengisi materi AI.
              </p>
            </Card>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

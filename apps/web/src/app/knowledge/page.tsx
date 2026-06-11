'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, uploadFile } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

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
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBases = useCallback(async () => {
    setBases(await api<Base[]>('/knowledge-bases').catch(() => []));
  }, []);

  const loadBase = useCallback(async (id: string) => {
    setSelected(id);
    const base = await api<{ items: Item[] }>(`/knowledge-bases/${id}`);
    setItems(base.items);
  }, []);

  useEffect(() => {
    loadBases();
  }, [loadBases]);

  async function createBase(e: React.FormEvent) {
    e.preventDefault();
    await api('/knowledge-bases', {
      method: 'POST',
      body: JSON.stringify({ name: baseName }),
    });
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

  // Ingest a document (pdf/docx/xlsx/csv/txt/md/html) into the selected base.
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
      setIngestMsg(`✓ ${file.name}: ${r.items.length} item (${r.chars} karakter)`);
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : 'Gagal mengimpor file');
    } finally {
      setIngesting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  // Ingest a public web page into the selected base.
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
      setIngestMsg(`✓ ${r.source}: ${r.items.length} item (${r.chars} karakter)`);
      setIngestUrl('');
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : 'Gagal mengimpor URL');
    } finally {
      setIngesting(false);
    }
  }

  return (
    <AppLayout><main className="mx-auto flex max-w-5xl gap-6 p-8">
      <aside className="w-64 shrink-0">
        <h1 className="mb-4 text-lg font-semibold text-wa-accent">
          Knowledge Base
        </h1>
        <form onSubmit={createBase} className="mb-4 space-y-2">
          <input
            placeholder="Nama KB baru"
            value={baseName}
            onChange={(e) => setBaseName(e.target.value)}
            className="w-full rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none"
            required
          />
          <button className="w-full rounded bg-wa-accent py-2 text-sm font-medium text-black">
            Buat
          </button>
        </form>
        <ul className="space-y-1">
          {bases.map((b) => (
            <li key={b.id}>
              <button
                onClick={() => loadBase(b.id)}
                className={`w-full rounded px-3 py-2 text-left text-sm ${
                  selected === b.id ? 'bg-wa-accent text-black' : 'bg-white dark:bg-wa-panel'
                }`}
              >
                {b.name}{' '}
                <span className="text-xs opacity-60">
                  ({b._count?.items ?? 0})
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="flex-1">
        {selected ? (
          <>
            {/* Import dari file / website */}
            <div className="mb-6 rounded-lg bg-white dark:bg-wa-panel p-4">
              <h2 className="mb-2 text-sm font-semibold">Impor Knowledge</h2>
              <p className="mb-3 text-xs text-gray-600 dark:text-gray-400">
                Upload PDF, Word (.docx), Excel (.xlsx), CSV, TXT, Markdown, atau ambil dari halaman website.
                Isi diekstrak otomatis menjadi item aktif.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`cursor-pointer rounded bg-wa-accent px-3 py-2 text-sm font-medium text-black ${ingesting ? 'opacity-50' : ''}`}>
                  {ingesting ? 'Memproses…' : '📄 Upload file'}
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.html"
                    disabled={ingesting}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                    }}
                  />
                </label>
                <form onSubmit={handleUrlIngest} className="flex flex-1 gap-2">
                  <input
                    type="url"
                    value={ingestUrl}
                    onChange={(e) => setIngestUrl(e.target.value)}
                    placeholder="https://website-anda.com/halaman-produk"
                    className="min-w-48 flex-1 rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-gray-500"
                  />
                  <button
                    disabled={!ingestUrl.trim() || ingesting}
                    className="rounded bg-wa-accent px-3 py-2 text-sm font-medium text-black disabled:opacity-50"
                  >
                    🌐 Ambil
                  </button>
                </form>
              </div>
              {ingestMsg && (
                <p className={`mt-2 text-xs ${ingestMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>
                  {ingestMsg}
                </p>
              )}
            </div>

            <form onSubmit={addItem} className="mb-6 space-y-2">
              <input
                placeholder="Judul (mis. Harga Unit A)"
                value={item.title}
                onChange={(e) => setItem({ ...item, title: e.target.value })}
                className="w-full rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none"
                required
              />
              <input
                placeholder="Nama produk (opsional)"
                value={item.productName}
                onChange={(e) =>
                  setItem({ ...item, productName: e.target.value })
                }
                className="w-full rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none"
              />
              <textarea
                placeholder="Isi knowledge..."
                value={item.content}
                onChange={(e) => setItem({ ...item, content: e.target.value })}
                className="h-24 w-full rounded bg-white dark:bg-wa-panel px-3 py-2 text-sm outline-none"
                required
              />
              <button className="rounded bg-wa-accent px-4 py-2 text-sm font-medium text-black">
                Tambah item
              </button>
            </form>

            <ul className="space-y-3">
              {items.map((it) => (
                <li key={it.id} className="rounded-lg bg-white dark:bg-wa-panel p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{it.title}</p>
                    <span className="text-xs text-gray-500">{it.status}</span>
                  </div>
                  {it.productName && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">{it.productName}</p>
                  )}
                  <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{it.content}</p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-gray-500">
            Pilih atau buat knowledge base.
          </p>
        )}
      </section>
    </main></AppLayout>
  );
}

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Upload, Link2, Plus, BookOpen } from 'lucide-react';
import { api, uploadFile } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

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
      setIngestMsg(`Imported ${file.name}: ${r.items.length} items (${r.chars} chars)`);
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : 'Failed to import file');
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
      setIngestMsg(`Imported ${r.source}: ${r.items.length} items (${r.chars} chars)`);
      setIngestUrl('');
      loadBase(selected);
      loadBases();
    } catch (e) {
      setIngestMsg(e instanceof Error ? e.message : 'Failed to import URL');
    } finally {
      setIngesting(false);
    }
  }

  const ingestOk = ingestMsg?.startsWith('Imported');

  return (
    <AppLayout>
      <PageHeader title="Knowledge Base" subtitle="Sources that ground the AI's answers" />

      <div className="scrollbar-thin flex flex-1 gap-5 overflow-y-auto p-5">
        {/* Bases list */}
        <aside className="w-64 shrink-0 space-y-4">
          <Card className="p-3">
            <form onSubmit={createBase} className="space-y-2">
              <input
                placeholder="New knowledge base"
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                className={inputClass}
                required
              />
              <Button type="submit" size="sm" className="w-full">
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Create base
              </Button>
            </form>
          </Card>
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
        </aside>

        {/* Detail */}
        <section className="min-w-0 flex-1 space-y-5">
          {selected ? (
            <>
              <Card className="p-4">
                <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <Upload className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  Import knowledge
                </h2>
                <p className="mb-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                  Upload PDF, Word, Excel, CSV, TXT, Markdown, HTML, or pull from a public web
                  page / file URL. Content is extracted into active items, split when large.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-hermes-600 px-3.5 text-sm font-medium text-white hover:bg-hermes-700 ${
                      ingesting ? 'opacity-50' : ''
                    }`}
                  >
                    <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {ingesting ? 'Processing…' : 'Upload file'}
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.html,.htm,.json"
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
                      placeholder="https://site.com/product or .../price-list.pdf"
                      className={`min-w-48 flex-1 ${inputClass}`}
                    />
                    <Button type="submit" variant="outline" size="md" disabled={!ingestUrl.trim() || ingesting}>
                      <Link2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Fetch URL
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
                <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Add item manually</h2>
                <form onSubmit={addItem} className="space-y-2">
                  <input
                    placeholder="Title (e.g. Unit A pricing)"
                    value={item.title}
                    onChange={(e) => setItem({ ...item, title: e.target.value })}
                    className={inputClass}
                    required
                  />
                  <input
                    placeholder="Product name (optional)"
                    value={item.productName}
                    onChange={(e) => setItem({ ...item, productName: e.target.value })}
                    className={inputClass}
                  />
                  <textarea
                    placeholder="Knowledge content…"
                    value={item.content}
                    onChange={(e) => setItem({ ...item, content: e.target.value })}
                    className={`h-24 ${inputClass}`}
                    required
                  />
                  <Button type="submit" size="sm">
                    <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Add item
                  </Button>
                </form>
              </Card>

              <ul className="space-y-2">
                {items.map((it) => (
                  <li key={it.id}>
                    <Card className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{it.title}</p>
                        <Badge tone={it.status === 'active' ? 'success' : 'neutral'}>{it.status}</Badge>
                      </div>
                      {it.productName && (
                        <p className="text-xs text-gray-400">{it.productName}</p>
                      )}
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{it.content}</p>
                    </Card>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Card className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm text-gray-400">Select or create a knowledge base to begin.</p>
            </Card>
          )}
        </section>
      </div>
    </AppLayout>
  );
}

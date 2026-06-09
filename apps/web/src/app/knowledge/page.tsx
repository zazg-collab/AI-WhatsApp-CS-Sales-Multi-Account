'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';

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

  return (
    <main className="mx-auto flex max-w-5xl gap-6 p-8">
      <aside className="w-64 shrink-0">
        <h1 className="mb-4 text-lg font-semibold text-wa-accent">
          Knowledge Base
        </h1>
        <form onSubmit={createBase} className="mb-4 space-y-2">
          <input
            placeholder="Nama KB baru"
            value={baseName}
            onChange={(e) => setBaseName(e.target.value)}
            className="w-full rounded bg-wa-panel px-3 py-2 text-sm outline-none"
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
                  selected === b.id ? 'bg-wa-accent text-black' : 'bg-wa-panel'
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
            <form onSubmit={addItem} className="mb-6 space-y-2">
              <input
                placeholder="Judul (mis. Harga Unit A)"
                value={item.title}
                onChange={(e) => setItem({ ...item, title: e.target.value })}
                className="w-full rounded bg-wa-panel px-3 py-2 text-sm outline-none"
                required
              />
              <input
                placeholder="Nama produk (opsional)"
                value={item.productName}
                onChange={(e) =>
                  setItem({ ...item, productName: e.target.value })
                }
                className="w-full rounded bg-wa-panel px-3 py-2 text-sm outline-none"
              />
              <textarea
                placeholder="Isi knowledge..."
                value={item.content}
                onChange={(e) => setItem({ ...item, content: e.target.value })}
                className="h-24 w-full rounded bg-wa-panel px-3 py-2 text-sm outline-none"
                required
              />
              <button className="rounded bg-wa-accent px-4 py-2 text-sm font-medium text-black">
                Tambah item
              </button>
            </form>

            <ul className="space-y-3">
              {items.map((it) => (
                <li key={it.id} className="rounded-lg bg-wa-panel p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{it.title}</p>
                    <span className="text-xs text-gray-500">{it.status}</span>
                  </div>
                  {it.productName && (
                    <p className="text-xs text-gray-400">{it.productName}</p>
                  )}
                  <p className="mt-1 text-sm text-gray-300">{it.content}</p>
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
    </main>
  );
}

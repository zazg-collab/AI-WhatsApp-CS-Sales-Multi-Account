'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { api } from '@/lib/api';

interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
}

interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
  whatsappAccountId: string | null;
  whatsappAccount?: { id: string; accountName: string } | null;
}

const EMPTY = { title: '', content: '', shortcut: '', whatsappAccountId: '' };

export default function TemplatesPage() {
  const [items, setItems] = useState<QuickReply[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, accs] = await Promise.all([
        api<QuickReply[]>('/quick-replies'),
        api<WaAccount[]>('/wa/accounts').catch(() => []),
      ]);
      setItems(list);
      setAccounts(accs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat template');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setForm({ ...EMPTY });
    setEditingId(null);
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Judul dan isi wajib diisi');
      return;
    }
    setError(null);
    const body = {
      title: form.title.trim(),
      content: form.content,
      shortcut: form.shortcut.trim() || undefined,
      whatsappAccountId: form.whatsappAccountId || undefined,
    };
    try {
      if (editingId) {
        await api(`/quick-replies/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...body, whatsappAccountId: form.whatsappAccountId || null }),
        });
      } else {
        await api('/quick-replies', { method: 'POST', body: JSON.stringify(body) });
      }
      resetForm();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan template');
    }
  }

  function startEdit(item: QuickReply) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      content: item.content,
      shortcut: item.shortcut ?? '',
      whatsappAccountId: item.whatsappAccountId ?? '',
    });
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus template ini?')) return;
    try {
      await api(`/quick-replies/${id}`, { method: 'DELETE' });
      if (editingId === id) resetForm();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus');
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Template Pesan</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Balasan siap pakai untuk CS. Ketik <code className="text-emerald-400">/shortcut</code> di kolom chat untuk memilih cepat.
          </p>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {error && (
            <p className="mb-4 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>
          )}

          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            {/* Form */}
            <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
              <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">
                {editingId ? 'Edit Template' : 'Template Baru'}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Judul</label>
                  <input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="mis. Salam pembuka"
                    className="w-full rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Shortcut (opsional)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500">/</span>
                    <input
                      value={form.shortcut}
                      onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))}
                      placeholder="salam"
                      className="w-full rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Akun</label>
                  <select
                    value={form.whatsappAccountId}
                    onChange={(e) => setForm((f) => ({ ...f, whatsappAccountId: e.target.value }))}
                    className="w-full rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
                  >
                    <option value="">Global (semua akun)</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.accountName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Isi pesan</label>
                  <textarea
                    rows={5}
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    placeholder="Halo kak, terima kasih sudah menghubungi kami…"
                    className="w-full resize-none rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmit}
                    className="flex-1 rounded bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                  >
                    {editingId ? 'Simpan' : 'Tambah'}
                  </button>
                  {editingId && (
                    <button
                      onClick={resetForm}
                      className="rounded bg-gray-200 dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
                    >
                      Batal
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* List */}
            <section className="space-y-3">
              {loading ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">Memuat…</p>
              ) : items.length === 0 ? (
                <p className="text-sm text-gray-500">Belum ada template.</p>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">{item.title}</span>
                          {item.shortcut && (
                            <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-xs text-emerald-200">
                              /{item.shortcut}
                            </span>
                          )}
                          <span className="rounded bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-700 dark:text-gray-300">
                            {item.whatsappAccount?.accountName ?? 'Global'}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{item.content}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => startEdit(item)}
                          className="rounded bg-gray-200 dark:bg-gray-700 px-2 py-1 text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="rounded bg-red-800 px-2 py-1 text-xs text-red-100 hover:bg-red-700"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        </main>
      </div>
    </AppLayout>
  );
}

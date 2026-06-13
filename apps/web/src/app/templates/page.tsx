'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

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

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

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
        api<WaAccount[]>('/wa/accounts'),
      ]);
      setItems(list);
      setAccounts(accs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates');
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
      setError('Title and content are required');
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
      setError(e instanceof Error ? e.message : 'Failed to save template');
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
    if (!confirm('Delete this template?')) return;
    try {
      await api(`/quick-replies/${id}`, { method: 'DELETE' });
      if (editingId === id) resetForm();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  return (
    <AppLayout>
      <PageHeader
        title="Templates"
        subtitle="Ready-to-use CS replies — type /shortcut in the composer to insert"
      />

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {error && (
          <p className="mb-4 rounded-lg border border-danger-100 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-500">
            {error}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          {/* Form */}
          <Card className="h-fit p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
              {editingId ? 'Edit template' : 'New template'}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Title</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Greeting"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Shortcut (optional)</label>
                <div className="flex items-center gap-1">
                  <span className="text-gray-400">/</span>
                  <input
                    value={form.shortcut}
                    onChange={(e) => setForm((f) => ({ ...f, shortcut: e.target.value }))}
                    placeholder="greeting"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Account</label>
                <select
                  value={form.whatsappAccountId}
                  onChange={(e) => setForm((f) => ({ ...f, whatsappAccountId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Global (all accounts)</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.accountName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Message</label>
                <textarea
                  rows={5}
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Hi, thanks for reaching out to us…"
                  className={`resize-none ${inputClass}`}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSubmit} className="flex-1">
                  {editingId ? (
                    <>
                      <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Save
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Add
                    </>
                  )}
                </Button>
                {editingId && (
                  <Button variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* List */}
          <section className="space-y-2">
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : items.length === 0 ? (
              <Card className="py-12 text-center text-sm text-gray-400">No templates yet.</Card>
            ) : (
              items.map((item) => (
                <Card key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{item.title}</span>
                        {item.shortcut && <Badge tone="hermes">/{item.shortcut}</Badge>}
                        <Badge tone="neutral">{item.whatsappAccount?.accountName ?? 'Global'}</Badge>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">{item.content}</p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => startEdit(item)}>
                        <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </section>
        </div>
      </main>
    </AppLayout>
  );
}

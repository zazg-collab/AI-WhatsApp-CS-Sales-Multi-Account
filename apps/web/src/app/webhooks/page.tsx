'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash, PlugsConnected } from '@/components/ui/core-essential-icons';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks/useApiQuery';

interface Endpoint {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export default function WebhooksPage() {
  const { data: allEventsRaw } = useApiQuery<string[]>('/webhooks/events');
  const allEvents: string[] = allEventsRaw ?? [];
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  useEffect(() => { if (allEvents.length && !events.length) setEvents([...allEvents]); }, [allEvents]);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Endpoint | null>(null);

  async function load() {
    setLoading(true);
    try {
      setEndpoints(await api<Endpoint[]>('/webhooks'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat webhook');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggleEvent(ev: string) {
    setEvents((prev) => prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]);
  }

  async function handleAdd() {
    if (!url.trim() || !secret.trim() || !events.length) {
      setError('URL, secret, dan minimal 1 event wajib diisi');
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await api('/webhooks', { method: 'POST', body: JSON.stringify({ url: url.trim(), secret: secret.trim(), events }) });
      setShowAdd(false);
      setUrl(''); setSecret(''); setEvents([...allEvents]);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menambah webhook');
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await api(`/webhooks/${id}`, { method: 'DELETE' });
      setEndpoints((prev) => prev.filter((ep) => ep.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menghapus webhook');
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  async function toggleActive(ep: Endpoint) {
    try {
      await api(`/webhooks/${ep.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !ep.isActive }) });
      setEndpoints((prev) => prev.map((e) => e.id === ep.id ? { ...e, isActive: !ep.isActive } : e));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal mengubah status');
    }
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

  return (
    <AppLayout>
      <PageHeader title="Webhooks" subtitle="Push event ke URL eksternal (Zapier, n8n, CRM) secara realtime.">
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Tambah Webhook
        </Button>
      </PageHeader>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5 space-y-3">
        {error && (
          <Card className="border-danger-200 bg-danger-50 p-3 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
            {error}
          </Card>
        )}

        {loading ? (
          <div className="space-y-2">{[1,2].map((n) => <div key={n} className="h-20 rounded animate-shimmer" />)}</div>
        ) : endpoints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
            <PlugsConnected className="mb-2 h-10 w-10 text-gray-300" />
            <p className="text-sm">Belum ada webhook. Klik "Tambah Webhook" untuk mulai.</p>
          </div>
        ) : (
          endpoints.map((ep) => (
            <Card key={ep.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <Badge tone={ep.isActive ? 'sentinel' : 'neutral'}>{ep.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
                    <span className="truncate text-sm font-mono text-gray-800 dark:text-gray-100">{ep.url}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ep.events.map((ev) => (
                      <span key={ev} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => toggleActive(ep)}>
                    {ep.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(ep)} disabled={deleting === ep.id}>
                    <Trash className="h-4 w-4 text-danger-500" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Add modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setError(null); }} title="Tambah Webhook">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">URL *</label>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.zapier.com/..." className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">Secret (HMAC key) *</label>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="string acak rahasia" className={inputCls} />
            <p className="mt-1 text-[11px] text-gray-400">Header <code>X-Sentinel-Signature: sha256=...</code> dikirim ke URL untuk verifikasi.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 uppercase tracking-wider">Events *</label>
            <div className="grid grid-cols-2 gap-1.5">
              {allEvents.map((ev) => (
                <label key={ev} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} className="accent-sentinel-600" />
                  <span className="font-mono text-xs text-gray-700 dark:text-gray-200">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-danger-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowAdd(false); setError(null); }}>Batal</Button>
            <Button size="sm" onClick={handleAdd} disabled={adding}>{adding ? 'Menyimpan…' : 'Simpan'}</Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete modal */}
      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)} title="Hapus Webhook?">
        <div className="space-y-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Hapus endpoint <span className="font-mono text-xs">{confirmDelete?.url}</span>? Tindakan ini tidak dapat diurungkan.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant="danger" size="sm" onClick={() => confirmDelete && handleDelete(confirmDelete.id)} disabled={!!deleting}>Hapus</Button>
          </div>
        </div>
      </Modal>
    </AppLayout>
  );
}

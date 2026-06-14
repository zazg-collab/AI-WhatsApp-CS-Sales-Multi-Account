'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, History, CircleX } from 'lucide-react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, SelectField } from '@/components/ui/Field';

interface AuditEntry {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  oldValue: unknown;
  newValue: unknown;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

const PAGE_SIZE = 20;

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      setError(null);
      const params = new URLSearchParams();
      if (entity) params.set('entity', entity);
      if (action) params.set('action', action);
      if (from) params.set('from', new Date(from).toISOString());
      if (to) params.set('to', new Date(to + 'T23:59:59').toISOString());
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(p * PAGE_SIZE));
      const data = await api<{ data: AuditEntry[]; total: number }>(`/audit-logs?${params}`);
      setEntries(data.data);
      setTotal(data.total);
    } catch (e) {
      setEntries([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : 'Gagal memuat audit log — periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [entity, action, from, to]);

  useEffect(() => {
    setPage(0);
    load(0);
  }, [load]);

  function handlePageChange(p: number) {
    setPage(p);
    load(p);
  }

  const hasFilters = Boolean(entity || action || from || to);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppLayout>
      <PageHeader title="Audit Log" subtitle="Setiap tindakan terekam dan bisa ditelusuri lintas akun" />

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="w-40">
            <SelectField label="Entitas" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Semua entitas</option>
              <option value="message">message</option>
              <option value="conversation">conversation</option>
              <option value="customer">customer</option>
              <option value="bot">bot</option>
            </SelectField>
          </div>
          <div className="w-44">
            <Field
              label="Aksi"
              type="text"
              placeholder="Cari aksi…"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Field label="Dari tanggal" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-40">
            <Field label="Sampai tanggal" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {error && (
          <Card className="mb-4 flex items-start gap-2 border-danger-200 bg-danger-50 p-3 dark:border-danger-700/40 dark:bg-danger-900/20">
            <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
              <button
                onClick={() => load(page)}
                className="mt-1 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400"
              >
                Coba lagi
              </button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((n) => <div key={n} className="h-12 rounded animate-shimmer" />)}
          </div>
        ) : (
          <>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                    <th className="px-4 py-3 font-medium">Waktu</th>
                    <th className="px-4 py-3 font-medium">Pengguna</th>
                    <th className="px-4 py-3 font-medium">Aksi</th>
                    <th className="px-4 py-3 font-medium">Entitas</th>
                    <th className="px-4 py-3 font-medium">ID Entitas</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <History className="mx-auto mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {hasFilters ? 'Tidak ada aktivitas yang cocok' : 'Belum ada aktivitas tercatat'}
                        </p>
                        <p className="mt-1 text-[13px] text-gray-400">
                          {hasFilters
                            ? 'Longgarkan filter entitas, aksi, atau rentang tanggal lalu muat ulang.'
                            : 'Aktivitas admin dan sistem akan muncul di sini begitu ada perubahan.'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-500 dark:text-gray-400">
                          {new Date(e.createdAt).toLocaleString(undefined, {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                          {e.user ? (
                            <div>
                              <p className="font-medium">{e.user.name}</p>
                              <p className="text-xs text-gray-400">{e.user.email}</p>
                            </div>
                          ) : (
                            <span className="text-gray-400">sistem</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                            {e.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{e.entityType ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                          {e.entityId ? e.entityId.slice(0, 12) + '…' : '—'}
                        </td>
                        <td className="max-w-xs px-4 py-2.5">
                          {(e.newValue || e.oldValue) ? (
                            <pre className="scrollbar-thin max-h-20 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-1.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              {JSON.stringify(e.newValue ?? e.oldValue, null, 2)}
                            </pre>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </Card>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => handlePageChange(page - 1)} disabled={page === 0}>
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Sebelumnya
                </Button>
                <span className="text-xs text-gray-400">
                  Halaman {page + 1} / {totalPages} ({total} total)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Berikutnya
                  <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, History, CircleX } from 'lucide-react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

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

const inputClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-3 text-[13px] text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

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
      setError(e instanceof Error ? e.message : 'Gagal memuat audit log');
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppLayout>
      <PageHeader title="Audit Log" subtitle="Every action, traceable across accounts" />

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={entity} onChange={(e) => setEntity(e.target.value)} className={inputClass}>
            <option value="">All entities</option>
            <option value="message">message</option>
            <option value="conversation">conversation</option>
            <option value="customer">customer</option>
            <option value="bot">bot</option>
          </select>
          <input
            type="text"
            placeholder="Filter action…"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className={inputClass}
          />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-700/10 dark:text-danger-500">
            <CircleX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <>
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Entity</th>
                    <th className="px-4 py-3 font-medium">Entity ID</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center">
                        <History className="mx-auto mb-2 h-5 w-5 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
                        <p className="text-sm text-gray-400">No audit entries</p>
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => (
                      <tr
                        key={e.id}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40"
                      >
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-500 dark:text-gray-400">
                          {new Date(e.createdAt).toLocaleString('id', {
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
                            <span className="text-gray-400">system</span>
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
                  Prev
                </Button>
                <span className="text-xs text-gray-400">
                  Page {page + 1} / {totalPages} ({total} total)
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  Next
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

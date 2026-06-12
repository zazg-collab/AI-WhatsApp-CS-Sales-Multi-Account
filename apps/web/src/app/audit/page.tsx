'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

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

  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
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
    } catch {
      // ignore
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
      <div className="flex-1 overflow-y-auto p-6">
        <h1 className="mb-6 text-xl font-bold text-gray-100">Audit Log</h1>

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3">
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 outline-none"
          >
            <option value="">Semua Entity</option>
            <option value="message">message</option>
            <option value="conversation">conversation</option>
            <option value="customer">customer</option>
            <option value="bot">bot</option>
          </select>
          <input
            type="text"
            placeholder="Filter action..."
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 outline-none placeholder:text-gray-500"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 outline-none"
          />
          <span className="self-center text-xs text-gray-500">s/d</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-100 outline-none"
          />
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Memuat...</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 bg-gray-800 text-xs uppercase tracking-wider text-gray-400">
                    <th className="px-4 py-3 text-left">Waktu</th>
                    <th className="px-4 py-3 text-left">User</th>
                    <th className="px-4 py-3 text-left">Action</th>
                    <th className="px-4 py-3 text-left">Entity</th>
                    <th className="px-4 py-3 text-left">Entity ID</th>
                    <th className="px-4 py-3 text-left">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                        Tidak ada data
                      </td>
                    </tr>
                  ) : (
                    entries.map((e) => (
                      <tr key={e.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-400">
                          {new Date(e.createdAt).toLocaleString('id', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-gray-300">
                          {e.user ? (
                            <div>
                              <p className="font-medium">{e.user.name}</p>
                              <p className="text-xs text-gray-500">{e.user.email}</p>
                            </div>
                          ) : (
                            <span className="text-gray-600">system</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs font-mono text-emerald-400">
                            {e.action}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{e.entityType ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                          {e.entityId ? e.entityId.slice(0, 12) + '...' : '—'}
                        </td>
                        <td className="max-w-xs px-4 py-2.5">
                          {(e.newValue || e.oldValue) ? (
                            <pre className="max-h-20 overflow-auto whitespace-pre-wrap rounded bg-gray-900 p-1.5 text-xs text-gray-400">
                              {JSON.stringify(e.newValue ?? e.oldValue, null, 2)}
                            </pre>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page === 0}
                  className="rounded bg-gray-700 px-3 py-1 text-sm text-gray-100 disabled:opacity-40 hover:bg-gray-600"
                >
                  &larr; Prev
                </button>
                <span className="text-xs text-gray-400">
                  Halaman {page + 1} / {totalPages} ({total} total)
                </span>
                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                  className="rounded bg-gray-700 px-3 py-1 text-sm text-gray-100 disabled:opacity-40 hover:bg-gray-600"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

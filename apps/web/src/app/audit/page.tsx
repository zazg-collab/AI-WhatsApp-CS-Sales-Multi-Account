'use client';

import { useEffect, useState, useCallback } from 'react';
import { CaretLeft, CaretRight, ClockCounterClockwise, XCircle } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, SelectField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Audit Log', en: 'Audit Log' },
  subtitle: { id: 'Setiap tindakan terekam dan bisa ditelusuri lintas akun', en: 'Every action is recorded and traceable across accounts' },
  entitas: { id: 'Entitas', en: 'Entity' },
  semuaEntitas: { id: 'Semua entitas', en: 'All entities' },
  aksi: { id: 'Aksi', en: 'Action' },
  cariAksi: { id: 'Cari aksi…', en: 'Search action…' },
  dariTanggal: { id: 'Dari tanggal', en: 'From date' },
  sampaiTanggal: { id: 'Sampai tanggal', en: 'To date' },
  cobaLagi: { id: 'Coba lagi', en: 'Try again' },
  errLoad: { id: 'Gagal memuat audit log — periksa koneksi lalu coba lagi.', en: 'Failed to load the audit log — check your connection and try again.' },
  colWaktu: { id: 'Waktu', en: 'Time' },
  colPengguna: { id: 'Pengguna', en: 'User' },
  colEntitas: { id: 'Entitas', en: 'Entity' },
  colIdEntitas: { id: 'ID Entitas', en: 'Entity ID' },
  colData: { id: 'Data', en: 'Data' },
  noMatch: { id: 'Tidak ada aktivitas yang cocok', en: 'No matching activity' },
  noActivity: { id: 'Belum ada aktivitas tercatat', en: 'No activity recorded yet' },
  noMatchHint: { id: 'Longgarkan filter entitas, aksi, atau rentang tanggal lalu muat ulang.', en: 'Loosen the entity, action, or date-range filters and reload.' },
  noActivityHint: { id: 'Aktivitas admin dan sistem akan muncul di sini begitu ada perubahan.', en: 'Admin and system activity will appear here as soon as something changes.' },
  sistem: { id: 'sistem', en: 'system' },
  sebelumnya: { id: 'Sebelumnya', en: 'Previous' },
  berikutnya: { id: 'Berikutnya', en: 'Next' },
  pageInfo: { id: 'Halaman {page} / {total} ({count} total)', en: 'Page {page} / {total} ({count} total)' },
};

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
  const t = useT(dict);
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
      setError(e instanceof Error ? e.message : t('errLoad'));
    } finally {
      setLoading(false);
    }
  }, [entity, action, from, to, t]);

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
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="w-40">
            <SelectField label={t('entitas')} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">{t('semuaEntitas')}</option>
              <option value="message">message</option>
              <option value="conversation">conversation</option>
              <option value="customer">customer</option>
              <option value="bot">bot</option>
            </SelectField>
          </div>
          <div className="w-44">
            <Field
              label={t('aksi')}
              type="text"
              placeholder={t('cariAksi')}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Field label={t('dariTanggal')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-40">
            <Field label={t('sampaiTanggal')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {error && (
          <Card className="mb-4 flex items-start gap-2 border-danger-200 bg-danger-50 p-3 dark:border-danger-700/40 dark:bg-danger-900/20">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{error}</p>
              <button
                onClick={() => load(page)}
                className="mt-1 text-[13px] font-semibold text-danger-700 underline dark:text-danger-400"
              >
                {t('cobaLagi')}
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
                    <th className="px-4 py-3 font-medium">{t('colWaktu')}</th>
                    <th className="px-4 py-3 font-medium">{t('colPengguna')}</th>
                    <th className="px-4 py-3 font-medium">{t('aksi')}</th>
                    <th className="px-4 py-3 font-medium">{t('colEntitas')}</th>
                    <th className="px-4 py-3 font-medium">{t('colIdEntitas')}</th>
                    <th className="px-4 py-3 font-medium">{t('colData')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <ClockCounterClockwise className="mx-auto mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {hasFilters ? t('noMatch') : t('noActivity')}
                        </p>
                        <p className="mt-1 text-[13px] text-gray-400">
                          {hasFilters ? t('noMatchHint') : t('noActivityHint')}
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
                            <span className="text-gray-400">{t('sistem')}</span>
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
                  <CaretLeft className="h-4 w-4" aria-hidden="true" />
                  {t('sebelumnya')}
                </Button>
                <span className="text-xs text-gray-400">
                  {t('pageInfo', { page: page + 1, total: totalPages, count: total })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  {t('berikutnya')}
                  <CaretRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

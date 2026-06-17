'use client';

import { useEffect, useState } from 'react';
import {
  CaretLeft,
  CaretRight,
  ClockCounterClockwise,
  XCircle,
  Copy,
  Check,
  Warning,
  Trash,
  ShieldWarning,
} from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, SelectField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';
import { useApiQuery } from '@/lib/hooks/useApiQuery';

const dict: Dict = {
  title: { id: 'Audit Log', en: 'Audit Log' },
  subtitle: { id: 'Setiap tindakan terekam dan bisa ditelusuri lintas akun', en: 'Every action is recorded and traceable across accounts' },
  entitas: { id: 'Entitas', en: 'Entity' },
  semuaEntitas: { id: 'Semua entitas', en: 'All entities' },
  aksi: { id: 'Aksi', en: 'Action' },
  cariAksi: { id: 'Cari aksi…', en: 'Search action…' },
  dariTanggal: { id: 'Dari tanggal', en: 'From date' },
  sampaiTanggal: { id: 'Sampai tanggal', en: 'To date' },
  showDestructive: { id: 'Aksi berisiko saja', en: 'High-risk only' },
  cobaLagi: { id: 'Coba lagi', en: 'Try again' },
  errLoad: { id: 'Gagal memuat audit log — periksa koneksi lalu coba lagi.', en: 'Failed to load audit log — check your connection and try again.' },
  colWaktu: { id: 'Waktu', en: 'Time' },
  colPengguna: { id: 'Pengguna', en: 'User' },
  colAksi: { id: 'Aksi / Risiko', en: 'Action / Risk' },
  colEntitas: { id: 'Entitas', en: 'Entity' },
  colPerubahan: { id: 'Perubahan', en: 'Changes' },
  noMatch: { id: 'Tidak ada aktivitas yang cocok', en: 'No matching activity' },
  noActivity: { id: 'Belum ada aktivitas tercatat', en: 'No activity recorded yet' },
  noMatchHint: { id: 'Longgarkan filter entitas, aksi, atau rentang tanggal lalu muat ulang.', en: 'Loosen the entity, action, or date-range filters and reload.' },
  noActivityHint: { id: 'Aktivitas admin dan sistem akan muncul di sini begitu ada perubahan.', en: 'Admin and system activity will appear here as soon as something changes.' },
  sistem: { id: 'sistem', en: 'system' },
  sebelumnya: { id: 'Sebelumnya', en: 'Previous' },
  berikutnya: { id: 'Berikutnya', en: 'Next' },
  pageInfo: { id: 'Halaman {page} / {total} ({count} total)', en: 'Page {page} / {total} ({count} total)' },
  copied: { id: 'Disalin', en: 'Copied' },
  copyId: { id: 'Salin ID', en: 'Copy ID' },
  riskHigh: { id: 'Berisiko tinggi', en: 'High risk' },
  riskMedium: { id: 'Sedang', en: 'Medium' },
  noChanges: { id: 'Tidak ada perubahan data', en: 'No data changes' },
};

// ── Entity filter options — full list matching the backend ─────────────────────
const ENTITY_OPTIONS = [
  'message',
  'conversation',
  'customer',
  'bot',
  'persona',
  'account',
  'campaign',
  'knowledge_base',
  'knowledge_item',
  'user',
  'settings',
  'template',
  'asset',
  'product',
] as const;

// ── Risk classification by action name patterns ────────────────────────────────
type RiskLevel = 'high' | 'medium' | 'low';

function classifyRisk(action: string): RiskLevel {
  const a = action.toLowerCase();
  if (
    a.includes('delete') || a.includes('hapus') ||
    a.includes('ban') || a.includes('suspend') ||
    a.includes('approve') || a.includes('campaign') ||
    a.includes('password') || a.includes('role') ||
    a.includes('takeover') || a.includes('pause_ai')
  ) return 'high';
  if (
    a.includes('update') || a.includes('patch') ||
    a.includes('restart') || a.includes('toggle') ||
    a.includes('assign')
  ) return 'medium';
  return 'low';
}

function RiskBadge({ action }: { action: string }) {
  const risk = classifyRisk(action);
  if (risk === 'high') {
    return (
      <Badge tone="danger" className="ml-1 shrink-0">
        <Warning className="h-2.5 w-2.5" aria-hidden="true" />
        <span className="sr-only">High risk</span>
      </Badge>
    );
  }
  if (risk === 'medium') {
    return (
      <Badge tone="review" className="ml-1 shrink-0">
        <ShieldWarning className="h-2.5 w-2.5" aria-hidden="true" />
        <span className="sr-only">Medium risk</span>
      </Badge>
    );
  }
  return null;
}

// ── Field-level diff renderer ─────────────────────────────────────────────────
function DiffView({ oldValue, newValue }: { oldValue: unknown; newValue: unknown }) {
  const t = useT(dict);

  if (!oldValue && !newValue) {
    return <span className="text-[11px] text-gray-400">{t('noChanges')}</span>;
  }

  // If one side is a plain object, render key-level diffs
  if (
    typeof oldValue === 'object' && oldValue !== null &&
    typeof newValue === 'object' && newValue !== null &&
    !Array.isArray(oldValue) && !Array.isArray(newValue)
  ) {
    const oldObj = oldValue as Record<string, unknown>;
    const newObj = newValue as Record<string, unknown>;
    const keys = [...new Set([...Object.keys(oldObj), ...Object.keys(newObj)])];
    const changed = keys.filter((k) => JSON.stringify(oldObj[k]) !== JSON.stringify(newObj[k]));

    if (changed.length === 0) {
      return <span className="text-[11px] text-gray-400">{t('noChanges')}</span>;
    }

    return (
      <div className="space-y-1">
        {changed.map((key) => (
          <div key={key} className="flex flex-col gap-0.5 text-[11px]">
            <span className="font-medium text-gray-500">{key}</span>
            {key in oldObj && (
              <span className="rounded bg-danger-50 px-1.5 py-0.5 font-mono text-danger-700 line-through dark:bg-danger-900/20 dark:text-danger-400">
                {String(oldObj[key] ?? '')}
              </span>
            )}
            {key in newObj && (
              <span className="rounded bg-channel-50 px-1.5 py-0.5 font-mono text-channel-700 dark:bg-channel-900/20 dark:text-channel-400">
                {String(newObj[key] ?? '')}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Fallback: compact JSON
  const payload = newValue ?? oldValue;
  return (
    <pre className="scrollbar-thin max-h-20 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-1.5 text-[11px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      {JSON.stringify(payload, null, 2)}
    </pre>
  );
}

// ── Copyable entity ID ────────────────────────────────────────────────────────
function CopyableId({ id }: { id: string }) {
  const t = useT(dict);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <span
        title={id}
        className="max-w-[90px] truncate font-mono text-[11px] text-gray-400"
      >
        {id.slice(0, 8)}…
      </span>
      <button
        onClick={copy}
        title={t('copyId')}
        className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
      >
        {copied
          ? <Check className="h-3 w-3 text-channel-600" aria-hidden="true" />
          : <Copy className="h-3 w-3" aria-hidden="true" />}
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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
  const [page, setPage] = useState(0);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [highRiskOnly, setHighRiskOnly] = useState(false);

  // Build query string for audit logs
  const params = new URLSearchParams();
  if (entity) params.set('entity', entity);
  if (action) params.set('action', action);
  if (from) params.set('from', new Date(from).toISOString());
  if (to) params.set('to', new Date(to + 'T23:59:59').toISOString());
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(page * PAGE_SIZE));

  const { data, loading, error, refetch } = useApiQuery<{ data: AuditEntry[]; total: number }>(
    `/audit-logs?${params}`,
    [page, entity, action, from, to],
  );

  const entries = data ? (highRiskOnly ? data.data.filter((e) => classifyRisk(e.action) === 'high') : data.data) : [];
  const total = data?.total ?? 0;

  // Reset to the first page when filters change, so we don't request an
  // out-of-range offset against a freshly-filtered result set.
  useEffect(() => {
    setPage(0);
  }, [entity, action, from, to]);

  function handlePageChange(p: number) {
    setPage(p);
  }

  const hasFilters = Boolean(entity || action || from || to || highRiskOnly);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <div className="w-44">
            <SelectField label={t('entitas')} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">{t('semuaEntitas')}</option>
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
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
          <div className="w-36">
            <Field label={t('dariTanggal')} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-36">
            <Field label={t('sampaiTanggal')} type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="pb-0.5">
            <button
              onClick={() => setHighRiskOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-[7px] text-[13px] font-medium transition-colors ${
                highRiskOnly
                  ? 'border-danger-300 bg-danger-50 text-danger-700 dark:border-danger-700 dark:bg-danger-900/20 dark:text-danger-400'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <Trash className="h-3.5 w-3.5" aria-hidden="true" />
              {t('showDestructive')}
            </button>
          </div>
        </div>

        {error && (
          <Card className="mb-4 flex items-start gap-2 border-danger-200 bg-danger-50 p-3 dark:border-danger-700/40 dark:bg-danger-900/20">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger-600" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-danger-700 dark:text-danger-400">{t('errLoad')}</p>
              <p className="text-[12px] text-danger-600/80 dark:text-danger-400/80">{error}</p>
              <button
                onClick={() => refetch()}
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
                    <th className="px-4 py-3 font-medium">{t('colAksi')}</th>
                    <th className="px-4 py-3 font-medium">{t('colEntitas')}</th>
                    <th className="px-4 py-3 font-medium">{t('colPerubahan')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
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
                        className={`border-b border-gray-50 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/40 ${
                          classifyRisk(e.action) === 'high'
                            ? 'bg-danger-50/30 dark:bg-danger-900/10'
                            : ''
                        }`}
                      >
                        {/* Time */}
                        <td className="whitespace-nowrap px-4 py-2.5 text-[12px] text-gray-500 dark:text-gray-400">
                          {new Date(e.createdAt).toLocaleString(undefined, {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>

                        {/* User */}
                        <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                          {e.user ? (
                            <div>
                              <p className="text-[13px] font-medium">{e.user.name || e.user.email}</p>
                              {e.user.name && <p className="text-[11px] text-gray-400">{e.user.email}</p>}
                            </div>
                          ) : (
                            <span className="text-[12px] text-gray-400">{t('sistem')}</span>
                          )}
                        </td>

                        {/* Action + risk badge */}
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                              {e.action}
                            </span>
                            <RiskBadge action={e.action} />
                          </div>
                        </td>

                        {/* Entity type + copyable ID */}
                        <td className="px-4 py-2.5">
                          {e.entityType && (
                            <span className="text-[12px] text-gray-500 dark:text-gray-400">{e.entityType}</span>
                          )}
                          {e.entityId && (
                            <div className="mt-0.5">
                              <CopyableId id={e.entityId} />
                            </div>
                          )}
                          {!e.entityType && !e.entityId && (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>

                        {/* Field-level diff */}
                        <td className="max-w-[240px] px-4 py-2.5">
                          <DiffView oldValue={e.oldValue} newValue={e.newValue} />
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

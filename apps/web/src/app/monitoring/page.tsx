'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Performance Monitoring', en: 'Performance Monitoring' },
  subtitle: { id: 'Waktu respons, kualitas AI, pengiriman, dan volume pesan', en: 'Response time, AI quality, delivery, and message volume' },
  rangeLabel: { id: 'Rentang waktu', en: 'Time range' },
  range7: { id: '7 hari terakhir', en: 'Last 7 days' },
  range14: { id: '14 hari terakhir', en: 'Last 14 days' },
  range30: { id: '30 hari terakhir', en: 'Last 30 days' },
  range90: { id: '90 hari terakhir', en: 'Last 90 days' },
  errMetrics: { id: 'Gagal memuat metrik performa dari API.', en: 'Failed to load performance metrics from the API.' },
  errWorkload: { id: 'Gagal memuat beban kerja admin dari API.', en: 'Failed to load admin workload from the API.' },
  metricsCantLoad: { id: 'Metrik tidak dapat dimuat. Periksa koneksi API lalu coba lagi.', en: 'Metrics could not be loaded. Check the API connection and try again.' },
  cobaLagi: { id: 'Coba lagi', en: 'Try again' },
  messages: { id: 'Messages', en: 'Messages' },
  lastDays: { id: '{n} hari terakhir', en: 'Last {n} days' },
  conversations: { id: 'Percakapan', en: 'Conversations' },
  customers: { id: 'Pelanggan', en: 'Customers' },
  avgResponse: { id: 'Rata-rata respons', en: 'Avg. response' },
  samples: { id: '{n} sampel', en: '{n} samples' },
  responseP95: { id: 'Respons P95', en: 'P95 response' },
  slaHint: { id: 'SLA respons admin', en: 'Admin response SLA' },
  aiConfidence: { id: 'Keyakinan AI', en: 'AI confidence' },
  riskHint: { id: 'Risiko {n}%', en: 'Risk {n}%' },
  messageVolume: { id: 'Volume pesan', en: 'Message volume' },
  noMessages: { id: 'Belum ada pesan pada rentang ini.', en: 'No messages in this range yet.' },
  aiQuality: { id: 'Kualitas AI', en: 'AI quality' },
  hermesReviews: { id: 'Review Hermes', en: 'Hermes reviews' },
  fallbackRate: { id: 'Tingkat fallback', en: 'Fallback rate' },
  fallbackHint: { id: '{n} balasan dilempar ke admin', en: '{n} replies handed off to admin' },
  hermesDecisions: { id: 'Keputusan Hermes', en: 'Hermes decisions' },
  riskLevels: { id: 'Tingkat risiko', en: 'Risk levels' },
  campaignDelivery: { id: 'Pengiriman kampanye', en: 'Campaign delivery' },
  campaigns: { id: 'Kampanye', en: 'Campaigns' },
  recipients: { id: 'Penerima', en: 'Recipients' },
  succeeded: { id: 'Berhasil', en: 'Succeeded' },
  sentHint: { id: '{n} terkirim', en: '{n} sent' },
  failed: { id: 'Gagal', en: 'Failed' },
  failedHint: { id: '{n} gagal', en: '{n} failed' },
  csat: { id: 'Customer satisfaction (CSAT)', en: 'Customer satisfaction (CSAT)' },
  avgScore: { id: 'Skor rata-rata', en: 'Avg. score' },
  responsesHint: { id: '{n} respons', en: '{n} responses' },
  responseRate: { id: 'Tingkat respons', en: 'Response rate' },
  requestedHint: { id: '{n} diminta', en: '{n} requested' },
  totalResponses: { id: 'Total respons', en: 'Total responses' },
  topAccounts: { id: 'Akun teraktif', en: 'Most active accounts' },
  noAccountActivity: { id: 'Belum ada aktivitas akun pada rentang ini.', en: 'No account activity in this range yet.' },
  messagesUnit: { id: '{n} pesan', en: '{n} messages' },
  recentCampaigns: { id: 'Kampanye terbaru', en: 'Recent campaigns' },
  noCampaigns: { id: 'Belum ada kampanye yang dijalankan.', en: 'No campaigns have been run yet.' },
  adminWorkload: { id: 'Admin workload — {n} hari terakhir', en: 'Admin workload — last {n} days' },
  noAdmins: { id: 'Belum ada admin terdaftar.', en: 'No admins registered yet.' },
  colAdmin: { id: 'Admin', en: 'Admin' },
  colAssigned: { id: 'Ditugaskan', en: 'Assigned' },
  colResolved: { id: 'Selesai', en: 'Resolved' },
  colMessagesSent: { id: 'Pesan terkirim', en: 'Messages sent' },
  colAvgReply: { id: 'Rata-rata balas', en: 'Avg. reply' },
  secs: { id: '{n} dtk', en: '{n} sec' },
  minsSecs: { id: '{m} mnt {s} dtk', en: '{m} min {s} sec' },
};

interface PerformanceOverview {
  rangeDays: number;
  totals: { messages: number; conversations: number; customers: number };
  response: { avgSeconds: number; p95Seconds: number; sampleSize: number };
  aiQuality: {
    reviewCount: number;
    avgConfidence: number;
    avgRisk: number;
    fallbackCount: number;
    fallbackRate: number;
    decisions: Record<string, number>;
    riskLevels: Record<string, number>;
  };
  campaign: {
    campaignCount: number;
    totalRecipients: number;
    sent: number;
    failed: number;
    successRate: number;
    failureRate: number;
    byStatus: Record<string, number>;
    recentCampaigns: { id: string; name: string; status: string; recipients: number; createdAt: string }[];
  };
  messageVolume: { date: string; count: number }[];
  topAccounts: { id: string; name: string; messageCount: number }[];
  csat?: {
    responses: number;
    requested: number;
    responseRate: number;
    avgScore: number;
    distribution: Record<string, number>;
  };
}

interface AdminWorkload {
  rangeDays: number;
  admins: {
    id: string;
    name: string;
    role: string;
    assigned: number;
    resolved: number;
    messagesSent: number;
    avgResponseSeconds: number;
    responseSamples: number;
  }[];
}

function formatDuration(seconds: number, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (seconds < 60) return t('secs', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return t('minsSecs', { m: minutes, s: rest });
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </Card>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {children}
    </Card>
  );
}

function KeyVals({ data }: { data: Record<string, number> }) {
  return (
    <>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex justify-between border-b border-gray-50 py-1 text-sm last:border-0 dark:border-gray-800/60">
          <span className="text-gray-500 dark:text-gray-400">{key}</span>
          <span className="tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
        </div>
      ))}
    </>
  );
}

export default function MonitoringPage() {
  const t = useT(dict);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<PerformanceOverview | null>(null);
  const [workload, setWorkload] = useState<AdminWorkload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workloadError, setWorkloadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setData(await api<PerformanceOverview>(`/dashboard/performance?days=${days}`));
      } catch (err) {
        setError(err instanceof Error ? err.message : t('errMetrics'));
      } finally {
        setLoading(false);
      }
      setWorkloadError(null);
      try {
        setWorkload(await api<AdminWorkload>(`/dashboard/admin-workload?days=${days}`));
      } catch (err) {
        setWorkload(null);
        setWorkloadError(err instanceof Error ? err.message : t('errWorkload'));
      }
    }
    load();
  }, [days, t]);

  const maxVolume = Math.max(...(data?.messageVolume.map((item) => item.count) ?? [1]), 1);

  return (
    <AppLayout>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      >
        <label htmlFor="range-select" className="sr-only">
          {t('rangeLabel')}
        </label>
        <select
          id="range-select"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-8 rounded-md border border-gray-300 bg-white px-2.5 text-[13px] text-gray-700 focus:border-hermes-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <option value={7}>{t('range7')}</option>
          <option value={14}>{t('range14')}</option>
          <option value={30}>{t('range30')}</option>
          <option value={90}>{t('range90')}</option>
        </select>
      </PageHeader>

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-[76px] rounded animate-shimmer" />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {[1, 2].map((n) => (
                <div key={n} className="h-64 rounded animate-shimmer" />
              ))}
            </div>
          </div>
        ) : error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <p className="mt-1 text-xs text-danger-600/80 dark:text-danger-400/80">
              {t('metricsCantLoad')}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setDays((d) => d)}>
              {t('cobaLagi')}
            </Button>
          </Card>
        ) : data && (
          <div className="space-y-5">
            {workloadError && (
              <p className="rounded-lg border border-review-200 bg-review-50 p-4 text-sm text-review-700 dark:border-review-700/40 dark:bg-review-900/20 dark:text-review-400">
                {workloadError}
              </p>
            )}
            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard label={t('messages')} value={data.totals.messages} hint={t('lastDays', { n: data.rangeDays })} />
              <MetricCard label={t('conversations')} value={data.totals.conversations} />
              <MetricCard label={t('customers')} value={data.totals.customers} />
              <MetricCard label={t('avgResponse')} value={formatDuration(data.response.avgSeconds, t)} hint={t('samples', { n: data.response.sampleSize })} />
              <MetricCard label={t('responseP95')} value={formatDuration(data.response.p95Seconds, t)} hint={t('slaHint')} />
              <MetricCard label={t('aiConfidence')} value={`${data.aiQuality.avgConfidence}%`} hint={t('riskHint', { n: data.aiQuality.avgRisk })} />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Panel title={t('messageVolume')}>
                {data.messageVolume.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('noMessages')}</p>
                ) : (
                <div className="flex h-56 items-end gap-2">
                  {data.messageVolume.map((item) => (
                    <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t bg-hermes-600"
                        style={{ height: `${Math.max(4, (item.count / maxVolume) * 190)}px` }}
                        title={`${item.date}: ${item.count}`}
                      />
                      <span className="text-[10px] text-gray-400">{item.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
                )}
              </Panel>

              <Panel title={t('aiQuality')}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard label={t('hermesReviews')} value={data.aiQuality.reviewCount} />
                  <MetricCard label={t('fallbackRate')} value={`${data.aiQuality.fallbackRate}%`} hint={t('fallbackHint', { n: data.aiQuality.fallbackCount })} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-medium text-gray-500">{t('hermesDecisions')}</div>
                    <KeyVals data={data.aiQuality.decisions} />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-gray-500">{t('riskLevels')}</div>
                    <KeyVals data={data.aiQuality.riskLevels} />
                  </div>
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Panel title={t('campaignDelivery')}>
                <div className="grid gap-3 sm:grid-cols-4">
                  <MetricCard label={t('campaigns')} value={data.campaign.campaignCount} />
                  <MetricCard label={t('recipients')} value={data.campaign.totalRecipients} />
                  <MetricCard label={t('succeeded')} value={`${data.campaign.successRate}%`} hint={t('sentHint', { n: data.campaign.sent })} />
                  <MetricCard label={t('failed')} value={`${data.campaign.failureRate}%`} hint={t('failedHint', { n: data.campaign.failed })} />
                </div>
                <div className="mt-4">
                  <KeyVals data={data.campaign.byStatus} />
                </div>
              </Panel>

              {data.csat && (
                <Panel title={t('csat')}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard label={t('avgScore')} value={`${data.csat.avgScore} / 5`} hint={t('responsesHint', { n: data.csat.responses })} />
                    <MetricCard label={t('responseRate')} value={`${data.csat.responseRate}%`} hint={t('requestedHint', { n: data.csat.requested })} />
                    <MetricCard label={t('totalResponses')} value={data.csat.responses} />
                  </div>
                  <div className="mt-4 space-y-1">
                    {[5, 4, 3, 2, 1].map((score) => {
                      const count = data.csat!.distribution[String(score)] ?? 0;
                      const pct = data.csat!.responses > 0 ? Math.round((count / data.csat!.responses) * 100) : 0;
                      return (
                        <div key={score} className="flex items-center gap-2 text-sm">
                          <span className="flex w-10 items-center gap-0.5 tabular-nums text-gray-500">
                            {score}
                            <Star className="h-3.5 w-3.5 text-review-500" strokeWidth={1.75} aria-hidden="true" />
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className="h-full bg-review-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-10 text-right tabular-nums text-gray-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              <Panel title={t('topAccounts')}>
                {data.topAccounts.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('noAccountActivity')}</p>
                ) : (
                  data.topAccounts.map((account) => (
                    <div key={account.id} className="flex justify-between border-b border-gray-50 py-2 text-sm last:border-0 dark:border-gray-800/60">
                      <span className="text-gray-700 dark:text-gray-300">{account.name}</span>
                      <span className="tabular-nums text-gray-900 dark:text-gray-100">{t('messagesUnit', { n: account.messageCount })}</span>
                    </div>
                  ))
                )}
              </Panel>
            </section>

            <Panel title={t('recentCampaigns')}>
              {data.campaign.recentCampaigns.length === 0 ? (
                <p className="text-sm text-gray-400">{t('noCampaigns')}</p>
              ) : (
                data.campaign.recentCampaigns.map((campaign) => (
                  <div key={campaign.id} className="grid grid-cols-[1fr_140px_100px] gap-3 border-b border-gray-50 py-2 text-sm last:border-0 dark:border-gray-800/60">
                    <span className="text-gray-700 dark:text-gray-300">{campaign.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{campaign.status}</span>
                    <span className="text-right tabular-nums text-gray-900 dark:text-gray-100">{campaign.recipients}</span>
                  </div>
                ))
              )}
            </Panel>

            {Array.isArray(workload?.admins) && (
              <Panel title={t('adminWorkload', { n: workload!.rangeDays })}>
                {workload!.admins.length === 0 ? (
                  <p className="text-sm text-gray-400">{t('noAdmins')}</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                          <th className="py-2 pr-3 font-medium">{t('colAdmin')}</th>
                          <th className="py-2 pr-3 text-right font-medium">{t('colAssigned')}</th>
                          <th className="py-2 pr-3 text-right font-medium">{t('colResolved')}</th>
                          <th className="py-2 pr-3 text-right font-medium">{t('colMessagesSent')}</th>
                          <th className="py-2 text-right font-medium">{t('colAvgReply')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workload!.admins.map((a) => (
                          <tr key={a.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                            <td className="py-2 pr-3">
                              <span className="text-gray-800 dark:text-gray-200">{a.name}</span>
                              <span className="ml-2 text-xs text-gray-400">{a.role}</span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.assigned}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.resolved}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.messagesSent}</td>
                            <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                              {a.responseSamples > 0 ? formatDuration(a.avgResponseSeconds, t) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            )}
          </div>
        )}
      </main>
    </AppLayout>
  );
}

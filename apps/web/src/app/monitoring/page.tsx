'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Star, ChartLineUp } from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useT } from '@/lib/i18n';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { dict } from './monitoring.i18n';

interface PerformanceOverview {
  rangeDays: number;
  totals: { messages: number; conversations: number; customers: number };
  response: { avgSeconds: number; p95Seconds: number; sampleSize: number };
  aiQuality: { reviewCount: number; avgConfidence: number; avgRisk: number; fallbackCount: number; fallbackRate: number; decisions: Record<string, number>; riskLevels: Record<string, number> };
  campaign: { campaignCount: number; totalRecipients: number; sent: number; failed: number; successRate: number; failureRate: number; byStatus: Record<string, number>; recentCampaigns: { id: string; name: string; status: string; recipients: number; createdAt: string }[] };
  messageVolume: { date: string; count: number }[];
  topAccounts: { id: string; name: string; messageCount: number }[];
  csat?: { responses: number; requested: number; responseRate: number; avgScore: number; distribution: Record<string, number> };
}

interface AdminWorkload {
  rangeDays: number;
  admins: { id: string; name: string; role: string; assigned: number; resolved: number; messagesSent: number; avgResponseSeconds: number; responseSamples: number }[];
}

function formatDuration(seconds: number, t: (key: string, vars?: Record<string, string | number>) => string) {
  if (seconds < 60) return t('secs', { n: seconds });
  return t('minsSecs', { m: Math.floor(seconds / 60), s: seconds % 60 });
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

  const { data, loading, error, refetch } = useApiQuery<PerformanceOverview>(`/dashboard/performance?days=${days}`, [days]);
  const { data: workload, error: workloadError } = useApiQuery<AdminWorkload>(`/dashboard/admin-workload?days=${days}`, [days]);

  const maxVolume = Math.max(...(data?.messageVolume.map((item) => item.count) ?? [1]), 1);

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Link href="/analytics"><Button variant="outline" size="sm"><ChartLineUp className="h-4 w-4" aria-hidden="true" />{t('viewAnalytics')}</Button></Link>
        <label htmlFor="range-select" className="sr-only">{t('rangeLabel')}</label>
        <select id="range-select" value={days} onChange={(e) => setDays(Number(e.target.value))} className="h-8 rounded-md border border-gray-300 bg-white px-2.5 text-[13px] text-gray-700 focus:border-hermes-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
          <option value={7}>{t('range7')}</option>
          <option value={14}>{t('range14')}</option>
          <option value={30}>{t('range30')}</option>
          <option value={90}>{t('range90')}</option>
        </select>
      </PageHeader>

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{[1,2,3,4,5,6].map((n) => <div key={n} className="h-[76px] rounded animate-shimmer" />)}</div>
            <div className="grid gap-4 xl:grid-cols-2">{[1,2].map((n) => <div key={n} className="h-64 rounded animate-shimmer" />)}</div>
          </div>
        ) : error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <p className="mt-1 text-xs text-danger-600/80 dark:text-danger-400/80">{t('metricsCantLoad')}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={refetch}>{t('cobaLagi')}</Button>
          </Card>
        ) : data && (
          <div className="space-y-5">
            {workloadError && <p className="rounded-lg border border-review-200 bg-review-50 p-4 text-sm text-review-700 dark:border-review-700/40 dark:bg-review-900/20 dark:text-review-400">{workloadError}</p>}
            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard label={t('messages')} value={data.totals.messages} hint={t('lastDays', { n: data.rangeDays })} />
              <MetricCard label={t('conversations')} value={data.totals.conversations} />
              <MetricCard label={t('customers')} value={data.totals.customers} />
              <MetricCard label={t('avgResponse')} value={formatDuration(data.response.avgSeconds, t)} hint={t('samples', { n: data.response.sampleSize })} />
              <MetricCard label={t('responseP95')} value={formatDuration(data.response.p95Seconds, t)} hint={t('slaHint')} />
              <MetricCard
                label={t('aiConfidence')}
                value={data.aiQuality.reviewCount > 0 ? `${data.aiQuality.avgConfidence}%` : '—'}
                hint={data.aiQuality.reviewCount > 0 ? t('riskHint', { n: data.aiQuality.avgRisk }) : t('noReviews')}
              />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Panel title={t('messageVolume')}>
                {data.messageVolume.length === 0 ? <p className="text-sm text-gray-400">{t('noMessages')}</p> : (
                  <div className="flex h-56 items-end gap-2">
                    {data.messageVolume.map((item) => (
                      <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                        <div className="w-full rounded-t bg-hermes-600" style={{ height: `${Math.max(4, (item.count / maxVolume) * 190)}px` }} title={`${item.date}: ${item.count}`} />
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
                  <div><div className="mb-2 text-xs font-medium text-gray-500">{t('hermesDecisions')}</div><KeyVals data={data.aiQuality.decisions} /></div>
                  <div><div className="mb-2 text-xs font-medium text-gray-500">{t('riskLevels')}</div><KeyVals data={data.aiQuality.riskLevels} /></div>
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
                <div className="mt-4"><KeyVals data={data.campaign.byStatus} /></div>
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
                          <span className="flex w-10 items-center gap-0.5 tabular-nums text-gray-500">{score}<Star className="h-3.5 w-3.5 text-review-500" aria-hidden="true" /></span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full bg-review-500" style={{ width: `${pct}%` }} /></div>
                          <span className="w-10 text-right tabular-nums text-gray-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              <Panel title={t('topAccounts')}>
                {data.topAccounts.length === 0 ? <p className="text-sm text-gray-400">{t('noAccountActivity')}</p> : (
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
              {data.campaign.recentCampaigns.length === 0 ? <p className="text-sm text-gray-400">{t('noCampaigns')}</p> : (
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
                {workload!.admins.length === 0 ? <p className="text-sm text-gray-400">{t('noAdmins')}</p> : (
                  <>
                    {/* Desktop / tablet: data table */}
                    <div className="hidden overflow-x-auto sm:block">
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
                              <td className="py-2 pr-3"><span className="text-gray-800 dark:text-gray-200">{a.name}</span><span className="ml-2 text-xs text-gray-400">{a.role}</span></td>
                              <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.assigned}</td>
                              <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.resolved}</td>
                              <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.messagesSent}</td>
                              <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.responseSamples > 0 ? formatDuration(a.avgResponseSeconds, t) : '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile: card list */}
                    <div className="space-y-2 sm:hidden">
                      {workload!.admins.map((a) => (
                        <div key={a.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-gray-800 dark:text-gray-200">{a.name}</span>
                            <span className="text-xs text-gray-400">{a.role}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-gray-600 dark:text-gray-300">
                            <span className="flex justify-between"><span className="text-gray-400">{t('colAssigned')}</span><span className="tabular-nums">{a.assigned}</span></span>
                            <span className="flex justify-between"><span className="text-gray-400">{t('colResolved')}</span><span className="tabular-nums">{a.resolved}</span></span>
                            <span className="flex justify-between"><span className="text-gray-400">{t('colMessagesSent')}</span><span className="tabular-nums">{a.messagesSent}</span></span>
                            <span className="flex justify-between"><span className="text-gray-400">{t('colAvgReply')}</span><span className="tabular-nums">{a.responseSamples > 0 ? formatDuration(a.avgResponseSeconds, t) : '-'}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Panel>
            )}
          </div>
        )}
      </main>
    </AppLayout>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DownloadSimple, Pulse } from '@/components/ui/core-essential-icons';
import { downloadFile } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useT } from '@/lib/i18n';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { dict } from './analytics.i18n';
import { ClosingAnalytics } from './ClosingAnalytics';

const MODE_LABEL_KEY: Record<string, string> = {
  ai_on: 'modeAiOn', ai_off: 'modeAiOff', ai_draft: 'modeAiDraft',
  ai_supervised: 'modeAiSupervised', ai_paused: 'modeAiPaused',
};

interface Summary {
  totalConversations: number; activeConversations: number; aiOnConversations: number;
  pendingFollowUps: number; messagesLast24h: number; avgResponseTime: number;
  avgResolutionSeconds: number | null; totalReopened: number; reopenWindowDays: number;
  topAccounts: { id: string; name: string; messageCount: number }[];
}
interface SentimentTrendItem { day: string; avg_score: number; positive: number; neutral: number; negative: number; }
interface FrtByAccountItem { accountId: string; accountName: string; avg_seconds: number; sample: number; }
interface ReopenRateItem { accountId: string; accountName: string; total: number; reopened: number; rate: number; }
interface LeadFunnelItem { stage: string; count: number; }
interface MessageVolumeItem { date: string; count: number; }
interface AiModeItem { mode: string; count: number; percentage: number; }

async function exportCsv(path: string, filename: string) {
  const blob = await downloadFile(path);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AnalyticsPage() {
  const t = useT(dict);
  const [daysRange, setDaysRange] = useState(7);

  const { data: summary, loading } = useApiQuery<Summary>(`/dashboard/summary?days=${daysRange}`, [daysRange]);
  const { data: leadFunnel } = useApiQuery<LeadFunnelItem[]>('/dashboard/lead-funnel');
  const { data: messageVolume } = useApiQuery<MessageVolumeItem[]>(`/dashboard/message-volume?days=${daysRange}`, [daysRange]);
  const { data: aiModeBreakdown } = useApiQuery<AiModeItem[]>('/dashboard/ai-mode-breakdown');
  const { data: sentimentTrend } = useApiQuery<{ trend: SentimentTrendItem[] }>(`/dashboard/sentiment-trend?days=${daysRange}`, [daysRange]);
  const { data: frtByAccount } = useApiQuery<{ accounts: FrtByAccountItem[] }>(`/dashboard/frt-by-account?days=${daysRange}`, [daysRange]);
  const { data: reopenRate } = useApiQuery<{ accounts: ReopenRateItem[] }>(`/dashboard/reopen-rate?days=${daysRange}`, [daysRange]);

  const error = !summary && !(leadFunnel?.length) && !(messageVolume?.length) && !(aiModeBreakdown?.length) ? t('errLoad') : null;

  const maxVolume = Math.max(...(messageVolume?.map((d) => d.count) ?? [1]), 1);

  const leadColors: Record<string, string> = {
    cold: 'bg-sentinel-400', warm: 'bg-review-500', hot: 'bg-review-600', very_hot: 'bg-danger-500',
  };
  const leadColorLabels: Record<string, string> = { cold: 'Cold', warm: 'Warm', hot: 'Hot', very_hot: 'Very Hot' };
  const modeColors: Record<string, string> = {
    ai_on: 'bg-channel-500', ai_off: 'bg-gray-300 dark:bg-gray-600',
    ai_draft: 'bg-review-500', ai_supervised: 'bg-sentinel-500', ai_paused: 'bg-danger-500',
  };

  const leadTotal = (leadFunnel ?? []).reduce((s, i) => s + i.count, 0);
  const dominantLead = (leadFunnel ?? []).reduce<LeadFunnelItem | null>((best, item) => (!best || item.count > best.count ? item : best), null);
  const hotCount = (leadFunnel ?? []).filter((i) => i.stage === 'hot' || i.stage === 'very_hot').reduce((s, i) => s + i.count, 0);
  const leadFunnelInterpretation = leadTotal === 0 ? t('leadFunnelEmpty') : t('leadFunnelInterpretation', {
    pct: String(dominantLead ? Math.round((dominantLead.count / leadTotal) * 100) : 0),
    stage: dominantLead ? (leadColorLabels[dominantLead.stage] ?? dominantLead.stage) : '',
    hotPct: String(Math.round((hotCount / leadTotal) * 100)), hotCount: String(hotCount),
  });
  const coldCount = (leadFunnel ?? []).find((i) => i.stage === 'cold')?.count ?? 0;
  const leadNextActions = leadTotal === 0 ? [] : [
    coldCount > 0 ? t('leadActionNurtureCold', { count: String(coldCount) }) : null,
    hotCount > 0 ? t('leadActionAssignHot', { count: String(hotCount) }) : t('leadActionNoHot'),
  ].filter((x): x is string => !!x);

  const modeTotal = (aiModeBreakdown ?? []).reduce((s, i) => s + i.count, 0);
  const dominantMode = (aiModeBreakdown ?? []).reduce<AiModeItem | null>((best, item) => (!best || item.count > best.count ? item : best), null);
  const aiModeInterpretation = modeTotal === 0 ? t('aiModeEmpty') : t('aiModeInterpretation', {
    pct: String(dominantMode?.percentage ?? 0),
    mode: dominantMode ? (MODE_LABEL_KEY[dominantMode.mode] ? t(MODE_LABEL_KEY[dominantMode.mode]) : dominantMode.mode) : '',
  });
  const pausedCount = (aiModeBreakdown ?? []).find((i) => i.mode === 'ai_paused')?.count ?? 0;
  const offPct = (aiModeBreakdown ?? []).find((i) => i.mode === 'ai_off')?.percentage ?? 0;
  const aiModeNextActions = modeTotal === 0 ? [] : [
    pausedCount > 0 ? t('aiModeActionPaused', { count: String(pausedCount) }) : null,
    dominantMode?.mode === 'ai_off' && offPct > 50 ? t('aiModeActionOffDominant', { pct: String(offPct) }) : t('aiModeActionSupervisedHealthy'),
  ].filter((x): x is string => !!x);

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Link href="/monitoring"><Button variant="outline" size="sm"><Pulse className="h-4 w-4" aria-hidden="true" />{t('viewMonitoring')}</Button></Link>
        <Button variant="outline" size="sm" onClick={() => exportCsv('/customers/export', 'customers.csv')}><DownloadSimple className="h-4 w-4" aria-hidden="true" />{t('exportCustomers')}</Button>
        <Button variant="outline" size="sm" onClick={() => exportCsv('/conversations/export', 'conversations.csv')}><DownloadSimple className="h-4 w-4" aria-hidden="true" />{t('exportConversations')}</Button>
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        <div className="mb-6 flex flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{t('filterDateRange')}</span>
            {[{ label: t('filter7d'), value: 7 }, { label: t('filter30d'), value: 30 }, { label: t('filter90d'), value: 90 }].map(({ label, value }) => (
              <button key={value} onClick={() => setDaysRange(value)} className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${daysRange === value ? 'bg-sentinel-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}>{label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{[1,2,3,4,5,6].map((n) => <div key={n} className="h-[72px] rounded animate-shimmer" />)}</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{[1,2,3,4].map((n) => <div key={n} className="h-48 rounded animate-shimmer" />)}</div>
          </div>
        ) : error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <p className="mt-1 text-xs text-danger-600/80 dark:text-danger-400/80">{t('errLoadHint')}</p>
          </Card>
        ) : (
          <>
            {summary && (
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                <SummaryCard label={t('totalConversations')} value={summary.totalConversations} />
                <SummaryCard label={t('waitingAdmin')} value={summary.activeConversations} tone="text-review-600" />
                <SummaryCard label={t('aiActive')} value={summary.aiOnConversations} tone="text-channel-700" />
                <SummaryCard label={t('pendingFollowUps')} value={summary.pendingFollowUps} tone="text-review-600" />
                <SummaryCard label={t('messages24h')} value={summary.messagesLast24h} tone="text-sentinel-600" />
                <SummaryCard label={t('avgResponseTime')} value={summary.avgResponseTime} formatted={formatResponseTime(summary.avgResponseTime)} tone="text-sentinel-600" />
                <SummaryCard
                  label={t('avgResolution')}
                  value={summary.avgResolutionSeconds ?? 0}
                  formatted={summary.avgResolutionSeconds ? formatResponseTime(summary.avgResolutionSeconds) : '–'}
                  tone="text-channel-700"
                />
                <SummaryCard
                  label={t('reopenRange', { days: String(summary.reopenWindowDays) })}
                  value={summary.totalReopened}
                  tone={summary.totalReopened > 0 ? 'text-review-600' : 'text-gray-500'}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <Panel title={t('leadFunnel')}>
                  {(leadFunnel?.length ?? 0) === 0 ? <Empty t={t} /> : (
                    <div className="space-y-3">
                      {leadFunnel?.map((item) => {
                        const total = leadFunnel.reduce((s, i) => s + i.count, 0);
                        const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                        return <Bar key={item.stage} label={item.stage.replace('_', ' ').toUpperCase()} meta={`${item.count} (${pct}%)`} pct={pct} color={leadColors[item.stage] ?? 'bg-gray-300 dark:bg-gray-600'} />;
                      })}
                      <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
                        <p className="mb-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400">{t('legend')}</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {Object.entries(leadColorLabels).map(([key, label]) => (
                            <div key={key} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${leadColors[key]}`} /><span className="text-gray-600 dark:text-gray-400">{label}</span></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
              <div className="lg:col-span-2">
                <Card className="h-full p-5">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('interpretation')}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{leadFunnelInterpretation}</p>
                  {leadNextActions.length > 0 && (
                    <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <h4 className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">{t('nextAction')}</h4>
                      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">{leadNextActions.map((action, i) => <li key={i}>• {action}</li>)}</ul>
                    </div>
                  )}
                </Card>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="lg:col-span-1">
                <Panel title={t('aiModeDistribution')}>
                  {(aiModeBreakdown?.length ?? 0) === 0 ? <Empty t={t} /> : (
                    <div className="space-y-3">
                      {aiModeBreakdown?.map((item) => (
                        <Bar key={item.mode} label={MODE_LABEL_KEY[item.mode] ? t(MODE_LABEL_KEY[item.mode]) : item.mode} meta={`${item.count} (${item.percentage}%)`} pct={item.percentage} color={modeColors[item.mode] ?? 'bg-gray-300 dark:bg-gray-600'} />
                      ))}
                      <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-700">
                        <p className="mb-2 text-[10px] font-semibold text-gray-500 dark:text-gray-400">{t('legend')}</p>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          {[['bg-channel-500','AI ON'],['bg-gray-300 dark:bg-gray-600','AI OFF'],['bg-review-500','Draft'],['bg-sentinel-500','Supervised'],['bg-danger-500','Paused']].map(([cls,label]) => (
                            <div key={label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-sm ${cls}`} /><span className="text-gray-600 dark:text-gray-400">{label}</span></div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </Panel>
              </div>
              <div className="lg:col-span-2">
                <Card className="h-full p-5">
                  <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{t('interpretation')}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{aiModeInterpretation}</p>
                  {aiModeNextActions.length > 0 && (
                    <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                      <h4 className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-400">{t('nextAction')}</h4>
                      <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-400">{aiModeNextActions.map((action, i) => <li key={i}>• {action}</li>)}</ul>
                    </div>
                  )}
                </Card>
              </div>
            </div>

            <Panel title={t('messageVolumeRange', { days: String(daysRange) })}>
              {!(messageVolume?.length) ? <Empty t={t} /> : (
                <div className="flex h-40 items-end gap-2">
                  {(messageVolume ?? []).map((item) => {
                    const heightPct = Math.round((item.count / maxVolume) * 100);
                    const dayLabel = new Date(item.date + 'T00:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
                    return (
                      <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-xs tabular-nums text-gray-500">{item.count}</span>
                        <div className="flex w-full flex-col justify-end" style={{ height: '100px' }}>
                          <div className="w-full rounded-t bg-sentinel-600" style={{ height: `${Math.max(heightPct, item.count > 0 ? 4 : 0)}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">{dayLabel}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            {summary && summary.topAccounts.length > 0 && (
              <Panel title={t('topAccounts7d')}>
                <div className="space-y-1">
                  {summary.topAccounts.map((acc, i) => (
                    <div key={acc.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <span className="w-5 text-center text-xs tabular-nums text-gray-400">{i + 1}</span>
                      <span className="flex-1 text-gray-800 dark:text-gray-200">{acc.name}</span>
                      <span className="tabular-nums text-gray-500 dark:text-gray-400">{t('messagesUnit', { n: acc.messageCount })}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* First Response Time per account */}
            {frtByAccount?.accounts && frtByAccount.accounts.length > 0 && (
              <Panel title={t('frtByAccount')}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                      <th className="pb-2 font-medium">{t('colAccount')}</th>
                      <th className="pb-2 font-medium text-right">{t('colAvgFrt')}</th>
                      <th className="pb-2 font-medium text-right">{t('colSample')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {frtByAccount.accounts.map(a => (
                      <tr key={a.accountId}>
                        <td className="py-2 text-gray-900 dark:text-gray-100">{a.accountName}</td>
                        <td className="py-2 text-right tabular-nums">{formatResponseTime(a.avg_seconds)}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{a.sample}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}

            {/* Reopen rate per account */}
            {reopenRate?.accounts && reopenRate.accounts.length > 0 && (
              <Panel title={t('reopenRateByAccount')}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                      <th className="pb-2 font-medium">{t('colAccount')}</th>
                      <th className="pb-2 font-medium text-right">{t('colTotalResolved')}</th>
                      <th className="pb-2 font-medium text-right">{t('colReopen')}</th>
                      <th className="pb-2 font-medium text-right">{t('colRate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {reopenRate.accounts.map(a => (
                      <tr key={a.accountId}>
                        <td className="py-2 text-gray-900 dark:text-gray-100">{a.accountName}</td>
                        <td className="py-2 text-right tabular-nums text-gray-500">{a.total}</td>
                        <td className="py-2 text-right tabular-nums">{a.reopened}</td>
                        <td className={`py-2 text-right tabular-nums font-medium ${a.rate > 20 ? 'text-danger-600' : a.rate > 10 ? 'text-review-600' : 'text-channel-700'}`}>{a.rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}

            {/* Sentiment trend */}
            {sentimentTrend?.trend && sentimentTrend.trend.length > 0 && (
              <Panel title={t('sentimentTrend')}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                        <th className="pb-2 font-medium">{t('colDate')}</th>
                        <th className="pb-2 font-medium text-right">{t('colAvgScore')}</th>
                        <th className="pb-2 font-medium text-right text-channel-700">{t('colPositive')}</th>
                        <th className="pb-2 font-medium text-right text-gray-500">{t('colNeutral')}</th>
                        <th className="pb-2 font-medium text-right text-danger-600">{t('colNegative')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {sentimentTrend.trend.map(row => (
                        <tr key={row.day}>
                          <td className="py-2 text-gray-900 dark:text-gray-100">{row.day}</td>
                          <td className={`py-2 text-right tabular-nums font-medium ${row.avg_score >= 60 ? 'text-channel-700' : row.avg_score >= 40 ? 'text-gray-600' : 'text-danger-600'}`}>{row.avg_score}</td>
                          <td className="py-2 text-right tabular-nums text-channel-700">{row.positive}</td>
                          <td className="py-2 text-right tabular-nums text-gray-500">{row.neutral}</td>
                          <td className="py-2 text-right tabular-nums text-danger-600">{row.negative}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}

            {/* Deep Closing Analytics — funnel conversion, bot attribution, win/loss */}
            <div>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                Closing Analytics
              </h2>
              <ClosingAnalytics days={daysRange} />
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({ label, value, tone, formatted }: { label: string; value: number; tone?: string; formatted?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? 'text-gray-900 dark:text-gray-100'}`}>{formatted ?? value}</p>
    </Card>
  );
}

function formatResponseTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '–';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.round(seconds / 60)}m`;
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {children}
    </Card>
  );
}

function Bar({ label, meta, pct, color }: { label: string; meta: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="tabular-nums text-gray-500 dark:text-gray-400">{meta}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Empty({ t }: { t: (key: string) => string }) {
  return <p className="text-sm text-gray-400">{t('empty')}</p>;
}

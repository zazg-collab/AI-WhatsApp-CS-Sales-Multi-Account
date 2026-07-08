'use client';

import { ShieldStar, PaperPlaneTilt, ChatCircle, CheckCircle } from '@/components/ui/core-essential-icons';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatCard } from '@/components/ui/StatCard';
import { SentinelAlertCard } from '@/components/SentinelAlertCard';
import { useSentinel, DECISION_TONE, RISK_TONE, DECISION_LABEL_KEY, RISK_LABEL_KEY, relTime } from './useSentinel';

export default function SentinelPage() {
  const {
    t, alerts, report, question, setQuestion, chat, asking, loadError, loading,
    chatEndRef, liveRegionRef,
    load, ask,
    heldOrBlocked, approvalRate, blockRate,
    snapshot, gaps, bots, selectedBotId, insight, insightLoading, loadInsight,
  } = useSentinel();

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />

      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-5">
        {loadError && (
          <Card className="mb-5 border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>{t('cobaLagi')}</Button>
          </Card>
        )}

        {loading && !loadError && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1,2,3,4].map((n) => <div key={n} className="h-[68px] rounded animate-shimmer" />)}
          </div>
        )}

        {!loadError && report && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t('approvalRate')} value={`${approvalRate}%`} href="/analytics?metric=approval" />
            <StatCard label={t('blockRate')} value={`${blockRate}%`} tone={blockRate > 0 ? 'text-danger-600' : undefined} href="/analytics?metric=block" />
            <StatCard label={t('hotLeads')} value={report.hotLeads} href="/analytics?metric=hotLeads" />
            <StatCard label={t('escalations')} value={heldOrBlocked} tone={heldOrBlocked > 0 ? 'text-danger-600' : undefined} href="/inbox?filter=blocked" />
          </div>
        )}

        <Card className="mb-5 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <ShieldStar className="h-4 w-4 text-hermes-600" aria-hidden="true" />
            {t('askHermes')}
            <Badge tone="hermes">{t('supervisorAssistant')}</Badge>
          </h2>
          <div className="mb-3 max-h-64 space-y-3 overflow-y-auto">
            {chat.length === 0 && !asking && <p className="text-sm text-gray-400">{t('askPlaceholderHint')}</p>}
            {chat.map((c, i) => (
              <div key={i} className="space-y-1">
                <p className="flex items-start gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <ChatCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{c.q}
                </p>
                <p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">{c.a}</p>
              </div>
            ))}
            {asking && <p className="text-sm text-gray-400">{t('analyzing')}</p>}
            <div ref={chatEndRef} />
          </div>
          <div ref={liveRegionRef} aria-live="polite" aria-atomic="true" className="sr-only" />
          <form onSubmit={ask} className="flex gap-2">
            <input value={question} onChange={(e) => setQuestion(e.target.value)} aria-label={t('askAria')} placeholder={t('askPlaceholder')} className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
            <Button type="submit" size="md" disabled={asking}><PaperPlaneTilt className="h-4 w-4" aria-hidden="true" />{t('ask')}</Button>
          </form>
        </Card>

        {!loadError && !loading && snapshot && (
          <Card className="mb-5 p-4">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <ShieldStar className="h-4 w-4 text-hermes-600" aria-hidden="true" />{t('botPerformance')}
            </h2>
            <p className="mb-3 text-xs text-gray-400">{t('botPerfHint')}</p>
            {snapshot.bots.length === 0 ? (
              <p className="text-sm text-gray-400">{t('noBotPerf')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400">
                      <th scope="col" className="pb-2 font-medium">{t('colBot')}</th>
                      <th scope="col" className="pb-2 text-right font-medium">{t('colReviews')}</th>
                      <th scope="col" className="pb-2 text-right font-medium">{t('colAvgConf')}</th>
                      <th scope="col" className="pb-2 text-right font-medium">{t('colAvgRisk')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.bots.map((b, i) => (
                      <tr key={`${b.bot}-${i}`} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="py-1.5 text-gray-900 dark:text-gray-100">{b.bot}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{b.reviews}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{b.avgConfidence}</td>
                        <td className={`py-1.5 text-right tabular-nums ${b.avgRisk >= 50 ? 'text-danger-600' : 'text-gray-600 dark:text-gray-300'}`}>{b.avgRisk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-bot deep dive (PRD §8.3) */}
            <div className="mt-4 border-t border-gray-100 pt-3 dark:border-gray-800">
              <p className="mb-2 text-xs text-gray-400">{t('deepDiveHint')}</p>
              <select
                value={selectedBotId}
                onChange={(e) => loadInsight(e.target.value)}
                aria-label={t('deepDive')}
                className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-hermes-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">{t('deepDivePick')}</option>
                {bots.map((b) => <option key={b.id} value={b.id}>{b.botName}</option>)}
              </select>
              {insightLoading && <p className="mt-3 text-sm text-gray-400">{t('analyzingBot')}</p>}
              {insight && !insightLoading && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone="neutral">{t('colReviews')}: {insight.metrics.reviews}</Badge>
                    <Badge tone="neutral">{t('colAvgConf')}: {insight.metrics.avgConfidence}</Badge>
                    <Badge tone={insight.metrics.avgRisk >= 50 ? 'danger' : 'neutral'}>{t('colAvgRisk')}: {insight.metrics.avgRisk}</Badge>
                  </div>
                  <p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">{insight.insight}</p>
                </div>
              )}
            </div>
          </Card>
        )}

        {!loadError && !loading && (
          <Card className="mb-5 p-4">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <ChatCircle className="h-4 w-4 text-hermes-600" aria-hidden="true" />{t('knowledgeGaps')}
              <Badge tone={gaps.length > 0 ? 'review' : 'neutral'}>{gaps.length}</Badge>
            </h2>
            <p className="mb-3 text-xs text-gray-400">{t('knowledgeGapsHint')}</p>
            {gaps.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-channel-200 bg-channel-50 px-3 py-2.5 dark:border-channel-700/40 dark:bg-channel-900/10">
                <CheckCircle className="h-5 w-5 text-channel-600" aria-hidden="true" />
                <p className="text-[13px] text-channel-700 dark:text-channel-400">{t('noKnowledgeGaps')}</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {gaps.slice(0, 15).map((g) => (
                  <li key={g.id} className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800">
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-gray-600 dark:text-gray-300">
                        {g.conversation?.customer?.name || g.conversation?.customer?.phoneNumber || t('customer')}
                      </span>
                      <span className="shrink-0 text-[11px] text-gray-400">{relTime(g.createdAt)}</span>
                    </div>
                    <p className="line-clamp-2 text-sm text-gray-900 dark:text-gray-100">{g.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {loading && !loadError && (
          <div className="space-y-2">{[1,2].map((n) => <div key={n} className="h-24 rounded animate-shimmer" />)}</div>
        )}

        {!loadError && !loading && (
          <>
            <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {t('activeAlerts')}<Badge tone={alerts.length > 0 ? 'review' : 'neutral'}>{alerts.length}</Badge>
            </h2>
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id}>
                  <SentinelAlertCard id={a.id} conversationId={a.conversationId} customer={a.conversation?.customer} riskLevel={a.riskLevel} decision={a.decision} reason={a.reason} recommendation={a.recommendation} confidenceScore={a.confidenceScore} riskScore={a.riskScore} createdAt={a.createdAt} decisionToneMap={DECISION_TONE} riskToneMap={RISK_TONE} decisionLabelKey={DECISION_LABEL_KEY} riskLabelKey={RISK_LABEL_KEY} relTime={relTime} t={t} />
                </li>
              ))}
              {alerts.length === 0 && (
                <li>
                  <Card className="flex flex-col items-center justify-center py-12 text-center">
                    <ShieldStar className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('noActiveAlerts')}</p>
                    <p className="mt-1 text-xs text-gray-400">{t('noActiveAlertsHint')}</p>
                  </Card>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </AppLayout>
  );
}

'use client';

import Link from 'next/link';
import {
  ShieldStar, Warning, XCircle, PlugsConnected, Clock, ArrowUpRight, ChartLineUp, Hand,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { useOverview, relTime, deriveState, type QueueTone, type AttnState } from './useOverview';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import { useT } from '@/lib/i18n';
import { dict } from './overview.i18n';

const toneRing: Record<QueueTone, string> = { review: 'text-review-600', danger: 'text-danger-600' };

const stateMeta: Record<AttnState, { label: string; icon: PhosphorIcon; tone: 'review' | 'danger' | 'neutral' }> = {
  'human-takeover': { label: 'st_takeover', icon: Hand, tone: 'neutral' },
  'needs-review': { label: 'st_review', icon: Warning, tone: 'review' },
  'sending-blocked': { label: 'st_blocked', icon: XCircle, tone: 'danger' },
};

function SetupChecklist() {
  const { data: accounts } = useApiQuery<{ id: string }[]>('/wa/accounts');
  const t = useT(dict);
  if (!accounts || accounts.length > 0) return null;

  const steps = [
    { n: 1, label: t('setup_step1'), hint: t('setup_hint1'), href: '/accounts', done: false },
    { n: 2, label: t('setup_step2'), hint: t('setup_hint2'), href: '/bots', done: false },
    { n: 3, label: t('setup_step3'), hint: t('setup_hint3'), href: '/settings/ai', done: false },
  ];

  return (
    <Card className="border-hermes-200 bg-hermes-50/60 p-5 dark:border-hermes-700/40 dark:bg-hermes-900/10">
      <p className="mb-1 text-[13px] font-bold text-hermes-700 dark:text-hermes-400">{t('setup_title')}</p>
      <p className="mb-4 text-[12px] text-hermes-700/70 dark:text-hermes-400/70">{t('setup_subtitle')}</p>
      <ol className="space-y-3">
        {steps.map((s) => (
          <li key={s.n} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-hermes-600 text-[11px] font-bold text-white">{s.n}</span>
            <div className="flex-1">
              <Link href={s.href} className="text-[13px] font-semibold text-hermes-700 underline-offset-2 hover:underline dark:text-hermes-400">{s.label}</Link>
              <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{s.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

export default function OverviewPage() {
  const {
    t, attention,
    loading, error, sectionErrors,
    load,
    pendingReviews, highRisk, failed, disconnected, slaRisk,
    metrics,
  } = useOverview();

  const queues: {
    key: string; label: string; count: number; hint: string; href: string; icon: PhosphorIcon; tone: QueueTone;
  }[] = [
    { key: 'reviews', label: t('q_reviews'), count: pendingReviews, hint: t('q_reviews_h'), href: '/hermes', icon: ShieldStar, tone: 'review' },
    { key: 'risk', label: t('q_risk'), count: highRisk, hint: t('q_risk_h'), href: '/hermes', icon: Warning, tone: 'danger' },
    { key: 'failed', label: t('q_failed'), count: failed, hint: t('q_failed_h'), href: '/inbox', icon: XCircle, tone: 'danger' },
    { key: 'disconnected', label: t('q_disc'), count: disconnected, hint: t('q_disc_h'), href: '/accounts', icon: PlugsConnected, tone: 'danger' },
    { key: 'sla', label: t('q_sla'), count: slaRisk, hint: t('q_sla_h'), href: '/inbox', icon: Clock, tone: 'review' },
  ];

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Link href="/analytics" className="inline-flex h-9 items-center gap-2 rounded border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800">
          <ChartLineUp className="h-4 w-4" aria-hidden="true" />{t('fullAnalytics')}
        </Link>
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5 space-y-6">
        {error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-semibold text-danger-700 dark:text-danger-400">{t('errTitle')}</p>
            <p className="mt-1 text-[13px] text-danger-700/90 dark:text-danger-400/90">{error}</p>
            <button onClick={load} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-danger-300 bg-white px-3 text-[13px] font-semibold text-danger-700 transition-colors hover:bg-danger-50 dark:border-danger-700/50 dark:bg-gray-900 dark:text-danger-400">{t('retry')}</button>
          </Card>
        ) : (
          <>
            {Object.keys(sectionErrors).length > 0 && (
              <Card className="border-review-200 bg-review-50 p-3 dark:border-review-700/40 dark:bg-review-900/20">
                <p className="text-[13px] font-semibold text-review-700 dark:text-review-400">{t('partialTitle')}</p>
                <p className="mt-0.5 text-[12px] text-review-700/90 dark:text-review-400/90">{t('partialDetail', { sections: Object.keys(sectionErrors).join(', ') })}</p>
              </Card>
            )}

            <SetupChecklist />

            <section aria-labelledby="queues-h">
              <h2 id="queues-h" className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('attnRequired')}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {queues.map((q) => {
                  const Icon = q.icon;
                  const muted = q.count === 0;
                  return (
                    <Link key={q.key} href={q.href} className="group">
                      <Card className="h-full p-4 transition-colors duration-200 group-hover:border-gray-300 dark:group-hover:border-gray-700">
                        <div className="flex items-start justify-between">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${muted ? 'bg-gray-100 dark:bg-gray-800' : q.tone === 'danger' ? 'bg-danger-50 dark:bg-danger-900/30' : 'bg-review-50 dark:bg-review-900/30'}`}>
                            <Icon className={`h-4 w-4 ${muted ? 'text-gray-300' : toneRing[q.tone]}`} aria-hidden="true" />
                          </span>
                          <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 transition-colors group-hover:text-gray-500" aria-hidden="true" />
                        </div>
                        <p className={`mt-3 text-3xl font-bold tabular-nums tracking-tight ${muted ? 'text-gray-300' : 'text-gray-900 dark:text-gray-100'}`}>{loading ? '—' : q.count}</p>
                        <p className="mt-0.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200">{q.label}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">{q.hint}</p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="attn-h">
              <Card>
                <CardHeader>
                  <CardTitle id="attn-h">{t('needDecision')}</CardTitle>
                  <Link href="/inbox" className="inline-flex items-center gap-1 rounded-lg bg-hermes-50 px-2.5 py-1 text-[12px] font-semibold text-hermes-700 hover:bg-hermes-100 dark:bg-hermes-900/30 dark:text-hermes-300 dark:hover:bg-hermes-900/50">
                    {t('openInbox')}<ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </CardHeader>
                {loading ? (
                  <div className="space-y-1 p-2">{[1,2,3].map((n) => <div key={n} className="h-14 rounded-lg animate-shimmer" />)}</div>
                ) : attention.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-center">
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-channel-50 dark:bg-channel-900/20">
                      <ShieldStar className="h-5 w-5 text-channel-600 dark:text-channel-500" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('allClear')}</p>
                    <p className="mt-1 text-xs text-gray-400">{t('allClearSub')}</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-50 dark:divide-gray-800/80">
                    {attention.map((c) => {
                      const state = deriveState(c);
                      const meta = stateMeta[state];
                      const Icon = meta.icon;
                      const name = c.customer.name || c.customer.phoneNumber;
                      return (
                        <li key={c.id}>
                          <Link href={`/inbox?conversation=${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40">
                            <Avatar name={c.customer.name} phone={c.customer.phoneNumber} className="h-9 w-9" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{name}</p>
                                <span className="truncate text-[11px] text-gray-400">{c.whatsappAccount.accountName}</span>
                              </div>
                              <p className="truncate text-[12px] text-gray-500 dark:text-gray-400">{c.lastMessage ?? t('noMessages')}</p>
                            </div>
                            <Badge tone={meta.tone}><Icon className="h-3 w-3" aria-hidden="true" />{t(meta.label)}</Badge>
                            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-gray-400">{relTime(c.lastMessageAt)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </section>

            <section aria-labelledby="metrics-h">
              <h2 id="metrics-h" className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('todaySummary')}</h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {metrics.map((m) => (
                  <Card key={m.label} className="p-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{m.label}</p>
                    <span className="mt-2 block text-3xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-gray-100">
                      {loading ? <span className="text-gray-300">—</span> : m.value}
                    </span>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}

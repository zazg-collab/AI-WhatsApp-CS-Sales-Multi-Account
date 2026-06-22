'use client';

import Link from 'next/link';
import { ArrowLeft, ChatCircle, ShieldStar, BellRinging } from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Avatar } from '@/components/ui/Avatar';
import { hasRole } from '@/lib/api';
import { formatPhone } from '@/lib/contact';
import { stages, stageTone, stageLabelKey } from '../useCustomers';
import { useCustomerDetail, type LeadStage, type TimelineEvent } from './useCustomerDetail';

const EVENT_META: Record<TimelineEvent['type'], { icon: typeof ChatCircle; labelKey: string }> = {
  message: { icon: ChatCircle, labelKey: 'detailEvtMessage' },
  hermes_review: { icon: ShieldStar, labelKey: 'detailEvtReview' },
  follow_up: { icon: BellRinging, labelKey: 'detailEvtFollowUp' },
};

function eventSummary(e: TimelineEvent): string {
  const d = e.data as Record<string, unknown>;
  if (e.type === 'message') return (d.content as string) || `[${(d.messageType as string) || 'media'}]`;
  if (e.type === 'hermes_review') return `${d.decision ?? ''} · ${d.riskLevel ?? ''} — ${d.reason ?? ''}`;
  return `${d.status ?? ''} · ${(d.messageTemplate as string) || ''}`;
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const {
    t, customer, timeline, loading, error, load,
    note, setNote, addNote, savingNote, setLeadStage, savingStage,
    setOptedOut, savingOptOut,
  } = useCustomerDetail(id);

  return (
    <AppLayout>
      <PageHeader
        title={customer?.name || t('detailProfile')}
        subtitle={customer ? formatPhone(customer.phoneNumber, t('hiddenNumber')) : ''}
      />

      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-5">
        <Link href="/customers" className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-hermes-600 dark:text-gray-400">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />{t('detailBack')}
        </Link>

        {error && (
          <Card className="mb-5 border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>{t('detailBack')}</Button>
          </Card>
        )}

        {loading && !error && (
          <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-24 rounded-lg animate-shimmer" />)}</div>
        )}

        {!loading && !error && !customer && (
          <Card className="p-8 text-center text-sm text-gray-500">{t('detailNotFound')}</Card>
        )}

        {!loading && !error && customer && (
          <div className="grid gap-5 md:grid-cols-3">
            {/* Profile + notes */}
            <div className="space-y-5 md:col-span-1">
              <Card className="p-4">
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={customer.name} phone={customer.phoneNumber} avatarUrl={customer.avatarUrl} className="h-12 w-12 text-sm font-semibold" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-gray-900 dark:text-gray-100">{customer.name || t('noName')}</div>
                    <div className="text-xs text-gray-400">{formatPhone(customer.phoneNumber, t('hiddenNumber'))}</div>
                  </div>
                </div>

                <dl className="space-y-2.5 text-sm">
                  <div>
                    <dt className="mb-1 text-[11px] uppercase tracking-wider text-gray-400">{t('detailLeadStage')}</dt>
                    <dd className="flex items-center gap-2">
                      <Badge tone={stageTone[customer.leadStage]}>{t(stageLabelKey[customer.leadStage])}</Badge>
                      <select
                        value={customer.leadStage}
                        disabled={savingStage}
                        onChange={(e) => setLeadStage(e.target.value as LeadStage)}
                        aria-label={t('detailLeadStage')}
                        className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-900 outline-none focus:border-hermes-400 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                      >
                        {stages.map((s) => <option key={s.value} value={s.value}>{t(s.labelKey)}</option>)}
                      </select>
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">{t('detailLeadScore')}</dt>
                    <dd className="tabular-nums text-gray-900 dark:text-gray-100">{customer.leadScore}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">{t('detailAssigned')}</dt>
                    <dd className="text-gray-900 dark:text-gray-100">{customer.assignedAdmin?.name || customer.assignedAdmin?.email || <span className="text-gray-400">{t('unassigned')}</span>}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-gray-400">{t('detailLastMessage')}</dt>
                    <dd className="text-gray-500 dark:text-gray-400">{customer.lastMessageAt ? new Date(customer.lastMessageAt).toLocaleString('id-ID') : '-'}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[11px] uppercase tracking-wider text-gray-400">{t('detailTags')}</dt>
                    <dd className="flex flex-wrap gap-1">
                      {customer.tags.length === 0 ? <span className="text-xs text-gray-400">{t('noTag')}</span>
                        : customer.tags.map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}
                    </dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-[11px] uppercase tracking-wider text-gray-400">{t('detailCampaigns')}</dt>
                    <dd className="flex items-center justify-between gap-2">
                      <Badge tone={customer.optedOut ? 'danger' : 'success'}>
                        {customer.optedOut ? t('detailOptedOut') : t('detailOptedIn')}
                      </Badge>
                      {/* opt-out/opt-in require admin+ on the backend; hide for viewers. */}
                      {hasRole('admin') && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={savingOptOut}
                          onClick={() => setOptedOut(!customer.optedOut)}
                        >
                          {customer.optedOut ? t('detailInclude') : t('detailExclude')}
                        </Button>
                      )}
                    </dd>
                  </div>
                </dl>
              </Card>

              <Card className="p-4">
                <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('detailNotes')}</h2>
                {customer.notes
                  ? <pre className="mb-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 font-sans text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">{customer.notes}</pre>
                  : <p className="mb-3 text-sm text-gray-400">{t('detailNoNotes')}</p>}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('detailNotePlaceholder')}
                  rows={2}
                  className="mb-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                />
                <Button size="sm" onClick={addNote} disabled={savingNote || !note.trim()}>{t('detailAddNote')}</Button>
              </Card>
            </div>

            {/* Timeline */}
            <Card className="p-4 md:col-span-2">
              <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">{t('detailTimeline')}</h2>
              {timeline.length === 0 ? (
                <p className="text-sm text-gray-400">{t('detailNoTimeline')}</p>
              ) : (
                <ul className="space-y-2.5">
                  {timeline.map((e, i) => {
                    const meta = EVENT_META[e.type];
                    const Icon = meta.icon;
                    return (
                      <li key={i} className="flex gap-3 border-b border-gray-50 pb-2.5 last:border-0 dark:border-gray-800/60">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-0.5 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{t(meta.labelKey)}</span>
                            <span className="shrink-0 text-[11px] text-gray-400">{e.at ? new Date(e.at).toLocaleString('id-ID') : ''}</span>
                          </div>
                          <p className="line-clamp-3 text-sm text-gray-800 dark:text-gray-200">{eventSummary(e)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

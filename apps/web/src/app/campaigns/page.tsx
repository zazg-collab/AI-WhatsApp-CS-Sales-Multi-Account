'use client';

import {
  MegaphoneSimple, Eye, Plus, PaperPlaneTilt, CheckCircle,
  Pause, XCircle, ArrowCounterClockwise, X, Prohibit, ArrowCounterClockwise as ReverseIcon, Copy,
} from '@/components/ui/core-essential-icons';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, TextareaField, SelectField } from '@/components/ui/Field';
import { useCampaigns, statusTone } from './useCampaigns';

export default function CampaignsPage() {
  const {
    t, campaigns, accounts, selectedId, setSelectedId, detail,
    toast, setToast,
    loading, submitting, preview,
    liveCount, counting,
    name, setName,
    messageTemplate, setMessageTemplate,
    whatsappAccountId, setWhatsappAccountId,
    leadStage, setLeadStage,
    tag, setTag,
    rateLimitPerMinute, setRateLimitPerMinute,
    scheduledAt, setScheduledAt,
    assetId, setAssetId,
    pendingAction, setPendingAction,
    assetOptions,
    canManage, canApprove,
    isSelectedAccountConnected, isDetailAccountConnected,
    handlePreview, createCampaign, runAction, executeAction, duplicateCampaign,
    showOptOut, setShowOptOut, optedOut, optedOutTotal, optOutLoading,
    openOptOut, reverseOptOut,
  } = useCampaigns();

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Button variant="outline" size="sm" onClick={openOptOut}>
          <Prohibit className="h-4 w-4" aria-hidden="true" />{t('optOutButton')}
        </Button>
      </PageHeader>
      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Left: create + list */}
        <aside className="scrollbar-thin w-96 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          {canManage && (
            <Card className="mb-4 space-y-3 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('createDraftHeading')}</h2>
              <hr className="border-gray-100 dark:border-gray-800" />
              {/* Section 1: Target & Message */}
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">1 — {t('stepTarget')}</h3>
              <Field label={t('nameLabel')} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('campaignNamePlaceholder')} />
              <SelectField label={t('senderAccountLabel')} value={whatsappAccountId} onChange={(e) => setWhatsappAccountId(e.target.value)}>
                <option value="">{t('selectAccount')}</option>
                {accounts.map((account) => {
                  const isConnected = account.sessionStatus === 'connected';
                  const statusSuffix = isConnected ? '' : ` — ${account.sessionStatus ?? 'unknown'}`;
                  return (
                    <option key={account.id} value={account.id} disabled={!isConnected}>
                      {account.accountName} ({account.phoneNumber}){statusSuffix}
                    </option>
                  );
                })}
              </SelectField>
              {whatsappAccountId && !accounts.find(a => a.id === whatsappAccountId)?.sessionStatus?.includes('connected') && (
                <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-300">
                  {t('accountDisconnectedMsg')}<a href="/accounts" className="font-semibold underline">{t('reconnectLink')}</a>{t('accountDisconnectedHint')}
                </div>
              )}
              <div>
                <TextareaField
                  label={t('messageLabel')}
                  hint={assetId ? t('captionHint') : t('messageHint')}
                  rows={4}
                  value={messageTemplate}
                  onChange={(e) => setMessageTemplate(e.target.value)}
                  placeholder={t('messagePlaceholder')}
                  className="resize-none"
                />
                <div className="mt-1 flex justify-end">
                  <span className={`text-[11px] tabular-nums ${messageTemplate.length > 4096 ? 'font-semibold text-danger-500' : 'text-gray-400'}`}>
                    {messageTemplate.length.toLocaleString()} / 4096
                  </span>
                </div>
              </div>
              {assetOptions.length > 0 && (
                <SelectField label={t('attachAssetLabel')} hint={t('attachAssetHint')} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                  <option value="">{t('noAsset')}</option>
                  {assetOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.kind === 'image' ? '🖼️' : a.kind === 'video' ? '🎬' : '📄'} {a.title} ({a.purpose})
                    </option>
                  ))}
                </SelectField>
              )}
              {/* Section 2: Filter */}
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">2 — {t('stepFilter')}</h3>
              <div className="grid grid-cols-2 gap-2">
                <SelectField label={t('leadStageLabel')} value={leadStage} onChange={(e) => setLeadStage(e.target.value)}>
                  <option value="">{t('allStages')}</option>
                  <option value="cold">Cold</option>
                  <option value="warm">Warm</option>
                  <option value="hot">Hot</option>
                  <option value="very_hot">Very Hot</option>
                </SelectField>
                <Field label={t('tagFilterLabel')} value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t('tagPlaceholder')} />
              </div>
              {/* Section 3: Schedule */}
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">3 — {t('stepSchedule')}</h3>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('rateLabel')} hint={t('rateHint')} type="number" min={1} max={30} value={rateLimitPerMinute} onChange={(e) => setRateLimitPerMinute(Number(e.target.value))} />
                <Field label={t('scheduleLabel')} hint={t('scheduleHint')} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
              {whatsappAccountId && (
                <div className="flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400" aria-live="polite">
                  {counting ? (
                    <><div className="h-3 w-3 animate-spin rounded-full border-2 border-hermes-400 border-t-transparent" aria-hidden="true" /><span>{t('countingRecipients')}</span></>
                  ) : liveCount != null ? (
                    <span>≈ <span className="font-semibold text-hermes-600">{liveCount}</span> {t('eligibleRecipients')}</span>
                  ) : null}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" size="md" className="flex-1" onClick={handlePreview} disabled={submitting || !isSelectedAccountConnected}>
                  <Eye className="h-4 w-4" aria-hidden="true" />{t('preview')}
                </Button>
                <Button size="md" className="flex-1" onClick={createCampaign} disabled={submitting || !isSelectedAccountConnected}>
                  <Plus className="h-4 w-4" aria-hidden="true" />{t('createDraft')}
                </Button>
              </div>
              {preview && (
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <div><span className="font-semibold text-hermes-600">{preview.eligibleCount}</span> {t('eligibleRecipients')}</div>
                  <div className="mt-1 text-gray-400">
                    {t('skipped')} {Object.entries(preview.skipped).map(([key, value]) => `${key} ${value}`).join(', ') || t('none')}
                  </div>
                </div>
              )}
            </Card>
          )}

          <div className="space-y-2">
            {loading ? (
              [1, 2, 3].map((n) => <div key={n} className="h-16 rounded-lg animate-shimmer" />)
            ) : campaigns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center dark:border-gray-800">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-300">{t('noCampaigns')}</p>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  {canManage ? t('createDraftAbove') : t('waitingDraft')}
                </p>
                {canManage && (
                  <p className="mt-3 text-[11px] font-mono text-hermes-500 dark:text-hermes-400">{t('approvalFlowNote')}</p>
                )}
              </div>
            ) : (
              campaigns.map((campaign) => {
                const isActive = selectedId === campaign.id;
                return (
                  <button
                    key={campaign.id}
                    onClick={() => setSelectedId(campaign.id)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      isActive
                        ? 'border-hermes-200 bg-hermes-50 dark:border-hermes-800 dark:bg-hermes-900/30'
                        : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-gray-900 dark:text-gray-100">{campaign.name}</span>
                      <Badge tone={statusTone[campaign.status] ?? 'neutral'}>{campaign.status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {campaign.whatsappAccount?.accountName ?? t('noAccount')} · {campaign._count?.recipients ?? 0} {t('recipientsSuffix')}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Right: detail */}
        <main className="scrollbar-thin flex-1 overflow-y-auto bg-gray-50 p-5 dark:bg-gray-950">
          {toast && (
            <button
              onClick={() => setToast(null)}
              aria-label={t('closeToast')}
              className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                toast.tone === 'error'
                  ? 'border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-900 dark:bg-danger-900/30 dark:text-danger-100'
                  : 'border-channel-100 bg-channel-50 text-channel-700 dark:border-channel-700 dark:bg-channel-700/20 dark:text-channel-100'
              }`}
            >
              {toast.msg}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}

          {!detail ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
              <MegaphoneSimple className="mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
              <p className="text-sm">{t('emptyDetail')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{detail.name}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {detail.whatsappAccount?.accountName} · {t('ratePer', { n: detail.rateLimitPerMinute })}
                    </p>
                  </div>
                  <Badge tone={statusTone[detail.status] ?? 'neutral'}>{detail.status}</Badge>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {detail.messageTemplate}
                </pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canManage && ['draft', 'pending_approval'].includes(detail.status) && (
                    <Button variant="review" size="sm" onClick={() => runAction('submit')} disabled={submitting}>
                      <PaperPlaneTilt className="h-4 w-4" aria-hidden="true" />{t('submitApproval')}
                    </Button>
                  )}
                  {canApprove && detail.status === 'pending_approval' && (
                    <Button size="sm" onClick={() => runAction('approve')} disabled={submitting}>
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />{t('approve')}
                    </Button>
                  )}
                  {canApprove && ['approved', 'paused', 'scheduled'].includes(detail.status) && (
                    <Button size="sm" onClick={() => runAction('start')} disabled={submitting || !isDetailAccountConnected} title={!isDetailAccountConnected ? 'Campaign account is disconnected' : undefined}>
                      <PaperPlaneTilt className="h-4 w-4" aria-hidden="true" />{t('startQueue')}
                    </Button>
                  )}
                  {canApprove && ['running', 'scheduled'].includes(detail.status) && (
                    <Button variant="outline" size="sm" onClick={() => runAction('pause')} disabled={submitting}>
                      <Pause className="h-4 w-4" aria-hidden="true" />{t('pauseAction')}
                    </Button>
                  )}
                  {canApprove && !['completed', 'cancelled'].includes(detail.status) && (
                    <Button variant="danger" size="sm" onClick={() => runAction('cancel')} disabled={submitting}>
                      <XCircle className="h-4 w-4" aria-hidden="true" />{t('cancelAction')}
                    </Button>
                  )}
                  {canApprove && detail.status === 'failed' && (
                    <Button variant="outline" size="sm" onClick={() => runAction('retry-failed')} disabled={submitting}>
                      <ArrowCounterClockwise className="h-4 w-4" aria-hidden="true" />{t('retryFailed')}
                    </Button>
                  )}
                  {canManage && (
                    <Button variant="outline" size="sm" onClick={duplicateCampaign} disabled={submitting}>
                      <Copy className="h-4 w-4" aria-hidden="true" />{t('duplicateAction')}
                    </Button>
                  )}
                </div>
              </Card>

              <section className="grid gap-3 md:grid-cols-5">
                {(['pending', 'queued', 'sending', 'sent', 'failed'] as const).map((status) => {
                  const labelKey = { pending: 'statusPending', queued: 'statusQueued', sending: 'statusSending', sent: 'statusSent', failed: 'statusFailed' }[status] as Parameters<typeof t>[0];
                  return (
                    <Card key={status} className="p-4">
                      <div className="text-[11px] uppercase tracking-wider text-gray-400">{t(labelKey)}</div>
                      <div className={`mt-1 text-2xl font-semibold tabular-nums ${
                        status === 'failed' && (detail.recipientStats?.failed ?? 0) > 0
                          ? 'text-danger-600 dark:text-danger-400'
                          : status === 'sent' ? 'text-channel-700 dark:text-channel-500'
                          : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {detail.recipientStats?.[status] ?? 0}
                      </div>
                    </Card>
                  );
                })}
              </section>

              <Card>
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-800 dark:border-gray-800 dark:text-gray-200">
                  {t('recipientSample')}
                </div>
                <div className="scrollbar-thin max-h-[420px] overflow-y-auto">
                  {!(detail as never as { recipients?: unknown[] }).recipients?.length && (
                    <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">{t('noRecipients')}</p>
                  )}
                  {(detail as never as { recipients?: Array<{ id: string; customer?: { name?: string }; phoneNumber: string; error?: string; status: string }> }).recipients?.map((recipient) => (
                    <div key={recipient.id} className="grid grid-cols-[1fr_120px] gap-3 border-b border-gray-50 px-4 py-3 text-sm last:border-0 dark:border-gray-800/60">
                      <div>
                        <div className="text-gray-900 dark:text-gray-100">{recipient.customer?.name || recipient.phoneNumber}</div>
                        <div className="text-xs text-gray-400">{recipient.phoneNumber} {recipient.error ? `· ${recipient.error}` : ''}</div>
                      </div>
                      <span className="text-right text-gray-600 dark:text-gray-300">{recipient.status}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
        </main>
      </div>

      <Modal
        open={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title={t('confirmActionTitle')}
        description={pendingAction?.message ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setPendingAction(null)}>{t('cancelButton')}</Button>
            <Button
              size="sm"
              disabled={submitting}
              onClick={async () => {
                if (!pendingAction) return;
                const { action } = pendingAction;
                setPendingAction(null);
                await executeAction(action);
              }}
            >
              {t('confirmActionButton')}
            </Button>
          </>
        }
      >
        {null}
      </Modal>

      <Modal
        open={showOptOut}
        onClose={() => setShowOptOut(false)}
        title={t('optOutTitle')}
        description={t('optOutDesc')}
        footer={<Button variant="outline" size="sm" onClick={() => setShowOptOut(false)}>{t('cancelButton')}</Button>}
      >
        {optOutLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="h-12 rounded-lg animate-shimmer" />)}</div>
        ) : optedOut.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">{t('optOutEmpty')}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-400">{t('optOutTotal', { n: optedOutTotal })}</p>
            <ul className="scrollbar-thin max-h-[50vh] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {optedOut.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-gray-900 dark:text-gray-100">{c.name || c.phoneNumber}</div>
                    <div className="text-xs text-gray-400">
                      {c.phoneNumber}
                      {c.optedOutAt ? ` · ${t('optOutSince', { date: new Date(c.optedOutAt).toLocaleDateString('id-ID') })}` : ''}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => reverseOptOut(c.id)} disabled={submitting}>
                    <ReverseIcon className="h-4 w-4" aria-hidden="true" />{t('optInAction')}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </AppLayout>
  );
}

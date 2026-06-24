'use client';

import { useEffect, useState } from 'react';
import {
  CaretDown,
  CaretRight,
  CheckCircle,
  Plus,
  DeviceMobile,
  QrCode,
  ArrowCounterClockwise,
  Trash,
  Pulse,
} from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, TextareaField } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SessionStatusBadge, getSessionLabel } from '@/components/ui/SessionStatusBadge';
import { useT, useLang } from '@/lib/i18n';
import { api } from '@/lib/api';
import { useAccounts, type Account } from './useAccounts';
import { dict } from './accounts.i18n';

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const inputClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

function getStatusHint(status: string, t: ReturnType<typeof useT>): string | undefined {
  const map: Record<string, string> = {
    connecting: t('reconnectHint'),
    reconnecting: t('reconnectingHint'),
    qr_required: t('qrExpiredHint'),
    disconnected: t('reconnectHint'),
    banned: t('bannedHint'),
    paused: t('pausedHint'),
  };
  return map[status];
}

function QrFreshness({ receivedAt, t }: { receivedAt: number; t: ReturnType<typeof useT> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.floor((now - receivedAt) / 1000);
  const stale = seconds >= 45;
  return (
    <p className={`mt-2 text-center text-[11px] ${stale ? 'text-review-600 dark:text-review-400' : 'text-gray-400'}`}>
      {stale ? t('qrFreshStale') : seconds < 2 ? t('qrFreshJustNow') : t('qrFreshSecondsAgo', { seconds: String(seconds) })}
    </p>
  );
}

function BusinessHoursEditor({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const t = useT(dict);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(account.businessHoursEnabled ?? false);
  const [start, setStart] = useState(account.businessHoursStart ?? '09:00');
  const [end, setEnd] = useState(account.businessHoursEnd ?? '17:00');
  const [days, setDays] = useState<number[]>(account.businessDays ?? [1, 2, 3, 4, 5]);
  const [tz, setTz] = useState(account.businessTimezone ?? 'Asia/Jakarta');
  const [away, setAway] = useState(account.awayMessage ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function toggleDay(d: number) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await api(`/wa/accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ businessHoursEnabled: enabled, businessHoursStart: start, businessHoursEnd: end, businessDays: days, businessTimezone: tz, awayMessage: away }),
      });
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-hermes-600 hover:text-hermes-700"
      >
        {open ? <CaretDown className="h-3.5 w-3.5" aria-hidden="true" /> : <CaretRight className="h-3.5 w-3.5" aria-hidden="true" />}
        {t('businessHoursToggle')}
        {account.businessHoursEnabled ? t('active') : ''}
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="accent-hermes-600" />
            <span className="text-gray-700 dark:text-gray-300">{t('enableBusinessHours')}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">{t('hours')}</span>
            <input type="time" aria-label={t('startTime')} value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
            <span className="text-gray-400">–</span>
            <input type="time" aria-label={t('endTime')} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-wrap gap-1">
            {DAY_LABELS.map((label, d) => (
              <button
                key={d}
                onClick={() => toggleDay(d)}
                aria-pressed={days.includes(d)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  days.includes(d) ? 'bg-hermes-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <Field label={t('timezone')} value={tz} onChange={(e) => setTz(e.target.value)} placeholder="Asia/Jakarta" />
          <TextareaField label={t('awayLabel')} hint={t('awayHint')} rows={2} value={away} onChange={(e) => setAway(e.target.value)} placeholder={t('awayPlaceholder')} className="resize-none" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>{saving ? t('saving') : t('save')}</Button>
            {saved && (
              <span className="flex items-center gap-1 text-xs text-channel-700">
                <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {t('saved')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const { lang } = useLang();
  const {
    visibleAccounts, accounts, qr, qrReceivedAt, pairingCode, pairingMode, copiedAccountId,
    loading, error, health, restarting, deleting,
    confirmDelete, setConfirmDelete,
    confirmRestart, setConfirmRestart,
    actionError, setActionError,
    statusFilter, setStatusFilter, requestingCode,
    addModalOpen, addStep,
    addName, setAddName, addPhone, setAddPhone,
    addCodePhone, setAddCodePhone,
    addError, addCreating, addedAccountId,
    addConnectMethod,
    addAutoDetected, addSaving,
    canScan, canEditHours, canDelete,
    load, openAddModal, closeAddModal,
    startQrFlow, chooseCodeMethod, submitCodePhone, confirmAndSave,
    restartAccount, requestPairingCode, deleteAccount, copyPairingCode,
    setPairingMode,
    t,
  } = useAccounts();

  // Step indicator: QR path is method→scan→confirm (3); code path inserts a
  // phone step (4).
  const addTotalSteps = addConnectMethod === 'code' ? 4 : 3;
  const addCurrentStep =
    addStep === 'method' ? 1
    : addStep === 'phone' ? 2
    : addStep === 'scan' ? (addConnectMethod === 'code' ? 3 : 2)
    : (addConnectMethod === 'code' ? 4 : 3);

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Button size="sm" onClick={openAddModal} disabled={!canScan}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t('addAccount')}
        </Button>
      </PageHeader>

      <div className="scrollbar-thin mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-5">

        {accounts.length > 1 && (
          <div className="mb-3 flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={inputClass + ' w-48'}
              aria-label={t('filterAll')}
            >
              <option value="">{t('filterAll')}</option>
              <option value="connected">{t('filterConnected')}</option>
              <option value="disconnected">{t('filterDisconnected')}</option>
              <option value="qr_required">{t('filterQr')}</option>
              <option value="banned">{t('filterBanned')}</option>
            </select>
          </div>
        )}

        {actionError && (
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-800 dark:bg-danger-900/20">
            <p className="text-sm text-danger-700 dark:text-danger-300">{actionError}</p>
            <Button variant="outline" size="sm" onClick={() => setActionError(null)}>{t('dismiss')}</Button>
          </Card>
        )}

        {error && (
          <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-danger-200 bg-danger-50 p-4 dark:border-danger-800 dark:bg-danger-900/20">
            <p className="text-sm text-danger-700 dark:text-danger-300">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>{t('retry')}</Button>
          </Card>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((n) => <div key={n} className="h-20 rounded animate-shimmer" />)}
          </div>
        ) : accounts.length === 0 && !error ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-400 dark:bg-gray-800">
              <DeviceMobile className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('noAccounts')}</p>
            <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-gray-400">{t('noAccountsHint')}</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {visibleAccounts.map((a) => (
              <li key={a.id}>
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-800">
                        <DeviceMobile className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{a.accountName}</p>
                        <p className="text-xs text-gray-400">{a.phoneNumber}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <div className="flex items-center gap-2">
                        {health[a.id] && (
                          <span className="flex items-center gap-1 text-[11px] text-gray-400" title={health[a.id].liveSocket ? t('healthLive') : t('healthReconnect', { attempt: String(health[a.id].reconnectAttempts) })}>
                            <Pulse className="h-3 w-3" aria-hidden="true" />
                            {health[a.id].liveSocket ? 'live' : `retry #${health[a.id].reconnectAttempts}`}
                          </span>
                        )}
                        <SessionStatusBadge status={a.sessionStatus} lang={lang} label={getSessionLabel(a.sessionStatus, lang)} />
                      </div>
                      {getStatusHint(a.sessionStatus, t) && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-right max-w-xs">
                          {getStatusHint(a.sessionStatus, t)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirmRestart({ id: a.id, accountName: a.accountName })} disabled={restarting === a.id}>
                      <ArrowCounterClockwise className="h-3.5 w-3.5" aria-hidden="true" />
                      {restarting === a.id ? t('restarting') : t('restart')}
                    </Button>
                    {canDelete && (
                      <Button type="button" variant="outline" size="sm" className="border-danger-200 text-danger-600 hover:bg-danger-50 dark:border-danger-800 dark:text-danger-400" onClick={() => setConfirmDelete({ id: a.id, accountName: a.accountName, conversationCount: a._count?.conversations ?? 0 })} disabled={deleting === a.id}>
                        <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                        {deleting === a.id ? t('deleting') : t('delete')}
                      </Button>
                    )}
                  </div>

                  {a.sessionStatus === 'qr_required' && (
                    canScan ? (
                      <div className="mt-4">
                        {(qr[a.id] || pairingCode[a.id]) && (
                          <div className="mb-3 flex gap-2">
                            {qr[a.id] && (
                              <button type="button" onClick={() => setPairingMode((prev) => ({ ...prev, [a.id]: 'qr' }))}
                                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${pairingMode[a.id] !== 'code' ? 'bg-hermes-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}>
                                {t('switchToQr')}
                              </button>
                            )}
                            {pairingCode[a.id] && (
                              <button type="button" onClick={() => setPairingMode((prev) => ({ ...prev, [a.id]: 'code' }))}
                                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${pairingMode[a.id] === 'code' ? 'bg-hermes-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'}`}>
                                {t('switchToPairingCode')}
                              </button>
                            )}
                          </div>
                        )}

                        {pairingMode[a.id] === 'code' && pairingCode[a.id] ? (
                          <div className="rounded-lg border border-hermes-200 bg-hermes-50 p-4 dark:border-hermes-700/40 dark:bg-hermes-900/20">
                            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-hermes-700 dark:text-hermes-400">{t('pairingCodeTitle')}</p>
                            <ol className="mb-4 space-y-1 text-[12px] text-gray-600 dark:text-gray-300">
                              <li>{t('pairingCodeStep1')}</li>
                              <li>{t('pairingCodeStep2')}</li>
                              <li>{t('pairingCodeStep3')}</li>
                            </ol>
                            <p className="mb-3 select-all text-center text-[36px] font-mono font-bold tracking-[0.3em] text-gray-900 dark:text-gray-100">
                              {pairingCode[a.id].length === 8 ? `${pairingCode[a.id].slice(0, 4)}-${pairingCode[a.id].slice(4)}` : pairingCode[a.id]}
                            </p>
                            <button type="button" onClick={() => copyPairingCode(a.id)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-hermes-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-hermes-700">
                              {copiedAccountId === a.id ? <><CheckCircle className="h-4 w-4" aria-hidden="true" />{t('codeCopied')}</> : <><QrCode className="h-4 w-4" aria-hidden="true" />{t('copyCode')}</>}
                            </button>
                          </div>
                        ) : qr[a.id] ? (
                          <div className="flex flex-col items-center gap-2">
                            <img src={qr[a.id]} alt="WhatsApp QR code" className="h-52 w-52 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700" />
                            {qrReceivedAt[a.id] ? <QrFreshness receivedAt={qrReceivedAt[a.id]} t={t} /> : <p className="text-[11px] text-gray-400">{t('qrAutoRefresh')}</p>}
                            <Button type="button" variant="outline" size="sm" onClick={() => requestPairingCode(a.id)} disabled={requestingCode[a.id]} className="mt-1">
                              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                              {requestingCode[a.id] ? t('requestingPairingCode') : t('requestPairingCode')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 py-6 dark:border-gray-700">
                            <div className="flex h-52 w-52 animate-pulse items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
                              <QrCode className="h-12 w-12 text-gray-300 dark:text-gray-600" aria-hidden="true" />
                            </div>
                            <p className="text-xs text-gray-500">{t('waitingScan')}</p>
                            <Button type="button" variant="outline" size="sm" onClick={() => requestPairingCode(a.id)} disabled={requestingCode[a.id]}>
                              <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                              {requestingCode[a.id] ? t('requestingPairingCode') : t('requestPairingCode')}
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
                        <QrCode className="h-4 w-4" aria-hidden="true" />
                        {t('waitingScan')}
                      </p>
                    )
                  )}

                  {canEditHours && <BusinessHoursEditor account={a} onSaved={load} />}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete confirmation */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('deleteConfirmTitle')}
        description={confirmDelete ? t('deleteConfirm', { name: confirmDelete.accountName }) : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>{t('cancel')}</Button>
            <Button size="sm" className="bg-danger-600 hover:bg-danger-700" disabled={!!deleting} onClick={() => confirmDelete && deleteAccount(confirmDelete.id)}>
              {deleting ? t('deleting') : t('delete')}
            </Button>
          </>
        }
      >
        {confirmDelete && confirmDelete.conversationCount > 0 ? (
          <p className="flex items-start gap-2 rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:bg-danger-900/20 dark:text-danger-300">
            <Trash className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('deleteImpact', { count: String(confirmDelete.conversationCount) })}
          </p>
        ) : null}
      </Modal>

      {/* Restart confirmation */}
      <Modal
        open={!!confirmRestart}
        onClose={() => setConfirmRestart(null)}
        title={t('restartConfirmTitle')}
        description={confirmRestart ? t('restartConfirmBody', { name: confirmRestart.accountName }) : ''}
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmRestart(null)}>{t('cancel')}</Button>
            <Button size="sm" disabled={!!restarting} onClick={() => confirmRestart && restartAccount(confirmRestart.id)}>
              {restarting ? t('restarting') : t('restartConfirmAction')}
            </Button>
          </>
        }
      >{null}</Modal>

      {/* Add account modal — scan-first: name + number auto-fill from the device */}
      <Modal
        open={addModalOpen}
        onClose={closeAddModal}
        title={t('addModalTitle')}
        description={
          addStep === 'method' ? t('chooseMethodDesc')
          : addStep === 'phone' ? t('codePhoneDesc')
          : addStep === 'confirm' ? t('confirmDesc')
          : undefined
        }
        size="sm"
        step={addCurrentStep}
        totalSteps={addTotalSteps}
        stepLabel={t('stepCounter')}
        footer={
          addStep === 'method' ? (
            <Button variant="outline" size="sm" onClick={closeAddModal}>{t('cancel')}</Button>
          ) : addStep === 'phone' ? (
            <>
              <Button variant="ghost" size="sm" onClick={openAddModal}>{t('back')}</Button>
              <Button size="sm" disabled={addCreating || !addCodePhone.replace(/\D/g, '')} onClick={submitCodePhone}>
                {addCreating ? t('requestingPairingCode') : t('requestCode')}
              </Button>
            </>
          ) : addStep === 'scan' ? (
            <Button variant="outline" size="sm" onClick={closeAddModal}>{t('cancel')}</Button>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={closeAddModal}>{t('cancel')}</Button>
              <Button size="sm" disabled={addSaving || !addName.trim() || !addPhone.trim()} onClick={confirmAndSave}>
                {addSaving ? t('savingAccount') : t('saveAccount')}
              </Button>
            </>
          )
        }
      >
        {addError && <p className="mb-3 rounded border border-danger-200 bg-danger-50 px-3 py-2 text-[13px] text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">{addError}</p>}

        {addStep === 'method' ? (
          <div className="space-y-3">
            <button type="button" disabled={addCreating} onClick={startQrFlow} className="flex w-full items-start gap-3 rounded-xl border-2 border-gray-200 p-4 text-left transition-colors hover:border-hermes-400 hover:bg-hermes-50 disabled:cursor-wait disabled:opacity-60 dark:border-gray-700 dark:hover:border-hermes-500 dark:hover:bg-hermes-900/20">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-hermes-100 text-hermes-700 dark:bg-hermes-900/40"><QrCode className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('optionQr')}</p>
                <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{t('optionQrDesc')}</p>
              </div>
            </button>
            <button type="button" onClick={chooseCodeMethod} className="flex w-full items-start gap-3 rounded-xl border-2 border-gray-200 p-4 text-left transition-colors hover:border-hermes-400 hover:bg-hermes-50 dark:border-gray-700 dark:hover:border-hermes-500 dark:hover:bg-hermes-900/20">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800"><DeviceMobile className="h-5 w-5" aria-hidden="true" /></span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('optionCode')}</p>
                <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">{t('optionCodeDesc')}</p>
              </div>
            </button>
          </div>
        ) : addStep === 'phone' ? (
          <div>
            <label className="mb-1 block text-[13px] font-medium text-gray-700 dark:text-gray-200">{t('codePhoneTitle')} <span className="text-danger-500">*</span></label>
            <input autoFocus type="tel" value={addCodePhone} onChange={(e) => setAddCodePhone(e.target.value.replace(/[^\d]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && addCodePhone.replace(/\D/g, '')) submitCodePhone(); }} placeholder={t('phonePlaceholder')} className={`w-full ${inputClass}`} />
            <p className="mt-1 text-[11px] text-gray-400">{t('phoneHint')}</p>
          </div>
        ) : addStep === 'scan' ? (
          <div className="flex flex-col items-center gap-3">
            {addConnectMethod === 'code' && addedAccountId && pairingCode[addedAccountId] ? (
              <div className="w-full rounded-xl border border-hermes-200 bg-hermes-50 p-4 dark:border-hermes-700/40 dark:bg-hermes-900/20">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-hermes-700 dark:text-hermes-400">{t('pairingCodeTitle')}</p>
                <ol className="mb-4 space-y-1.5 text-[12px] text-gray-600 dark:text-gray-300">
                  <li>{t('pairingCodeStep1')}</li>
                  <li>{t('pairingCodeStep2')}</li>
                  <li>{t('pairingCodeStep3')}</li>
                </ol>
                <p className="mb-3 select-all text-center text-[40px] font-mono font-bold tracking-[0.3em] text-gray-900 dark:text-gray-100">
                  {pairingCode[addedAccountId].length === 8 ? `${pairingCode[addedAccountId].slice(0, 4)}-${pairingCode[addedAccountId].slice(4)}` : pairingCode[addedAccountId]}
                </p>
                <button type="button" onClick={() => copyPairingCode(addedAccountId)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-hermes-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-hermes-700">
                  {copiedAccountId === addedAccountId ? <><CheckCircle className="h-4 w-4" />{t('codeCopied')}</> : <><QrCode className="h-4 w-4" />{t('copyCode')}</>}
                </button>
              </div>
            ) : addConnectMethod === 'qr' && addedAccountId && qr[addedAccountId] ? (
              <>
                <img src={qr[addedAccountId]} alt="WhatsApp QR code" className="h-56 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700" />
                {qrReceivedAt[addedAccountId] && <QrFreshness receivedAt={qrReceivedAt[addedAccountId]} t={t} />}
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-300 px-8 py-10 dark:border-gray-700">
                <QrCode className="h-10 w-10 text-gray-300" aria-hidden="true" />
                <p className="text-center text-[13px] text-gray-500">{t('waitingQr')}</p>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-hermes-400 border-t-transparent" aria-hidden="true" />
              </div>
            )}
            <div className="mt-1 flex items-center gap-2 text-[12px] text-hermes-600 dark:text-hermes-400">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-hermes-400 border-t-transparent" aria-hidden="true" />
              <span>{t('detectingDevice')}</span>
            </div>
            <p className="text-center text-[11px] text-gray-400">{t('detectingDeviceHint')}</p>
          </div>
        ) : (
          /* confirm — auto-detected name + number, editable */
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg bg-channel-50 px-3 py-2 dark:bg-channel-900/20">
              <CheckCircle className="h-4 w-4 shrink-0 text-channel-600" aria-hidden="true" weight="fill" />
              <p className="text-[12px] font-medium text-channel-700 dark:text-channel-300">{t('connectedSuccess')}</p>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-200">{t('nameLabel')} <span className="text-danger-500">*</span></label>
                {addAutoDetected && <Badge tone="hermes">{t('autoDetected')}</Badge>}
              </div>
              <input autoFocus value={addName} onChange={(e) => setAddName(e.target.value)} placeholder={t('accountNamePlaceholder')} className={`w-full ${inputClass}`} />
              <p className="mt-1 text-[11px] text-gray-400">{t('nameHint')}</p>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="block text-[13px] font-medium text-gray-700 dark:text-gray-200">{t('phoneLabel2')} <span className="text-danger-500">*</span></label>
                {addAutoDetected && <Badge tone="hermes">{t('autoDetected')}</Badge>}
              </div>
              <input type="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value.replace(/[^\d]/g, ''))} placeholder={t('phonePlaceholder')} className={`w-full ${inputClass}`} />
              <p className="mt-1 text-[11px] text-gray-400">{t('phoneHint')}</p>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}

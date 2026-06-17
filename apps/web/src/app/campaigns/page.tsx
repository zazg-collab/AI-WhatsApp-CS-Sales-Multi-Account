'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MegaphoneSimple,
  Eye,
  Plus,
  PaperPlaneTilt,
  CheckCircle,
  Pause,
  XCircle,
  ArrowCounterClockwise,
  X,
} from '@phosphor-icons/react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { api, getToken } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Field, TextareaField, SelectField } from '@/components/ui/Field';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Campaigns', en: 'Campaigns' },
  subtitle: {
    id: 'Pengiriman terkontrol dengan persetujuan, antrean, batas laju, dan audit.',
    en: 'Controlled outbound WhatsApp messaging with approval & rate limits',
  },
  createDraftHeading: { id: 'Buat draf campaign', en: 'Create campaign draft' },
  nameLabel: { id: 'Nama campaign', en: 'Campaign name' },
  senderAccountLabel: { id: 'Akun WhatsApp pengirim', en: 'Sending WhatsApp account' },
  selectAccount: { id: 'Pilih akun WhatsApp', en: 'Select a WhatsApp account' },
  attachAssetLabel: { id: 'Lampirkan media (opsional)', en: 'Attach media (optional)' },
  attachAssetHint: { id: 'Broadcast foto/video/dokumen dari Media Library.', en: 'Broadcast a photo/video/document from the Media Library.' },
  noAsset: { id: 'Tanpa media (teks saja)', en: 'No media (text only)' },
  captionHint: { id: 'Pesan ini menjadi caption media. Token {{name}} / {{phone}} tetap berlaku.', en: 'This message becomes the media caption. {{name}} / {{phone}} tokens still apply.' },
  messageLabel: { id: 'Isi pesan', en: 'Message body' },
  messageHint: {
    id: 'Gunakan token {{name}} / {{phone}} untuk personalisasi.',
    en: 'Use {{name}} / {{phone}} tokens for personalization.',
  },
  leadStageLabel: { id: 'Tahap lead', en: 'Lead stage' },
  allStages: { id: 'Semua tahap', en: 'All stages' },
  tagFilterLabel: { id: 'Filter tag', en: 'Tag filter' },
  tagPlaceholder: { id: 'mis. promo-juni', en: 'e.g. june-promo' },
  rateLabel: { id: 'Laju/menit', en: 'Rate/minute' },
  rateHint: { id: 'Maks. 30 pesan per menit.', en: 'Max. 30 messages per minute.' },
  scheduleLabel: { id: 'Jadwal kirim', en: 'Send schedule' },
  scheduleHint: {
    id: 'Opsional. Kosongkan untuk kirim manual.',
    en: 'Optional. Leave empty to send manually.',
  },
  preview: { id: 'Pratinjau', en: 'Preview' },
  createDraft: { id: 'Buat draf', en: 'Create draft' },
  eligibleRecipients: { id: 'penerima memenuhi syarat', en: 'eligible recipients' },
  skipped: { id: 'Dilewati:', en: 'Skipped:' },
  none: { id: 'tidak ada', en: 'none' },
  noCampaigns: { id: 'Belum ada campaign.', en: 'No campaigns yet.' },
  createDraftAbove: { id: 'Buat draf di atas untuk memulai.', en: 'Create a draft above to get started.' },
  waitingDraft: { id: 'Menunggu draf dibuat oleh admin.', en: 'Waiting for an admin to create a draft.' },
  noAccount: { id: 'Tanpa akun', en: 'No account' },
  recipientsSuffix: { id: 'penerima', en: 'recipients' },
  closeToast: { id: 'Tutup notifikasi', en: 'Close notification' },
  emptyDetail: {
    id: 'Pilih campaign untuk melihat detail dan progres pengiriman.',
    en: 'Select a campaign to view details and sending progress.',
  },
  ratePer: { id: 'laju {n}/menit', en: 'rate {n}/minute' },
  submitApproval: { id: 'Ajukan persetujuan', en: 'Submit for approval' },
  approve: { id: 'Setujui', en: 'Approve' },
  startQueue: { id: 'Mulai antrean', en: 'Start queue' },
  pauseAction: { id: 'Jeda', en: 'Pause' },
  cancelAction: { id: 'Batalkan', en: 'Cancel' },
  retryFailed: { id: 'Coba ulang yang gagal', en: 'Retry failed' },
  statusPending: { id: 'Menunggu', en: 'Pending' },
  statusQueued: { id: 'Antrean', en: 'Queued' },
  statusSending: { id: 'Mengirim', en: 'Sending' },
  statusSent: { id: 'Terkirim', en: 'Sent' },
  statusFailed: { id: 'Gagal', en: 'Failed' },
  recipientSample: { id: 'Contoh daftar penerima', en: 'Sample recipient list' },
  noRecipients: {
    id: 'Belum ada penerima. Jalankan pratinjau lalu buat draf untuk mengisi antrean.',
    en: 'No recipients yet. Run a preview then create a draft to fill the queue.',
  },
  toastLoadCampaigns: {
    id: 'Gagal memuat campaign. Coba muat ulang.',
    en: 'Failed to load campaigns. Try reloading.',
  },
  toastLoadDetail: { id: 'Gagal memuat detail campaign.', en: 'Failed to load campaign details.' },
  toastSelectAccount: {
    id: 'Pilih akun WhatsApp dulu sebelum melihat pratinjau.',
    en: 'Select a WhatsApp account before previewing.',
  },
  toastPreviewFailed: { id: 'Pratinjau gagal dimuat.', en: 'Preview failed to load.' },
  toastRequired: {
    id: 'Nama, pesan, dan akun WhatsApp wajib diisi.',
    en: 'Name, message, and WhatsApp account are required.',
  },
  toastDraftCreated: {
    id: 'Draf campaign dibuat. Ajukan persetujuan dulu sebelum dikirim.',
    en: 'Campaign draft created. Submit for approval before sending.',
  },
  toastCreateFailed: { id: 'Gagal membuat campaign.', en: 'Failed to create campaign.' },
  toastActionOk: { id: 'Aksi "{action}" berhasil.', en: 'Action "{action}" succeeded.' },
  toastActionFailed: {
    id: 'Aksi "{action}" gagal dijalankan.',
    en: 'Action "{action}" failed to run.',
  },
  confirmApprove: {
    id: 'Setujui campaign ini? Setelah disetujui, campaign siap dikirim ke semua penerima.',
    en: 'Approve this campaign? Once approved, it is ready to send to all recipients.',
  },
  confirmStart: {
    id: 'Mulai kirim campaign ini ke semua penerima dalam antrean sekarang?',
    en: 'Start sending this campaign to all queued recipients now?',
  },
  confirmCancel: {
    id: 'Batalkan campaign ini? Penerima yang masih menunggu akan dilewati.',
    en: 'Cancel this campaign? Recipients still waiting will be skipped.',
  },
  confirmActionTitle: { id: 'Konfirmasi aksi', en: 'Confirm action' },
  confirmActionButton: { id: 'Ya, lanjutkan', en: 'Yes, continue' },
  cancelButton: { id: 'Batal', en: 'Cancel' },
};

type Role = 'owner' | 'supervisor' | 'admin' | 'viewer';
type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';
type BadgeTone = 'neutral' | 'hermes' | 'channel' | 'review' | 'danger' | 'success';

interface Account {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus?: string;
}

interface Campaign {
  id: string;
  name: string;
  messageTemplate: string;
  status: string;
  rateLimitPerMinute: number;
  scheduledAt?: string | null;
  createdAt: string;
  whatsappAccount?: Account;
  _count?: { recipients: number };
  recipientStats?: Record<string, number>;
}

interface PreviewResult {
  eligibleCount: number;
  skipped: Record<string, number>;
  sample: { customerId: string; name?: string; phoneNumber: string; tags: string[] }[];
}

const statusTone: Record<string, BadgeTone> = {
  draft: 'neutral',
  pending_approval: 'review',
  approved: 'hermes',
  scheduled: 'hermes',
  running: 'channel',
  paused: 'review',
  completed: 'success',
  cancelled: 'neutral',
  failed: 'danger',
};

function getRoleFromToken(): Role | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split('.')[1])).role ?? null;
  } catch {
    return null;
  }
}

export default function CampaignsPage() {
  const t = useT(dict);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'error' | 'success' } | null>(null);
  const showError = (msg: string) => setToast({ msg, tone: 'error' });
  const showOk = (msg: string) => setToast({ msg, tone: 'success' });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [whatsappAccountId, setWhatsappAccountId] = useState('');
  const [leadStage, setLeadStage] = useState('');
  const [tag, setTag] = useState('');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(6);
  const [scheduledAt, setScheduledAt] = useState('');
  const [assetId, setAssetId] = useState('');
  const [pendingAction, setPendingAction] = useState<{ action: 'approve' | 'start' | 'cancel'; message: string } | null>(null);
  const [assetOptions, setAssetOptions] = useState<Array<{ id: string; title: string; kind: string; purpose: string }>>([]);

  const canManage = role === 'owner' || role === 'supervisor' || role === 'admin';
  const canApprove = role === 'owner' || role === 'supervisor';
  const selectedAccount = accounts.find(a => a.id === whatsappAccountId);
  const isSelectedAccountConnected = selectedAccount?.sessionStatus === 'connected';

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedId) ?? null,
    [campaigns, selectedId],
  );

  const targetFilter = useMemo(() => ({
    ...(leadStage ? { leadStage: leadStage as LeadStage } : {}),
    ...(tag.trim() ? { tag: tag.trim() } : {}),
  }), [leadStage, tag]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const [campaignData, accountData] = await Promise.all([
        api<Campaign[]>('/campaigns'),
        api<Account[]>('/wa/accounts'),
      ]);
      setCampaigns(campaignData);
      setAccounts(accountData);
      if (!whatsappAccountId && accountData[0]) setWhatsappAccountId(accountData[0].id);
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastLoadCampaigns'));
    } finally {
      setLoading(false);
    }
  }, [whatsappAccountId, t]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<Campaign>(`/campaigns/${id}`));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastLoadDetail'));
    }
  }, [t]);

  useEffect(() => {
    setRole(getRoleFromToken());
    loadCampaigns();
    api<Array<{ id: string; title: string; kind: string; purpose: string }>>('/assets?status=active')
      .then(setAssetOptions)
      .catch(() => setAssetOptions([]));
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function handlePreview() {
    if (!whatsappAccountId) {
      showError(t('toastSelectAccount'));
      return;
    }
    setSubmitting(true);
    try {
      setPreview(await api<PreviewResult>('/campaigns/preview', {
        method: 'POST',
        body: JSON.stringify({ whatsappAccountId, targetFilter }),
      }));
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastPreviewFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function createCampaign() {
    if (!name.trim() || !messageTemplate.trim() || !whatsappAccountId) {
      showError(t('toastRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const campaign = await api<Campaign>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          messageTemplate,
          whatsappAccountId,
          assetId: assetId || undefined,
          targetFilter,
          rateLimitPerMinute,
          scheduledAt: scheduledAt || undefined,
        }),
      });
      showOk(t('toastDraftCreated'));
      setSelectedId(campaign.id);
      setName('');
      setMessageTemplate('');
      setAssetId('');
      await loadCampaigns();
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(action: 'submit' | 'approve' | 'start' | 'pause' | 'cancel' | 'retry-failed') {
    if (!selectedCampaign) return;
    // Confirm high-consequence actions: approving or starting a campaign
    // authorizes outbound messages to real customers.
    const confirmMessages: Partial<Record<typeof action, string>> = {
      approve: t('confirmApprove'),
      start: t('confirmStart'),
      cancel: t('confirmCancel'),
    };
    const confirmMsg = confirmMessages[action];
    if (confirmMsg) {
      setPendingAction({ action: action as 'approve' | 'start' | 'cancel', message: confirmMsg });
      return;
    }
    await executeAction(action);
  }

  async function executeAction(action: 'submit' | 'approve' | 'start' | 'pause' | 'cancel' | 'retry-failed') {
    if (!selectedCampaign) return;
    setSubmitting(true);
    try {
      await api(`/campaigns/${selectedCampaign.id}/${action}`, { method: 'POST' });
      showOk(t('toastActionOk', { action }));
      await loadCampaigns();
      await loadDetail(selectedCampaign.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastActionFailed', { action }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')} />
      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {/* Left: create + list */}
        <aside className="scrollbar-thin w-96 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          {canManage && (
            <Card className="mb-4 space-y-3 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('createDraftHeading')}</h2>
              <Field
                label={t('nameLabel')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Campaign name"
              />
              <SelectField
                label={t('senderAccountLabel')}
                value={whatsappAccountId}
                onChange={(e) => setWhatsappAccountId(e.target.value)}
              >
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
                  Account disconnected. <a href="/accounts" className="font-semibold underline">Reconnect in Accounts</a> before sending.
                </div>
              )}
              <TextareaField
                label={t('messageLabel')}
                hint={assetId ? t('captionHint') : t('messageHint')}
                rows={4}
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder="Campaign message… use {{name}} / {{phone}} tokens"
                className="resize-none"
              />
              {assetOptions.length > 0 && (
                <SelectField
                  label={t('attachAssetLabel')}
                  hint={t('attachAssetHint')}
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                >
                  <option value="">{t('noAsset')}</option>
                  {assetOptions.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.kind === 'image' ? '🖼️' : a.kind === 'video' ? '🎬' : '📄'} {a.title} ({a.purpose})
                    </option>
                  ))}
                </SelectField>
              )}
              <div className="grid grid-cols-2 gap-2">
                <SelectField
                  label={t('leadStageLabel')}
                  value={leadStage}
                  onChange={(e) => setLeadStage(e.target.value)}
                >
                  <option value="">{t('allStages')}</option>
                  <option value="cold">Cold</option>
                  <option value="warm">Warm</option>
                  <option value="hot">Hot</option>
                  <option value="very_hot">Very Hot</option>
                </SelectField>
                <Field
                  label={t('tagFilterLabel')}
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  placeholder={t('tagPlaceholder')}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label={t('rateLabel')}
                  hint={t('rateHint')}
                  type="number"
                  min={1}
                  max={30}
                  value={rateLimitPerMinute}
                  onChange={(e) => setRateLimitPerMinute(Number(e.target.value))}
                />
                <Field
                  label={t('scheduleLabel')}
                  hint={t('scheduleHint')}
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="md" className="flex-1" onClick={handlePreview} disabled={submitting || !isSelectedAccountConnected}>
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  {t('preview')}
                </Button>
                <Button size="md" className="flex-1" onClick={createCampaign} disabled={submitting || !isSelectedAccountConnected}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('createDraft')}
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
              <p className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
                {t('noCampaigns')} {canManage ? t('createDraftAbove') : t('waitingDraft')}
              </p>
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
                    <Button variant="review" size="sm" onClick={() => runAction('submit')} disabled={submitting || !isSelectedAccountConnected}>
                      <PaperPlaneTilt className="h-4 w-4" aria-hidden="true" />
                      {t('submitApproval')}
                    </Button>
                  )}
                  {canApprove && detail.status === 'pending_approval' && (
                    <Button size="sm" onClick={() => runAction('approve')} disabled={submitting || !isSelectedAccountConnected}>
                      <CheckCircle className="h-4 w-4" aria-hidden="true" />
                      {t('approve')}
                    </Button>
                  )}
                  {canApprove && ['approved', 'paused', 'scheduled'].includes(detail.status) && (
                    <Button size="sm" onClick={() => runAction('start')} disabled={submitting || !isSelectedAccountConnected}>
                      <PaperPlaneTilt className="h-4 w-4" aria-hidden="true" />
                      {t('startQueue')}
                    </Button>
                  )}
                  {canApprove && ['running', 'scheduled'].includes(detail.status) && (
                    <Button variant="outline" size="sm" onClick={() => runAction('pause')} disabled={submitting}>
                      <Pause className="h-4 w-4" aria-hidden="true" />
                      {t('pauseAction')}
                    </Button>
                  )}
                  {canApprove && !['completed', 'cancelled'].includes(detail.status) && (
                    <Button variant="danger" size="sm" onClick={() => runAction('cancel')} disabled={submitting}>
                      <XCircle className="h-4 w-4" aria-hidden="true" />
                      {t('cancelAction')}
                    </Button>
                  )}
                  {canApprove && detail.status === 'failed' && (
                    <Button variant="outline" size="sm" onClick={() => runAction('retry-failed')} disabled={submitting}>
                      <ArrowCounterClockwise className="h-4 w-4" aria-hidden="true" />
                      {t('retryFailed')}
                    </Button>
                  )}
                </div>
              </Card>

              <section className="grid gap-3 md:grid-cols-5">
                {([
                  ['pending', 'statusPending'],
                  ['queued', 'statusQueued'],
                  ['sending', 'statusSending'],
                  ['sent', 'statusSent'],
                  ['failed', 'statusFailed'],
                ] as const).map(([status, labelKey]) => (
                  <Card key={status} className="p-4">
                    <div className="text-[11px] uppercase tracking-wider text-gray-400">{t(labelKey)}</div>
                    <div
                      className={`mt-1 text-2xl font-semibold tabular-nums ${
                        status === 'failed' && (detail.recipientStats?.failed ?? 0) > 0
                          ? 'text-danger-600 dark:text-danger-400'
                          : status === 'sent'
                            ? 'text-channel-700 dark:text-channel-500'
                            : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {detail.recipientStats?.[status] ?? 0}
                    </div>
                  </Card>
                ))}
              </section>

              <Card>
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-800 dark:border-gray-800 dark:text-gray-200">
                  {t('recipientSample')}
                </div>
                <div className="scrollbar-thin max-h-[420px] overflow-y-auto">
                  {!(detail as any).recipients?.length && (
                    <p className="px-4 py-6 text-center text-xs text-gray-500 dark:text-gray-400">
                      {t('noRecipients')}
                    </p>
                  )}
                  {(detail as any).recipients?.map((recipient: any) => (
                    <div
                      key={recipient.id}
                      className="grid grid-cols-[1fr_120px] gap-3 border-b border-gray-50 px-4 py-3 text-sm last:border-0 dark:border-gray-800/60"
                    >
                      <div>
                        <div className="text-gray-900 dark:text-gray-100">{recipient.customer?.name || recipient.phoneNumber}</div>
                        <div className="text-xs text-gray-400">
                          {recipient.phoneNumber} {recipient.error ? `· ${recipient.error}` : ''}
                        </div>
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
    </AppLayout>
  );
}

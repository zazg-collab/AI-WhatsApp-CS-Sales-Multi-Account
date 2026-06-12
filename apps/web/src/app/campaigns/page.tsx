'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Megaphone,
  Eye,
  Plus,
  Send,
  CircleCheck,
  Pause,
  CircleX,
  RotateCcw,
  X,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { api, getToken } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

type Role = 'owner' | 'supervisor' | 'admin' | 'viewer';
type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';
type BadgeTone = 'neutral' | 'hermes' | 'channel' | 'review' | 'danger' | 'success';

interface Account {
  id: string;
  accountName: string;
  phoneNumber: string;
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

const inputClass =
  'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';

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
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [toast, setToast] = useState<string | null>(null);
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

  const canManage = role === 'owner' || role === 'supervisor' || role === 'admin';
  const canApprove = role === 'owner' || role === 'supervisor';

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
      setToast(err instanceof Error ? err.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [whatsappAccountId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetail(await api<Campaign>(`/campaigns/${id}`));
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to load campaign detail');
    }
  }, []);

  useEffect(() => {
    setRole(getRoleFromToken());
    loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function handlePreview() {
    if (!whatsappAccountId) {
      setToast('Pilih WhatsApp account dulu.');
      return;
    }
    setSubmitting(true);
    try {
      setPreview(await api<PreviewResult>('/campaigns/preview', {
        method: 'POST',
        body: JSON.stringify({ whatsappAccountId, targetFilter }),
      }));
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function createCampaign() {
    if (!name.trim() || !messageTemplate.trim() || !whatsappAccountId) {
      setToast('Nama, pesan, dan WhatsApp account wajib diisi.');
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
          targetFilter,
          rateLimitPerMinute,
          scheduledAt: scheduledAt || undefined,
        }),
      });
      setToast('Campaign draft dibuat. Submit untuk approval sebelum dikirim.');
      setSelectedId(campaign.id);
      setName('');
      setMessageTemplate('');
      await loadCampaigns();
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Create campaign failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(action: 'submit' | 'approve' | 'start' | 'pause' | 'cancel' | 'retry-failed') {
    if (!selectedCampaign) return;
    // Confirm high-consequence actions: approving or starting a campaign
    // authorizes outbound messages to real customers.
    const confirmMessages: Partial<Record<typeof action, string>> = {
      approve: 'Approve this campaign? It will be cleared for sending to all recipients.',
      start: 'Start sending this campaign to all queued recipients now?',
      cancel: 'Cancel this campaign? Pending recipients will be skipped.',
    };
    const confirmMsg = confirmMessages[action];
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setSubmitting(true);
    try {
      await api(`/campaigns/${selectedCampaign.id}/${action}`, { method: 'POST' });
      setToast(`Campaign action ${action} berhasil.`);
      await loadCampaigns();
      await loadDetail(selectedCampaign.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : `Action ${action} failed`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-1 overflow-hidden">
        {/* Left: create + list */}
        <aside className="scrollbar-thin w-96 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="mb-4">
            <h1 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
              <Megaphone className="h-[18px] w-[18px] text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
              Campaigns
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Controlled messaging with approval, queue, rate limit, and audit.
            </p>
          </div>

          {canManage && (
            <Card className="mb-4 space-y-3 p-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create campaign draft</h2>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className={inputClass} />
              <select value={whatsappAccountId} onChange={(e) => setWhatsappAccountId(e.target.value)} className={inputClass}>
                <option value="">Select WhatsApp account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.accountName} ({account.phoneNumber})</option>
                ))}
              </select>
              <textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder="Campaign message… use {{name}} / {{phone}} tokens"
                className={`h-28 ${inputClass}`}
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={leadStage} onChange={(e) => setLeadStage(e.target.value)} className={inputClass}>
                  <option value="">All stages</option>
                  <option value="cold">Cold</option>
                  <option value="warm">Warm</option>
                  <option value="hot">Hot</option>
                  <option value="very_hot">Very Hot</option>
                </select>
                <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="Filter tag" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  Rate/min
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={rateLimitPerMinute}
                    onChange={(e) => setRateLimitPerMinute(Number(e.target.value))}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-xs text-gray-500 dark:text-gray-400">
                  Schedule
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="md" className="flex-1" onClick={handlePreview} disabled={submitting}>
                  <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Preview
                </Button>
                <Button size="md" className="flex-1" onClick={createCampaign} disabled={submitting}>
                  <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Create draft
                </Button>
              </div>
              {preview && (
                <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <div><span className="font-semibold text-hermes-600">{preview.eligibleCount}</span> eligible recipients</div>
                  <div className="mt-1 text-gray-400">
                    Skipped: {Object.entries(preview.skipped).map(([key, value]) => `${key} ${value}`).join(', ') || 'none'}
                  </div>
                </div>
              )}
            </Card>
          )}

          <div className="space-y-2">
            {loading ? (
              <p className="text-sm text-gray-500">Loading…</p>
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
                      {campaign.whatsappAccount?.accountName ?? 'No account'} · {campaign._count?.recipients ?? 0} recipients
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
              className="mb-4 flex items-center gap-2 rounded-lg border border-hermes-100 bg-hermes-50 px-3 py-2 text-sm text-hermes-700 dark:border-hermes-800 dark:bg-hermes-900/30 dark:text-hermes-200"
            >
              {toast}
              <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          )}

          {!detail ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-gray-400">
              <Megaphone className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
              <p className="text-sm">Select a campaign to view details.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">{detail.name}</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {detail.whatsappAccount?.accountName} · rate {detail.rateLimitPerMinute}/min
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
                      <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Submit for approval
                    </Button>
                  )}
                  {canApprove && detail.status === 'pending_approval' && (
                    <Button size="sm" onClick={() => runAction('approve')} disabled={submitting}>
                      <CircleCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Approve
                    </Button>
                  )}
                  {canApprove && ['approved', 'paused', 'scheduled'].includes(detail.status) && (
                    <Button size="sm" onClick={() => runAction('start')} disabled={submitting}>
                      <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Start queue
                    </Button>
                  )}
                  {canApprove && ['running', 'scheduled'].includes(detail.status) && (
                    <Button variant="outline" size="sm" onClick={() => runAction('pause')} disabled={submitting}>
                      <Pause className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Pause
                    </Button>
                  )}
                  {canApprove && !['completed', 'cancelled'].includes(detail.status) && (
                    <Button variant="danger" size="sm" onClick={() => runAction('cancel')} disabled={submitting}>
                      <CircleX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Cancel
                    </Button>
                  )}
                  {canApprove && detail.status === 'failed' && (
                    <Button variant="outline" size="sm" onClick={() => runAction('retry-failed')} disabled={submitting}>
                      <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Retry failed
                    </Button>
                  )}
                </div>
              </Card>

              <section className="grid gap-3 md:grid-cols-5">
                {['pending', 'queued', 'sending', 'sent', 'failed'].map((status) => (
                  <Card key={status} className="p-4">
                    <div className="text-[11px] uppercase tracking-wider text-gray-400">{status}</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {detail.recipientStats?.[status] ?? 0}
                    </div>
                  </Card>
                ))}
              </section>

              <Card>
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-800 dark:border-gray-800 dark:text-gray-200">
                  Recipients sample
                </div>
                <div className="scrollbar-thin max-h-[420px] overflow-y-auto">
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
    </AppLayout>
  );
}

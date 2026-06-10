'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { api, getToken } from '@/lib/api';

type Role = 'owner' | 'supervisor' | 'admin' | 'viewer';
type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';

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

const statusColors: Record<string, string> = {
  draft: 'bg-gray-700 text-gray-100',
  pending_approval: 'bg-yellow-900/70 text-yellow-200',
  approved: 'bg-blue-900/70 text-blue-200',
  scheduled: 'bg-indigo-900/70 text-indigo-200',
  running: 'bg-emerald-900/70 text-emerald-200',
  paused: 'bg-orange-900/70 text-orange-200',
  completed: 'bg-green-900/70 text-green-200',
  cancelled: 'bg-gray-800 text-gray-400',
  failed: 'bg-red-900/70 text-red-200',
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
    // Confirm high-consequence actions (M7): approving or starting a campaign
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
        <aside className="w-96 shrink-0 overflow-y-auto border-r border-gray-700 bg-gray-900 p-5">
          <div className="mb-5">
            <h1 className="text-xl font-semibold text-gray-100">Campaigns</h1>
            <p className="text-sm text-gray-400">Controlled messaging dengan approval, queue, rate limit, dan audit.</p>
          </div>

          {canManage && (
            <div className="mb-5 space-y-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
              <h2 className="font-medium text-emerald-300">Create Campaign Draft</h2>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nama campaign"
                className="w-full rounded bg-gray-900 px-3 py-2 text-sm outline-none"
              />
              <select
                value={whatsappAccountId}
                onChange={(event) => setWhatsappAccountId(event.target.value)}
                className="w-full rounded bg-gray-900 px-3 py-2 text-sm outline-none"
              >
                <option value="">Pilih WhatsApp account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.accountName} ({account.phoneNumber})</option>
                ))}
              </select>
              <textarea
                value={messageTemplate}
                onChange={(event) => setMessageTemplate(event.target.value)}
                placeholder="Tulis pesan campaign..."
                className="h-28 w-full rounded bg-gray-900 px-3 py-2 text-sm outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={leadStage}
                  onChange={(event) => setLeadStage(event.target.value)}
                  className="rounded bg-gray-900 px-3 py-2 text-sm outline-none"
                >
                  <option value="">Semua stage</option>
                  <option value="cold">Cold</option>
                  <option value="warm">Warm</option>
                  <option value="hot">Hot</option>
                  <option value="very_hot">Very Hot</option>
                </select>
                <input
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder="Filter tag"
                  className="rounded bg-gray-900 px-3 py-2 text-sm outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-400">
                  Rate/min
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={rateLimitPerMinute}
                    onChange={(event) => setRateLimitPerMinute(Number(event.target.value))}
                    className="mt-1 w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
                  />
                </label>
                <label className="text-xs text-gray-400">
                  Schedule
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    className="mt-1 w-full rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handlePreview}
                  disabled={submitting}
                  className="flex-1 rounded border border-gray-600 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
                >
                  Preview
                </button>
                <button
                  onClick={createCampaign}
                  disabled={submitting}
                  className="flex-1 rounded bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  Create Draft
                </button>
              </div>
              {preview && (
                <div className="rounded bg-gray-900 p-3 text-xs text-gray-300">
                  <div><span className="font-semibold text-emerald-300">{preview.eligibleCount}</span> eligible recipients</div>
                  <div className="mt-1 text-gray-500">Skipped: {Object.entries(preview.skipped).map(([key, value]) => `${key} ${value}`).join(', ')}</div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            {loading ? <p className="text-sm text-gray-400">Loading...</p> : campaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => setSelectedId(campaign.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left ${selectedId === campaign.id ? 'border-emerald-500 bg-emerald-950/30' : 'border-gray-700 bg-gray-800 hover:bg-gray-700/60'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-100">{campaign.name}</span>
                  <span className={`rounded px-2 py-1 text-xs ${statusColors[campaign.status] ?? 'bg-gray-700'}`}>{campaign.status}</span>
                </div>
                <div className="mt-1 text-xs text-gray-500">{campaign.whatsappAccount?.accountName ?? 'No account'} · {campaign._count?.recipients ?? 0} recipients</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-6">
          {toast && (
            <button onClick={() => setToast(null)} className="mb-4 rounded border border-emerald-700 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-200">
              {toast}
            </button>
          )}

          {!detail ? (
            <div className="flex h-full items-center justify-center text-gray-500">Pilih campaign untuk melihat detail.</div>
          ) : (
            <div className="space-y-5">
              <section className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold text-gray-100">{detail.name}</h2>
                    <p className="mt-1 text-sm text-gray-400">{detail.whatsappAccount?.accountName} · rate {detail.rateLimitPerMinute}/min</p>
                  </div>
                  <span className={`rounded px-3 py-1 text-sm ${statusColors[detail.status] ?? 'bg-gray-700'}`}>{detail.status}</span>
                </div>
                <pre className="mt-4 whitespace-pre-wrap rounded bg-gray-900 p-4 text-sm text-gray-200">{detail.messageTemplate}</pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  {canManage && ['draft', 'pending_approval'].includes(detail.status) && (
                    <button onClick={() => runAction('submit')} disabled={submitting} className="rounded bg-yellow-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Submit Approval</button>
                  )}
                  {canApprove && detail.status === 'pending_approval' && (
                    <button onClick={() => runAction('approve')} disabled={submitting} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Approve</button>
                  )}
                  {canApprove && ['approved', 'paused', 'scheduled'].includes(detail.status) && (
                    <button onClick={() => runAction('start')} disabled={submitting} className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Start Queue</button>
                  )}
                  {canApprove && ['running', 'scheduled'].includes(detail.status) && (
                    <button onClick={() => runAction('pause')} disabled={submitting} className="rounded bg-orange-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Pause</button>
                  )}
                  {canApprove && !['completed', 'cancelled'].includes(detail.status) && (
                    <button onClick={() => runAction('cancel')} disabled={submitting} className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Cancel</button>
                  )}
                  {canApprove && detail.status === 'failed' && (
                    <button onClick={() => runAction('retry-failed')} disabled={submitting} className="rounded bg-purple-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Retry Failed</button>
                  )}
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-5">
                {['pending', 'queued', 'sending', 'sent', 'failed'].map((status) => (
                  <div key={status} className="rounded-lg border border-gray-700 bg-gray-800 p-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">{status}</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-100">{detail.recipientStats?.[status] ?? 0}</div>
                  </div>
                ))}
              </section>

              <section className="rounded-lg border border-gray-700 bg-gray-800">
                <div className="border-b border-gray-700 px-4 py-3 text-sm font-medium text-gray-200">Recipients sample</div>
                <div className="max-h-[420px] overflow-y-auto">
                  {(detail as any).recipients?.map((recipient: any) => (
                    <div key={recipient.id} className="grid grid-cols-[1fr_120px] gap-3 border-b border-gray-700 px-4 py-3 text-sm">
                      <div>
                        <div className="text-gray-100">{recipient.customer?.name || recipient.phoneNumber}</div>
                        <div className="text-xs text-gray-500">{recipient.phoneNumber} {recipient.error ? `· ${recipient.error}` : ''}</div>
                      </div>
                      <span className="text-right text-gray-300">{recipient.status}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}

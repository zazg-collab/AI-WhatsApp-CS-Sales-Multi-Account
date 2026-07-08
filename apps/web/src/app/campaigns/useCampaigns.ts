'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from './campaigns.i18n';

type Role = 'owner' | 'supervisor' | 'admin' | 'viewer';
type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';
type BadgeTone = 'neutral' | 'sentinel' | 'channel' | 'review' | 'danger' | 'success';

export interface Account {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus?: string;
}

export interface Campaign {
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

export interface PreviewResult {
  eligibleCount: number;
  skipped: Record<string, number>;
  sample: { customerId: string; name?: string; phoneNumber: string; tags: string[] }[];
}

export interface OptedOutCustomer {
  id: string;
  name: string | null;
  phoneNumber: string;
  optedOutAt: string | null;
  tags: string[];
}

export const statusTone: Record<string, BadgeTone> = {
  draft: 'neutral',
  pending_approval: 'review',
  approved: 'sentinel',
  scheduled: 'sentinel',
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

export function useCampaigns() {
  const t = useT(dict);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [toast, setToast] = useState<{ msg: string; tone: 'error' | 'success' } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: 'approve' | 'start' | 'cancel'; message: string } | null>(null);
  const [assetOptions, setAssetOptions] = useState<Array<{ id: string; title: string; kind: string; purpose: string }>>([]);
  const [showOptOut, setShowOptOut] = useState(false);
  const [optedOut, setOptedOut] = useState<OptedOutCustomer[]>([]);
  const [optedOutTotal, setOptedOutTotal] = useState(0);
  const [optOutLoading, setOptOutLoading] = useState(false);

  const DRAFT_KEY = 'sentinel_campaign_draft';
  const savedDraft = (() => {
    if (typeof window === 'undefined') return null;
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null'); } catch { return null; }
  })();

  const [name, setName] = useState<string>(savedDraft?.name ?? '');
  const [messageTemplate, setMessageTemplate] = useState<string>(savedDraft?.messageTemplate ?? '');
  const [whatsappAccountId, setWhatsappAccountId] = useState<string>(savedDraft?.whatsappAccountId ?? '');
  const [leadStage, setLeadStage] = useState<string>(savedDraft?.leadStage ?? '');
  const [tag, setTag] = useState<string>(savedDraft?.tag ?? '');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState<number>(savedDraft?.rateLimitPerMinute ?? 20);
  const [scheduledAt, setScheduledAt] = useState<string>(savedDraft?.scheduledAt ?? '');
  const [assetId, setAssetId] = useState<string>(savedDraft?.assetId ?? '');

  const showError = (msg: string) => setToast({ msg, tone: 'error' });
  const showOk = (msg: string) => setToast({ msg, tone: 'success' });

  const canManage = role === 'owner' || role === 'supervisor' || role === 'admin';
  const canApprove = role === 'owner' || role === 'supervisor';

  const selectedAccount = accounts.find(a => a.id === whatsappAccountId);
  const isSelectedAccountConnected = selectedAccount?.sessionStatus === 'connected';
  const detailAccount = detail ? accounts.find(a => a.id === detail.whatsappAccount?.id) : undefined;
  const isDetailAccountConnected = detailAccount?.sessionStatus === 'connected';

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedId) ?? null,
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
      // Default to the (single) connected account — it's the obvious sender.
      // Fall back to the first account only if none are connected.
      if (!whatsappAccountId && accountData.length) {
        const connected = accountData.find((a) => a.sessionStatus === 'connected');
        setWhatsappAccountId((connected ?? accountData[0]).id);
      }
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
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        name, messageTemplate, whatsappAccountId, leadStage, tag, rateLimitPerMinute, scheduledAt, assetId,
      }));
    } catch { /* ok */ }
  }, [name, messageTemplate, whatsappAccountId, leadStage, tag, rateLimitPerMinute, scheduledAt, assetId]);

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

  // Live eligible-recipient count: debounced auto-preview as the account or
  // filters change, so the user sees "≈ N recipients" without a manual click.
  useEffect(() => {
    if (!whatsappAccountId) { setLiveCount(null); return; }
    let cancelled = false;
    setCounting(true);
    const handle = setTimeout(async () => {
      try {
        const r = await api<PreviewResult>('/campaigns/preview', {
          method: 'POST',
          body: JSON.stringify({ whatsappAccountId, targetFilter }),
        });
        if (!cancelled) setLiveCount(r.eligibleCount);
      } catch {
        if (!cancelled) setLiveCount(null);
      } finally {
        if (!cancelled) setCounting(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [whatsappAccountId, targetFilter]);

  async function handlePreview() {
    if (!whatsappAccountId) { showError(t('toastSelectAccount')); return; }
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
    if (messageTemplate.length > 4096) {
      showError(t('toastMsgTooLong'));
      return;
    }
    if (rateLimitPerMinute > 30) {
      showError(t('toastRateTooHigh'));
      return;
    }
    if (scheduledAt && new Date(scheduledAt) <= new Date()) {
      showError(t('toastSchedulePast'));
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
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ok */ }
      await loadCampaigns();
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastCreateFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const loadOptedOut = useCallback(async () => {
    setOptOutLoading(true);
    try {
      const r = await api<{ items: OptedOutCustomer[]; total: number }>('/campaigns/opted-out/list');
      setOptedOut(Array.isArray(r.items) ? r.items : []);
      setOptedOutTotal(r.total ?? 0);
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastOptOutLoad'));
    } finally {
      setOptOutLoading(false);
    }
  }, [t]);

  function openOptOut() {
    setShowOptOut(true);
    loadOptedOut();
  }

  async function reverseOptOut(customerId: string) {
    setSubmitting(true);
    try {
      await api('/campaigns/opt-in', { method: 'POST', body: JSON.stringify({ customerId }) });
      showOk(t('toastOptInOk'));
      await loadOptedOut();
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastOptInFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function duplicateCampaign() {
    if (!selectedCampaign) return;
    setSubmitting(true);
    try {
      const copy = await api<Campaign>(`/campaigns/${selectedCampaign.id}/duplicate`, { method: 'POST' });
      showOk(t('toastDuplicated'));
      await loadCampaigns();
      setSelectedId(copy.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : t('toastDuplicateFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function runAction(action: 'submit' | 'approve' | 'start' | 'pause' | 'cancel' | 'retry-failed') {
    if (!selectedCampaign) return;
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

  return {
    t, campaigns, accounts, selectedId, setSelectedId, detail,
    role, toast, setToast,
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
    selectedCampaign,
    handlePreview, createCampaign, runAction, executeAction, duplicateCampaign,
    showOptOut, setShowOptOut, optedOut, optedOutTotal, optOutLoading,
    openOptOut, reverseOptOut,
  };
}

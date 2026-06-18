'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from './campaigns.i18n';

type Role = 'owner' | 'supervisor' | 'admin' | 'viewer';
type LeadStage = 'cold' | 'warm' | 'hot' | 'very_hot';
type BadgeTone = 'neutral' | 'hermes' | 'channel' | 'review' | 'danger' | 'success';

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

export const statusTone: Record<string, BadgeTone> = {
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
  const [pendingAction, setPendingAction] = useState<{ action: 'approve' | 'start' | 'cancel'; message: string } | null>(null);
  const [assetOptions, setAssetOptions] = useState<Array<{ id: string; title: string; kind: string; purpose: string }>>([]);

  const [name, setName] = useState('');
  const [messageTemplate, setMessageTemplate] = useState('');
  const [whatsappAccountId, setWhatsappAccountId] = useState('');
  const [leadStage, setLeadStage] = useState('');
  const [tag, setTag] = useState('');
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(6);
  const [scheduledAt, setScheduledAt] = useState('');
  const [assetId, setAssetId] = useState('');

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
    handlePreview, createCampaign, runAction, executeAction,
  };
}

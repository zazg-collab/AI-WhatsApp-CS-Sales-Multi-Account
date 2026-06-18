'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useT } from '@/lib/i18n';
import { dict } from './overview.i18n';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';

export interface Summary {
  totalConversations: number;
  activeConversations: number;
  aiOnConversations: number;
  pendingFollowUps: number;
  messagesLast24h: number;
  avgResponseTime: number;
}

export interface DailyReport {
  reviewsByDecision: Record<string, number>;
}

export interface Alert {
  id: string;
  decision: string;
  riskLevel: string;
  conversationId?: string;
}

export interface WaAccount {
  id: string;
  sessionStatus?: string;
}

export interface ConvSummary {
  id: string;
  aiMode: string;
  takeoverStatus: string;
  status: string;
  slaBreachedAt?: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  customer: { name: string | null; phoneNumber: string };
  whatsappAccount: { accountName: string };
  messages?: { status: string }[];
}

export type QueueTone = 'review' | 'danger';
export type AttnState = 'human-takeover' | 'needs-review' | 'sending-blocked';

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function deriveState(c: ConvSummary): AttnState {
  if (c.aiMode === 'ai_paused') return 'sending-blocked';
  if (c.takeoverStatus === 'waiting_admin' || c.status === 'waiting_admin') return 'human-takeover';
  return 'needs-review';
}

export interface Queue {
  key: string;
  label: string;
  count: number;
  hint: string;
  href: string;
  icon: PhosphorIcon;
  tone: QueueTone;
}

export function useOverview() {
  const t = useT(dict);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [attention, setAttention] = useState<ConvSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSectionErrors({});
    try {
      const [s, r, a, acc, conv] = await Promise.all([
        api<Summary>('/dashboard/summary').catch((err) => { setSectionErrors((p) => ({ ...p, summary: err.message })); return null; }),
        api<DailyReport>('/hermes/reports/daily').catch((err) => { setSectionErrors((p) => ({ ...p, report: err.message })); return null; }),
        api<Alert[]>('/hermes/alerts').catch((err) => { setSectionErrors((p) => ({ ...p, alerts: err.message })); return []; }),
        api<WaAccount[]>('/wa/accounts').catch((err) => { setSectionErrors((p) => ({ ...p, accounts: err.message })); return []; }),
        api<{ items: ConvSummary[] }>('/conversations?needsAttention=true&limit=25')
          .then((d) => d.items)
          .catch((err) => { setSectionErrors((p) => ({ ...p, attention: err.message })); return []; }),
      ]);
      if (s) setSummary(s);
      if (r) setReport(r);
      if (a) setAlerts(a);
      if (acc) setAccounts(acc);
      if (conv) setAttention(conv);
      if (!s && !r && !a && !acc && !conv) setError(t('errFallback'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const socket = getSocket();
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 1000);
    };
    socket.on('hermes:alert', refresh);
    socket.on('conversation:updated', refresh);
    socket.on('conversation:sla-breach', refresh);
    socket.on('conversation:sla-cleared', refresh);
    socket.on('wa:status', refresh);
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('hermes:alert', refresh);
      socket.off('conversation:updated', refresh);
      socket.off('conversation:sla-breach', refresh);
      socket.off('conversation:sla-cleared', refresh);
      socket.off('wa:status', refresh);
    };
  }, [load]);

  const pendingReviews = alerts.filter((a) => a.decision === 'draft').length;
  const highRisk = alerts.filter((a) => a.riskLevel === 'high' || a.riskLevel === 'critical').length;
  const failed = attention.filter((c) => c.messages?.some((m) => m.status === 'failed')).length;
  const disconnected = accounts.filter((a) => a.sessionStatus && a.sessionStatus !== 'connected').length;
  const slaRisk = attention.filter((c) => c.slaBreachedAt).length;

  const aiHandledPct = summary && summary.totalConversations > 0
    ? Math.round((summary.aiOnConversations / summary.totalConversations) * 100)
    : null;
  const decisions = report?.reviewsByDecision ?? {};
  const decisionTotal = Object.values(decisions).reduce((s, n) => s + n, 0);
  const approvalPct = decisionTotal > 0 ? Math.round(((decisions.approve ?? 0) / decisionTotal) * 100) : null;

  const metrics: { label: string; value: string }[] = [
    { label: t('m_conv'), value: summary ? String(summary.totalConversations) : '—' },
    { label: t('m_ai'), value: aiHandledPct != null ? `${aiHandledPct}%` : '—' },
    { label: t('m_resp'), value: summary ? `${summary.avgResponseTime}s` : '—' },
    { label: t('m_appr'), value: approvalPct != null ? `${approvalPct}%` : '—' },
  ];

  return {
    t, summary, report, alerts, accounts, attention,
    loading, error, sectionErrors,
    load,
    pendingReviews, highRisk, failed, disconnected, slaRisk,
    metrics,
  };
}

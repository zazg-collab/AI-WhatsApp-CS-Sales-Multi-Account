'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  TriangleAlert,
  CircleX,
  Unplug,
  Clock,
  ArrowUpRight,
  ChartNoAxesCombined,
  Hand,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { LucideIcon } from 'lucide-react';

/**
 * Operational Overview — live. Attention queues come first (the things a human
 * must look at now), analytics below. Every number is sourced from the API;
 * each fetch fails soft so a single unavailable endpoint never blanks the page.
 */

interface Summary {
  totalConversations: number;
  activeConversations: number;
  aiOnConversations: number;
  pendingFollowUps: number;
  messagesLast24h: number;
  avgResponseTime: number;
}

interface DailyReport {
  reviewsByDecision: Record<string, number>;
}

interface Alert {
  id: string;
  decision: string;
  riskLevel: string;
}

interface WaAccount {
  id: string;
  sessionStatus?: string;
}

interface ConvSummary {
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

type QueueTone = 'review' | 'danger';
type AttnState = 'human-takeover' | 'needs-review' | 'sending-blocked';

const toneRing: Record<QueueTone, string> = {
  review: 'text-review-600',
  danger: 'text-danger-600',
};

const stateMeta: Record<AttnState, { label: string; icon: LucideIcon; tone: 'review' | 'danger' | 'neutral' }> = {
  'human-takeover': { label: 'Human takeover', icon: Hand, tone: 'neutral' },
  'needs-review': { label: 'Needs review', icon: TriangleAlert, tone: 'review' },
  'sending-blocked': { label: 'Sending blocked', icon: CircleX, tone: 'danger' },
};

function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function initials(name: string | null, phone: string): string {
  const base = name?.trim() || phone;
  return base.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function deriveState(c: ConvSummary): AttnState {
  if (c.aiMode === 'ai_paused') return 'sending-blocked';
  if (c.takeoverStatus === 'waiting_admin' || c.status === 'waiting_admin') return 'human-takeover';
  return 'needs-review';
}

export default function OverviewPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [attention, setAttention] = useState<ConvSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, r, a, acc, conv] = await Promise.all([
        api<Summary>('/dashboard/summary'),
        api<DailyReport>('/hermes/reports/daily'),
        api<Alert[]>('/hermes/alerts'),
        api<WaAccount[]>('/wa/accounts'),
        api<{ items: ConvSummary[] }>('/conversations?needsAttention=true&limit=25').then((d) => d.items),
      ]);
      setSummary(s);
      setReport(r);
      setAlerts(a);
      setAccounts(acc);
      setAttention(conv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load overview from API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    const refresh = () => load();
    socket.on('hermes:alert', refresh);
    socket.on('conversation:updated', refresh);
    socket.on('conversation:sla-breach', refresh);
    socket.on('conversation:sla-cleared', refresh);
    socket.on('wa:status', refresh);
    return () => {
      socket.off('hermes:alert', refresh);
      socket.off('conversation:updated', refresh);
      socket.off('conversation:sla-breach', refresh);
      socket.off('conversation:sla-cleared', refresh);
      socket.off('wa:status', refresh);
    };
  }, [load]);

  // ── Derive queue counts from live data ──────────────────────────────
  const pendingReviews = alerts.filter((a) => a.decision === 'draft').length;
  const highRisk = alerts.filter((a) => a.riskLevel === 'high' || a.riskLevel === 'critical').length;
  const failed = attention.filter((c) => c.messages?.some((m) => m.status === 'failed')).length;
  const disconnected = accounts.filter((a) => a.sessionStatus && a.sessionStatus !== 'connected').length;
  const slaRisk = attention.filter((c) => c.slaBreachedAt).length;

  const queues: {
    key: string;
    label: string;
    count: number;
    hint: string;
    href: string;
    icon: LucideIcon;
    tone: QueueTone;
  }[] = [
    { key: 'reviews', label: 'Pending reviews', count: pendingReviews, hint: 'Drafts awaiting approval', href: '/hermes', icon: ShieldCheck, tone: 'review' },
    { key: 'risk', label: 'High-risk conversations', count: highRisk, hint: 'Flagged by Hermes', href: '/hermes', icon: TriangleAlert, tone: 'danger' },
    { key: 'failed', label: 'Failed messages', count: failed, hint: 'In the attention queue', href: '/inbox', icon: CircleX, tone: 'danger' },
    { key: 'disconnected', label: 'Disconnected accounts', count: disconnected, hint: 'Reconnect required', href: '/accounts', icon: Unplug, tone: 'danger' },
    { key: 'sla', label: 'SLA at risk', count: slaRisk, hint: 'Past the response target', href: '/inbox', icon: Clock, tone: 'review' },
  ];

  // ── Derive the at-a-glance metrics ──────────────────────────────────
  const aiHandledPct = summary && summary.totalConversations > 0
    ? Math.round((summary.aiOnConversations / summary.totalConversations) * 100)
    : null;
  const decisions = report?.reviewsByDecision ?? {};
  const decisionTotal = Object.values(decisions).reduce((s, n) => s + n, 0);
  const approvalPct = decisionTotal > 0 ? Math.round(((decisions.approve ?? 0) / decisionTotal) * 100) : null;

  const metrics: { label: string; value: string }[] = [
    { label: 'Conversations', value: summary ? String(summary.totalConversations) : '—' },
    { label: 'AI auto-handled', value: aiHandledPct != null ? `${aiHandledPct}%` : '—' },
    { label: 'Avg response', value: summary ? `${summary.avgResponseTime}s` : '—' },
    { label: 'Hermes approval rate', value: approvalPct != null ? `${approvalPct}%` : '—' },
  ];

  return (
    <AppLayout>
      <PageHeader title="Overview" subtitle="Operational attention across all accounts">
        <Link
          href="/analytics"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <ChartNoAxesCombined className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Full analytics
        </Link>
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5 space-y-6">
        {error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 text-sm text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400">
            {error}
          </Card>
        ) : (
          <>
        {/* Attention queues */}
        <section aria-labelledby="queues-h">
          <h2 id="queues-h" className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
            Attention required
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {queues.map((q) => {
              const Icon = q.icon;
              const muted = q.count === 0;
              return (
                <Link key={q.key} href={q.href} className="group">
                  <Card className="h-full p-4 transition-colors duration-200 group-hover:border-gray-300 dark:group-hover:border-gray-700">
                    <div className="flex items-start justify-between">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${muted ? 'bg-gray-100 dark:bg-gray-800' : q.tone === 'danger' ? 'bg-danger-50 dark:bg-danger-900/30' : 'bg-review-50 dark:bg-review-900/30'}`}>
                        <Icon
                          className={`h-4 w-4 ${muted ? 'text-gray-300' : toneRing[q.tone]}`}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 transition-colors group-hover:text-gray-500" strokeWidth={1.75} aria-hidden="true" />
                    </div>
                    <p className={`mt-3 text-3xl font-bold tabular-nums tracking-tight ${muted ? 'text-gray-300' : 'text-gray-900 dark:text-gray-100'}`}>
                      {loading ? '—' : q.count}
                    </p>
                    <p className="mt-0.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200">{q.label}</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{q.hint}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Needs-attention conversation list */}
        <section aria-labelledby="attn-h">
          <Card>
            <CardHeader>
              <CardTitle id="attn-h">Conversations needing a decision</CardTitle>
              <Link href="/inbox" className="inline-flex items-center gap-1 rounded-lg bg-hermes-50 px-2.5 py-1 text-[12px] font-semibold text-hermes-700 hover:bg-hermes-100 dark:bg-hermes-900/30 dark:text-hermes-300 dark:hover:bg-hermes-900/50">
                Open inbox
                <ArrowUpRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              </Link>
            </CardHeader>
            {loading ? (
              <div className="space-y-1 p-2">
                {[1,2,3].map(n => <div key={n} className="h-14 rounded-lg animate-shimmer" />)}
              </div>
            ) : attention.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-channel-50 dark:bg-channel-900/20">
                  <ShieldCheck className="h-5 w-5 text-channel-600 dark:text-channel-500" strokeWidth={1.75} aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">All clear</p>
                <p className="mt-1 text-xs text-gray-400">Nothing waiting on a human right now.</p>
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
                      <Link
                        href={`/inbox?conversation=${c.id}`}
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/40"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hermes-100 bg-hermes-50 text-[12px] font-bold text-hermes-700 dark:border-hermes-800 dark:bg-hermes-900/30 dark:text-hermes-300">
                          {initials(c.customer.name, c.customer.phoneNumber)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{name}</p>
                            <span className="truncate text-[11px] text-gray-400">{c.whatsappAccount.accountName}</span>
                          </div>
                          <p className="truncate text-[12px] text-gray-500 dark:text-gray-400">
                            {c.lastMessage ?? 'No messages yet'}
                          </p>
                        </div>
                        <Badge tone={meta.tone}>
                          <Icon className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                          {meta.label}
                        </Badge>
                        <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                          {relTime(c.lastMessageAt)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* Analytics */}
        <section aria-labelledby="metrics-h">
          <h2 id="metrics-h" className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
            Today at a glance
          </h2>
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

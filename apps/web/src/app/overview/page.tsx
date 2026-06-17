'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ShieldStar,
  Warning,
  XCircle,
  PlugsConnected,
  Clock,
  ArrowUpRight,
  ChartLineUp,
  Hand,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Prioritaskan lead, review balasan AI, dan kendalikan campaign hari ini.', en: 'Prioritise leads, review AI replies, and control campaigns today.' },
  subtitle: { id: 'Tindakan yang menunggu admin di semua akun WhatsApp', en: 'Actions awaiting an admin across all WhatsApp accounts' },
  fullAnalytics: { id: 'Analytics lengkap', en: 'Full analytics' },
  errTitle: { id: 'Gagal memuat overview', en: 'Failed to load overview' },
  retry: { id: 'Coba lagi', en: 'Try again' },
  attnRequired: { id: 'Perlu tindakan', en: 'Needs attention' },
  needDecision: { id: 'Percakapan butuh keputusan', en: 'Conversations needing a decision' },
  openInbox: { id: 'Buka inbox', en: 'Open inbox' },
  allClear: { id: 'Aman terkendali', en: 'All clear' },
  allClearSub: { id: 'Tidak ada yang menunggu tindakan admin saat ini.', en: 'Nothing is waiting on an admin right now.' },
  noMessages: { id: 'Belum ada pesan', en: 'No messages yet' },
  todaySummary: { id: 'Ringkasan hari ini', en: 'Today at a glance' },
  errFallback: { id: 'Gagal memuat overview dari API', en: 'Failed to load the overview from the API' },
  // queues
  q_reviews: { id: 'Review tertunda', en: 'Pending reviews' },
  q_reviews_h: { id: 'Draft menunggu persetujuan admin', en: 'Drafts awaiting admin approval' },
  q_risk: { id: 'Percakapan berisiko tinggi', en: 'High-risk conversations' },
  q_risk_h: { id: 'Ditandai Hermes — tinjau sebelum balas', en: 'Flagged by Hermes — review before replying' },
  q_failed: { id: 'Pesan gagal terkirim', en: 'Failed messages' },
  q_failed_h: { id: 'Kirim ulang dari antrean perhatian', en: 'Resend from the attention queue' },
  q_disc: { id: 'Akun WhatsApp terputus', en: 'Disconnected WhatsApp accounts' },
  q_disc_h: { id: 'Scan ulang QR untuk menyambung', en: 'Re-scan the QR to reconnect' },
  q_sla: { id: 'SLA hampir terlewat', en: 'SLA at risk' },
  q_sla_h: { id: 'Sudah lewat target waktu respons', en: 'Past the response-time target' },
  // state meta
  st_takeover: { id: 'Ambil alih', en: 'Human takeover' },
  st_review: { id: 'Perlu review', en: 'Needs review' },
  st_blocked: { id: 'Kirim diblokir', en: 'Sending blocked' },
  // metrics
  m_conv: { id: 'Total percakapan', en: 'Total conversations' },
  m_ai: { id: 'Ditangani AI', en: 'Handled by AI' },
  m_resp: { id: 'Rata-rata respons', en: 'Avg response' },
  m_appr: { id: 'Approval Hermes', en: 'Hermes approval' },
};

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
  conversationId?: string;
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

const stateMeta: Record<AttnState, { label: string; icon: PhosphorIcon; tone: 'review' | 'danger' | 'neutral' }> = {
  'human-takeover': { label: 'st_takeover', icon: Hand, tone: 'neutral' },
  'needs-review': { label: 'st_review', icon: Warning, tone: 'review' },
  'sending-blocked': { label: 'st_blocked', icon: XCircle, tone: 'danger' },
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
  const [sectionErrors, setSectionErrors] = useState<Record<string, string>>({});
  const t = useT(dict);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSectionErrors({});
    try {
      // Load each section independently to prevent one failure from blocking others
      const [s, r, a, acc, conv] = await Promise.all([
        api<Summary>('/dashboard/summary').catch((err) => {
          setSectionErrors((prev) => ({ ...prev, summary: err.message }));
          return null;
        }),
        api<DailyReport>('/hermes/reports/daily').catch((err) => {
          setSectionErrors((prev) => ({ ...prev, report: err.message }));
          return null;
        }),
        api<Alert[]>('/hermes/alerts').catch((err) => {
          setSectionErrors((prev) => ({ ...prev, alerts: err.message }));
          return [];
        }),
        api<WaAccount[]>('/wa/accounts').catch((err) => {
          setSectionErrors((prev) => ({ ...prev, accounts: err.message }));
          return [];
        }),
        api<{ items: ConvSummary[] }>('/conversations?needsAttention=true&limit=25')
          .then((d) => d.items)
          .catch((err) => {
            setSectionErrors((prev) => ({ ...prev, attention: err.message }));
            return [];
          }),
      ]);
      if (s) setSummary(s);
      if (r) setReport(r);
      if (a) setAlerts(a);
      if (acc) setAccounts(acc);
      if (conv) setAttention(conv);

      // Only set global error if all critical sections failed
      if (!s && !r && !a && !acc && !conv) {
        setError(t('errFallback'));
      }
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
    icon: PhosphorIcon;
    tone: QueueTone;
  }[] = [
    { key: 'reviews', label: t('q_reviews'), count: pendingReviews, hint: t('q_reviews_h'), href: '/hermes', icon: ShieldStar, tone: 'review' },
    { key: 'risk', label: t('q_risk'), count: highRisk, hint: t('q_risk_h'), href: '/hermes', icon: Warning, tone: 'danger' },
    { key: 'failed', label: t('q_failed'), count: failed, hint: t('q_failed_h'), href: '/inbox', icon: XCircle, tone: 'danger' },
    { key: 'disconnected', label: t('q_disc'), count: disconnected, hint: t('q_disc_h'), href: '/accounts', icon: PlugsConnected, tone: 'danger' },
    { key: 'sla', label: t('q_sla'), count: slaRisk, hint: t('q_sla_h'), href: '/inbox', icon: Clock, tone: 'review' },
  ];

  // ── Derive the at-a-glance metrics ──────────────────────────────────
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

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Link
          href="/analytics"
          className="inline-flex h-9 items-center gap-2 rounded border border-gray-200 bg-white px-4 text-[13px] font-semibold text-gray-700 shadow-[0_1px_2px_rgba(15,23,42,0.05)] transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <ChartLineUp className="h-4 w-4" aria-hidden="true" />
          {t('fullAnalytics')}
        </Link>
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5 space-y-6">
        {error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-semibold text-danger-700 dark:text-danger-400">{t('errTitle')}</p>
            <p className="mt-1 text-[13px] text-danger-700/90 dark:text-danger-400/90">{error}</p>
            <button
              onClick={load}
              className="mt-3 inline-flex h-8 items-center gap-1.5 rounded border border-danger-300 bg-white px-3 text-[13px] font-semibold text-danger-700 transition-colors hover:bg-danger-50 dark:border-danger-700/50 dark:bg-gray-900 dark:text-danger-400"
            >
              {t('retry')}
            </button>
          </Card>
        ) : (
          <>
        {/* Attention queues */}
        <section aria-labelledby="queues-h">
          <h2 id="queues-h" className="mb-3 text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
            {t('attnRequired')}
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
                         
                          aria-hidden="true"
                        />
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-gray-300 transition-colors group-hover:text-gray-500" aria-hidden="true" />
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
              <CardTitle id="attn-h">{t('needDecision')}</CardTitle>
              <Link href="/inbox" className="inline-flex items-center gap-1 rounded-lg bg-hermes-50 px-2.5 py-1 text-[12px] font-semibold text-hermes-700 hover:bg-hermes-100 dark:bg-hermes-900/30 dark:text-hermes-300 dark:hover:bg-hermes-900/50">
                {t('openInbox')}
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </CardHeader>
            {loading ? (
              <div className="space-y-1 p-2">
                {[1,2,3].map(n => <div key={n} className="h-14 rounded-lg animate-shimmer" />)}
              </div>
            ) : attention.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-center">
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-channel-50 dark:bg-channel-900/20">
                  <ShieldStar className="h-5 w-5 text-channel-600 dark:text-channel-500" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('allClear')}</p>
                <p className="mt-1 text-xs text-gray-400">{t('allClearSub')}</p>
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
                            {c.lastMessage ?? t('noMessages')}
                          </p>
                        </div>
                        <Badge tone={meta.tone}>
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {t(meta.label)}
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
            {t('todaySummary')}
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

'use client';

import { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, Send, MessageSquare, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Hermes Review', en: 'Hermes Review' },
  subtitle: { id: 'Pengawasan AI, peringatan risiko, dan laporan harian', en: 'AI supervision, risk alerts, and the daily report' },
  cobaLagi: { id: 'Coba lagi', en: 'Try again' },
  errLoad: { id: 'Gagal memuat data pengawasan Hermes dari API.', en: 'Failed to load Hermes supervision data from the API.' },
  askFail: { id: 'Hermes gagal menjawab. Coba lagi.', en: 'Hermes failed to answer. Try again.' },
  messagesToday: { id: 'Messages today', en: 'Messages today' },
  newCustomers: { id: 'Pelanggan baru', en: 'New customers' },
  hotLeads: { id: 'Lead panas', en: 'Hot leads' },
  heldBlocked: { id: 'Ditahan / diblokir', en: 'Held / blocked' },
  askHermes: { id: 'Tanya Hermes', en: 'Ask Hermes' },
  supervisorAssistant: { id: 'Asisten supervisor', en: 'Supervisor assistant' },
  askPlaceholderHint: { id: 'Tanyakan kondisi lintas-bot, mis. bot mana yang paling bermasalah hari ini.', en: 'Ask about cross-bot conditions, e.g. which bot is the most problematic today.' },
  analyzing: { id: 'Hermes sedang menganalisis…', en: 'Hermes is analyzing…' },
  askAria: { id: 'Pertanyaan untuk Hermes', en: 'Question for Hermes' },
  askPlaceholder: { id: 'mis. Bot mana yang paling bermasalah hari ini?', en: 'e.g. Which bot is the most problematic today?' },
  ask: { id: 'Tanya', en: 'Ask' },
  activeAlerts: { id: 'Peringatan aktif', en: 'Active alerts' },
  customer: { id: 'Pelanggan', en: 'Customer' },
  noActiveAlerts: { id: 'Tidak ada peringatan aktif.', en: 'No active alerts.' },
  noActiveAlertsHint: { id: 'Semua percakapan dalam batas aman. Hermes akan memberi tahu saat ada risiko.', en: 'All conversations are within safe limits. Hermes will notify you when there is risk.' },
  recommendation: { id: 'Rekomendasi: {value}', en: 'Recommendation: {value}' },
  confRisk: { id: 'keyakinan {conf} · risiko {risk}', en: 'confidence {conf} · risk {risk}' },
  declApprove: { id: 'Disetujui', en: 'Approved' },
  declDraft: { id: 'Tahan jadi draf', en: 'Hold as draft' },
  declBlock: { id: 'Diblokir', en: 'Blocked' },
  declPause: { id: 'AI dijeda', en: 'AI paused' },
  declTakeover: { id: 'Ambil alih', en: 'Take over' },
};

const DECISION_LABEL_KEY: Record<string, string> = {
  approve: 'declApprove',
  draft: 'declDraft',
  block: 'declBlock',
  pause_ai: 'declPause',
  takeover_required: 'declTakeover',
};

interface Review {
  id: string;
  conversationId: string;
  decision: string;
  confidenceScore: number;
  riskScore: number;
  riskLevel: string;
  reason: string;
  recommendation: string;
  conversation?: { customer?: { name?: string; phoneNumber: string } };
}

interface DailyReport {
  date: string;
  totalMessages: number;
  newCustomers: number;
  hotLeads: number;
  reviewsByDecision: Record<string, number>;
}

type BadgeTone = 'success' | 'review' | 'danger' | 'critical';

// Risk levels map to the semantic severity scale: higher risk reads hotter.
const RISK_TONE: Record<string, BadgeTone> = {
  low: 'success',
  medium: 'review',
  high: 'danger',
  critical: 'critical',
};

// Hermes decisions carry consequence — escalations read as danger/critical,
// draft/hold as review (amber), approve as success.
const DECISION_TONE: Record<string, BadgeTone> = {
  approve: 'success',
  draft: 'review',
  block: 'danger',
  pause_ai: 'critical',
  takeover_required: 'critical',
};

export default function HermesPage() {
  const t = useT(dict);
  const [alerts, setAlerts] = useState<Review[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    setAsking(true);
    try {
      const res = await api<{ answer: string }>('/hermes/ask', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      });
      setChat((prev) => [...prev, { q, a: res.answer }]);
    } catch (err) {
      setChat((prev) => [
        ...prev,
        { q, a: err instanceof Error ? err.message : t('askFail') },
      ]);
    } finally {
      setAsking(false);
    }
  }

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [a, r] = await Promise.all([
        api<Review[]>('/hermes/alerts'),
        api<DailyReport>('/hermes/reports/daily'),
      ]);
      setAlerts(a);
      setReport(r);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : t('errLoad'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
    const socket = getSocket();
    if (!socket) return;
    const onAlert = () => load();
    socket.on('hermes:alert', onAlert);
    return () => {
      socket.off('hermes:alert', onAlert);
    };
  }, [load]);

  const heldOrBlocked = report
    ? (report.reviewsByDecision.block ?? 0) +
      (report.reviewsByDecision.pause_ai ?? 0) +
      (report.reviewsByDecision.takeover_required ?? 0)
    : 0;

  return (
    <AppLayout>
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
      />

      <div className="scrollbar-thin mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-5">
        {loadError && (
          <Card className="mb-5 border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{loadError}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>
              {t('cobaLagi')}
            </Button>
          </Card>
        )}

        {loading && !loadError && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-[68px] rounded animate-shimmer" />
            ))}
          </div>
        )}

        {!loadError && report && (
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('messagesToday')} value={report.totalMessages} />
            <Stat label={t('newCustomers')} value={report.newCustomers} />
            <Stat label={t('hotLeads')} value={report.hotLeads} />
            <Stat
              label={t('heldBlocked')}
              value={heldOrBlocked}
              tone={heldOrBlocked > 0 ? 'text-danger-600' : undefined}
            />
          </div>
        )}

        {/* Supervisor assistant */}
        <Card className="mb-5 p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <ShieldCheck className="h-4 w-4 text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
            {t('askHermes')}
            <Badge tone="hermes">{t('supervisorAssistant')}</Badge>
          </h2>
          <div className="mb-3 space-y-3">
            {chat.length === 0 && !asking && (
              <p className="text-sm text-gray-400">
                {t('askPlaceholderHint')}
              </p>
            )}
            {chat.map((c, i) => (
              <div key={i} className="space-y-1">
                <p className="flex items-start gap-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  {c.q}
                </p>
                <p className="whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                  {c.a}
                </p>
              </div>
            ))}
            {asking && <p className="text-sm text-gray-400">{t('analyzing')}</p>}
          </div>
          <form onSubmit={ask} className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label={t('askAria')}
              placeholder={t('askPlaceholder')}
              className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-hermes-400 placeholder:text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <Button type="submit" size="md" disabled={asking}>
              <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {t('ask')}
            </Button>
          </form>
        </Card>

        {loading && !loadError && (
          <div className="space-y-2">
            {[1, 2].map((n) => (
              <div key={n} className="h-24 rounded animate-shimmer" />
            ))}
          </div>
        )}

        {!loadError && !loading && (
          <>
            <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              {t('activeAlerts')}
              <Badge tone={alerts.length > 0 ? 'review' : 'neutral'}>{alerts.length}</Badge>
            </h2>
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Card className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {a.conversation?.customer?.name ??
                          a.conversation?.customer?.phoneNumber ??
                          t('customer')}
                      </span>
                      <Badge tone={DECISION_TONE[a.decision] ?? RISK_TONE[a.riskLevel] ?? 'neutral'}>
                        <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        {a.riskLevel} · {DECISION_LABEL_KEY[a.decision] ? t(DECISION_LABEL_KEY[a.decision]) : a.decision}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{a.reason}</p>
                    {a.recommendation && (
                      <p className="mt-1 text-xs text-gray-500">{t('recommendation', { value: a.recommendation })}</p>
                    )}
                    <p className="mt-1 text-xs tabular-nums text-gray-400">
                      {t('confRisk', { conf: a.confidenceScore, risk: a.riskScore })}
                    </p>
                  </Card>
                </li>
              ))}
              {alerts.length === 0 && (
                <li>
                  <Card className="flex flex-col items-center justify-center py-12 text-center">
                    <ShieldCheck className="mb-2 h-6 w-6 text-gray-300" strokeWidth={1.75} aria-hidden="true" />
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                      {t('noActiveAlerts')}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {t('noActiveAlertsHint')}
                    </p>
                  </Card>
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-3.5">
      <p className={`text-2xl font-semibold tabular-nums ${tone ?? 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </Card>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';

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

const RISK_COLOR: Record<string, string> = {
  low: 'text-green-400',
  medium: 'text-yellow-400',
  high: 'text-orange-400',
  critical: 'text-red-500',
};

export default function HermesPage() {
  const [alerts, setAlerts] = useState<Review[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);

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
        { q, a: err instanceof Error ? err.message : 'Gagal bertanya' },
      ]);
    } finally {
      setAsking(false);
    }
  }

  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      api<Review[]>('/hermes/alerts').catch(() => []),
      api<DailyReport>('/hermes/reports/daily').catch(() => null),
    ]);
    setAlerts(a);
    setReport(r);
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on('hermes:alert', () => load());
    return () => {
      socket.off('hermes:alert');
    };
  }, [load]);

  return (
    <AppLayout><main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-6 text-xl font-semibold text-wa-accent">
        Hermes Monitoring
      </h1>

      {report && (
        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Pesan hari ini" value={report.totalMessages} />
          <Stat label="Customer baru" value={report.newCustomers} />
          <Stat label="Hot lead" value={report.hotLeads} />
          <Stat
            label="Ditahan/blok"
            value={
              (report.reviewsByDecision.block ?? 0) +
              (report.reviewsByDecision.pause_ai ?? 0) +
              (report.reviewsByDecision.takeover_required ?? 0)
            }
          />
        </div>
      )}

      <section className="mb-8 rounded-lg bg-white dark:bg-wa-panel p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-600 dark:text-gray-400">
          Tanya Hermes (supervisor assistant)
        </h2>
        <div className="mb-3 space-y-3">
          {chat.map((c, i) => (
            <div key={i}>
              <p className="text-sm text-gray-600 dark:text-gray-400">› {c.q}</p>
              <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                {c.a}
              </p>
            </div>
          ))}
          {asking && <p className="text-sm text-gray-500">Hermes berpikir…</p>}
        </div>
        <form onSubmit={ask} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="mis. Bot mana yang paling bermasalah hari ini?"
            className="flex-1 rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none"
          />
          <button
            disabled={asking}
            className="rounded bg-wa-accent px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            Tanya
          </button>
        </form>
      </section>

      <h2 className="mb-3 text-sm font-semibold text-gray-600 dark:text-gray-400">
        Alert ({alerts.length})
      </h2>
      <ul className="space-y-3">
        {alerts.map((a) => (
          <li key={a.id} className="rounded-lg bg-white dark:bg-wa-panel p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">
                {a.conversation?.customer?.name ??
                  a.conversation?.customer?.phoneNumber ??
                  'Customer'}
              </span>
              <span className={`text-xs uppercase ${RISK_COLOR[a.riskLevel]}`}>
                {a.riskLevel} · {a.decision}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{a.reason}</p>
            {a.recommendation && (
              <p className="mt-1 text-xs text-gray-500">
                Rekomendasi: {a.recommendation}
              </p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-600">
              confidence {a.confidenceScore} · risk {a.riskScore}
            </p>
          </li>
        ))}
        {alerts.length === 0 && (
          <li className="text-sm text-gray-500">Belum ada alert.</li>
        )}
      </ul>
    </main></AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white dark:bg-wa-panel p-4">
      <p className="text-2xl font-semibold text-wa-accent">{value}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400">{label}</p>
    </div>
  );
}

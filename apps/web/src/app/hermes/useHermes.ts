'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useT } from '@/lib/i18n';
import { dict } from './hermes.i18n';

export interface Review {
  id: string;
  conversationId: string;
  decision: string;
  confidenceScore: number;
  riskScore: number;
  riskLevel: string;
  reason: string;
  recommendation: string;
  createdAt?: string;
  conversation?: { customer?: { name?: string; phoneNumber: string } };
}

export interface DailyReport {
  date: string;
  totalMessages: number;
  newCustomers: number;
  hotLeads: number;
  reviewsByDecision: Record<string, number>;
}

export interface SnapshotBot {
  bot: string;
  reviews: number;
  avgConfidence: number;
  avgRisk: number;
}

export interface Snapshot {
  leadDistribution: Record<string, number>;
  knowledgeGapCount: number;
  bots: SnapshotBot[];
}

export interface KnowledgeGap {
  id: string;
  content: string | null;
  createdAt?: string;
  conversation?: { id: string; customer?: { name?: string | null; phoneNumber: string } | null };
}

export interface BotOption { id: string; botName: string }

export interface BotInsight {
  bot: string;
  metrics: {
    reviews: number;
    avgConfidence: number;
    avgRisk: number;
    decisions: Record<string, number>;
  };
  insight: string;
}

export type BadgeTone = 'success' | 'review' | 'danger' | 'critical';

export const RISK_TONE: Record<string, BadgeTone> = {
  low: 'success', medium: 'review', high: 'danger', critical: 'critical',
};

export const DECISION_TONE: Record<string, BadgeTone> = {
  approve: 'success', draft: 'review', block: 'danger',
  pause_ai: 'critical', takeover_required: 'critical',
};

export const DECISION_LABEL_KEY: Record<string, string> = {
  approve: 'declApprove', draft: 'declDraft', block: 'declBlock',
  pause_ai: 'declPause', takeover_required: 'declTakeover',
};

export const RISK_LABEL_KEY: Record<string, string> = {
  low: 'riskLow', medium: 'riskMedium', high: 'riskHigh', critical: 'riskCritical',
};

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

export function useHermes() {
  const t = useT(dict);
  const [alerts, setAlerts] = useState<Review[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [gaps, setGaps] = useState<KnowledgeGap[]>([]);
  const [bots, setBots] = useState<BotOption[]>([]);
  const [selectedBotId, setSelectedBotId] = useState('');
  const [insight, setInsight] = useState<BotInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);
  const [asking, setAsking] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const liveRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hermes_chat_history');
      if (stored) setChat(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem('hermes_chat_history', JSON.stringify(chat)); }
    catch { /* ignore */ }
  }, [chat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [a, r, s, g] = await Promise.all([
        api<Review[]>('/hermes/alerts'),
        api<DailyReport>('/hermes/reports/daily'),
        api<Snapshot>('/hermes/snapshot'),
        api<KnowledgeGap[]>('/hermes/knowledge-gaps'),
      ]);
      setAlerts(Array.isArray(a) ? a : []);
      setReport(r);
      setSnapshot(s && Array.isArray(s.bots) ? s : null);
      setGaps(Array.isArray(g) ? g : []);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : t('errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Bot list for the deep-dive picker (best-effort; failure just hides it).
  useEffect(() => {
    api<BotOption[]>('/bots').then((b) => setBots(Array.isArray(b) ? b : [])).catch(() => setBots([]));
  }, []);

  // On-demand per-bot deep dive (PRD §8.3) — fetched only when a bot is picked.
  const loadInsight = useCallback(async (botId: string) => {
    setSelectedBotId(botId);
    if (!botId) { setInsight(null); return; }
    setInsightLoading(true);
    setInsight(null);
    try {
      setInsight(await api<BotInsight>(`/hermes/bot/${botId}/insight`));
    } catch {
      setInsight(null);
    } finally {
      setInsightLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket = getSocket();
    if (!socket) return;
    const onAlert = () => load();
    socket.on('hermes:alert', onAlert);
    return () => { socket.off('hermes:alert', onAlert); };
  }, [load]);

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
      const answer = res.answer;
      setChat((prev) => [...prev, { q, a: answer }]);
      if (liveRegionRef.current) liveRegionRef.current.textContent = answer;
    } catch (err) {
      const message = err instanceof Error ? err.message : t('askFail');
      setChat((prev) => [...prev, { q, a: message }]);
      if (liveRegionRef.current) liveRegionRef.current.textContent = message;
    } finally {
      setAsking(false);
    }
  }

  const heldOrBlocked = report
    ? (report.reviewsByDecision.block ?? 0) + (report.reviewsByDecision.pause_ai ?? 0) + (report.reviewsByDecision.takeover_required ?? 0)
    : 0;

  const decisions = report?.reviewsByDecision ?? {};
  const decisionTotal = Object.values(decisions).reduce((s, n) => s + n, 0);
  const approvalRate = decisionTotal > 0 ? Math.round(((decisions.approve ?? 0) / decisionTotal) * 100) : 0;
  const blockRate = decisionTotal > 0 ? Math.round((((decisions.block ?? 0) + (decisions.pause_ai ?? 0)) / decisionTotal) * 100) : 0;

  return {
    t, alerts, report, question, setQuestion, chat, asking, loadError, loading,
    chatEndRef, liveRegionRef,
    load, ask,
    heldOrBlocked, approvalRate, blockRate,
    snapshot, gaps, bots, selectedBotId, insight, insightLoading, loadInsight,
  };
}

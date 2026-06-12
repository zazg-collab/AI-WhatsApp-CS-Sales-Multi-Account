'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';

interface Summary {
  totalConversations: number;
  activeConversations: number;
  aiOnConversations: number;
  pendingFollowUps: number;
  leadsToday: { hot: number; warm: number; cold: number };
  messagesLast24h: number;
  avgResponseTime: number;
  topAccounts: { id: string; name: string; messageCount: number }[];
}

interface LeadFunnelItem {
  stage: string;
  count: number;
}

interface MessageVolumeItem {
  date: string;
  count: number;
}

interface AiModeItem {
  mode: string;
  count: number;
  percentage: number;
}

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leadFunnel, setLeadFunnel] = useState<LeadFunnelItem[]>([]);
  const [messageVolume, setMessageVolume] = useState<MessageVolumeItem[]>([]);
  const [aiModeBreakdown, setAiModeBreakdown] = useState<AiModeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [s, lf, mv, ai] = await Promise.all([
          api<Summary>('/dashboard/summary'),
          api<LeadFunnelItem[]>('/dashboard/lead-funnel'),
          api<MessageVolumeItem[]>('/dashboard/message-volume?days=7'),
          api<AiModeItem[]>('/dashboard/ai-mode-breakdown'),
        ]);
        setSummary(s);
        setLeadFunnel(lf);
        setMessageVolume(mv);
        setAiModeBreakdown(ai);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const maxVolume = Math.max(...messageVolume.map((d) => d.count), 1);

  const leadColors: Record<string, string> = {
    cold: 'bg-blue-500',
    warm: 'bg-yellow-500',
    hot: 'bg-orange-500',
    very_hot: 'bg-red-500',
  };

  const modeColors: Record<string, string> = {
    ai_on: 'bg-green-500',
    ai_off: 'bg-gray-300 dark:bg-gray-500',
    ai_draft: 'bg-yellow-500',
    ai_supervised: 'bg-blue-500',
    ai_paused: 'bg-red-500',
  };

  const modeLabels: Record<string, string> = {
    ai_on: 'AI ON',
    ai_off: 'AI OFF',
    ai_draft: 'Draft',
    ai_supervised: 'Supervised',
    ai_paused: 'Paused',
  };

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Analytics</h1>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
                const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/customers/export`;
                fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                  .then((r) => r.blob())
                  .then((blob) => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'customers.csv';
                    a.click();
                  });
              }}
              className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-600"
            >
              Export Customers CSV
            </button>
            <button
              onClick={() => {
                const token = typeof window !== 'undefined' ? localStorage.getItem('token') : '';
                const url = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/conversations/export`;
                fetch(url, { headers: { Authorization: `Bearer ${token}` } })
                  .then((r) => r.blob())
                  .then((blob) => {
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = 'conversations.csv';
                    a.click();
                  });
              }}
              className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-blue-100 hover:bg-blue-600"
            >
              Export Conversations CSV
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">Memuat data...</p>
        ) : (
          <>
            {/* Summary Cards */}
            {summary && (
              <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <SummaryCard label="Total Conversations" value={summary.totalConversations} color="text-gray-900 dark:text-gray-100" />
                <SummaryCard label="Active (Waiting Admin)" value={summary.activeConversations} color="text-orange-400" />
                <SummaryCard label="AI ON" value={summary.aiOnConversations} color="text-green-400" />
                <SummaryCard label="Pending Follow-ups" value={summary.pendingFollowUps} color="text-yellow-400" />
                <SummaryCard label="Messages (24h)" value={summary.messagesLast24h} color="text-blue-400" />
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Lead Funnel */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Lead Funnel
                </h2>
                {leadFunnel.length === 0 ? (
                  <p className="text-sm text-gray-500">Belum ada data</p>
                ) : (
                  <div className="space-y-3">
                    {leadFunnel.map((item) => {
                      const total = leadFunnel.reduce((s, i) => s + i.count, 0);
                      const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                      return (
                        <div key={item.stage}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {item.stage.replace('_', ' ').toUpperCase()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">{item.count} ({pct}%)</span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className={`h-2.5 rounded-full ${leadColors[item.stage] ?? 'bg-gray-300 dark:bg-gray-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* AI Mode Breakdown */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  AI Mode Breakdown
                </h2>
                {aiModeBreakdown.length === 0 ? (
                  <p className="text-sm text-gray-500">Belum ada data</p>
                ) : (
                  <div className="space-y-3">
                    {aiModeBreakdown.map((item) => (
                      <div key={item.mode}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-gray-700 dark:text-gray-300">
                            {modeLabels[item.mode] ?? item.mode}
                          </span>
                          <span className="text-gray-600 dark:text-gray-400">{item.count} ({item.percentage}%)</span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                          <div
                            className={`h-2.5 rounded-full ${modeColors[item.mode] ?? 'bg-gray-300 dark:bg-gray-500'}`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Message Volume (last 7 days) */}
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 lg:col-span-2">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                  Message Volume (Last 7 Days)
                </h2>
                {messageVolume.length === 0 ? (
                  <p className="text-sm text-gray-500">Belum ada data</p>
                ) : (
                  <div className="flex h-40 items-end gap-2">
                    {messageVolume.map((item) => {
                      const heightPct = Math.round((item.count / maxVolume) * 100);
                      const dayLabel = new Date(item.date + 'T00:00:00').toLocaleDateString('id', {
                        day: '2-digit',
                        month: 'short',
                      });
                      return (
                        <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-xs text-gray-600 dark:text-gray-400">{item.count}</span>
                          <div className="flex w-full flex-col justify-end" style={{ height: '100px' }}>
                            <div
                              className="w-full rounded-t bg-emerald-600"
                              style={{ height: `${Math.max(heightPct, item.count > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{dayLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Top Accounts */}
              {summary && summary.topAccounts.length > 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 lg:col-span-2">
                  <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                    Top Accounts (Last 7 Days)
                  </h2>
                  <div className="space-y-2">
                    {summary.topAccounts.map((acc, i) => (
                      <div key={acc.id} className="flex items-center gap-3 text-sm">
                        <span className="w-5 text-center text-xs text-gray-500">{i + 1}</span>
                        <span className="flex-1 text-gray-800 dark:text-gray-200">{acc.name}</span>
                        <span className="text-gray-600 dark:text-gray-400">{acc.messageCount} msgs</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <p className="mb-1 text-xs text-gray-600 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

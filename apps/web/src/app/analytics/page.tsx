'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  title: { id: 'Analytics', en: 'Analytics' },
  subtitle: { id: 'Tren penjualan dan percakapan', en: 'Sales and conversation trends' },
  exportCustomers: { id: 'Ekspor pelanggan CSV', en: 'Export customers CSV' },
  exportConversations: { id: 'Ekspor percakapan CSV', en: 'Export conversations CSV' },
  errLoad: { id: 'Gagal memuat analitik dari API.', en: 'Failed to load analytics from the API.' },
  errLoadHint: { id: 'Data analitik tidak dapat dimuat. Periksa koneksi API lalu coba lagi.', en: 'Analytics data could not be loaded. Check the API connection and try again.' },
  cobaLagi: { id: 'Coba lagi', en: 'Try again' },
  totalConversations: { id: 'Total percakapan', en: 'Total conversations' },
  waitingAdmin: { id: 'Menunggu admin', en: 'Awaiting admin' },
  aiActive: { id: 'AI aktif', en: 'AI active' },
  pendingFollowUps: { id: 'Follow-up tertunda', en: 'Pending follow-ups' },
  messages24h: { id: 'Pesan (24 jam)', en: 'Messages (24h)' },
  leadFunnel: { id: 'Corong lead', en: 'Lead funnel' },
  aiModeDistribution: { id: 'Distribusi mode AI', en: 'AI mode distribution' },
  messageVolume7d: { id: 'Volume pesan — 7 hari terakhir', en: 'Message volume — last 7 days' },
  topAccounts7d: { id: 'Akun teraktif — 7 hari terakhir', en: 'Most active accounts — last 7 days' },
  messagesUnit: { id: '{n} pesan', en: '{n} messages' },
  empty: { id: 'Belum ada data untuk ditampilkan.', en: 'No data to display yet.' },
  modeAiOn: { id: 'AI ON', en: 'AI ON' },
  modeAiOff: { id: 'AI OFF', en: 'AI OFF' },
  modeAiDraft: { id: 'Draf', en: 'Draft' },
  modeAiSupervised: { id: 'Diawasi', en: 'Supervised' },
  modeAiPaused: { id: 'Dijeda', en: 'Paused' },
};

const MODE_LABEL_KEY: Record<string, string> = {
  ai_on: 'modeAiOn',
  ai_off: 'modeAiOff',
  ai_draft: 'modeAiDraft',
  ai_supervised: 'modeAiSupervised',
  ai_paused: 'modeAiPaused',
};

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

async function exportCsv(path: string, filename: string) {
  const blob = await downloadFile(path);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AnalyticsPage() {
  const t = useT(dict);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leadFunnel, setLeadFunnel] = useState<LeadFunnelItem[]>([]);
  const [messageVolume, setMessageVolume] = useState<MessageVolumeItem[]>([]);
  const [aiModeBreakdown, setAiModeBreakdown] = useState<AiModeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errLoad'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const maxVolume = Math.max(...messageVolume.map((d) => d.count), 1);

  // Lead stages + AI modes carry semantic meaning — keep distinct hues.
  const leadColors: Record<string, string> = {
    cold: 'bg-hermes-400',
    warm: 'bg-review-500',
    hot: 'bg-review-600',
    very_hot: 'bg-danger-500',
  };

  const modeColors: Record<string, string> = {
    ai_on: 'bg-channel-500',
    ai_off: 'bg-gray-300 dark:bg-gray-600',
    ai_draft: 'bg-review-500',
    ai_supervised: 'bg-hermes-500',
    ai_paused: 'bg-danger-500',
  };

  return (
    <AppLayout>
      <PageHeader title={t('title')} subtitle={t('subtitle')}>
        <Button variant="outline" size="sm" onClick={() => exportCsv('/customers/export', 'customers.csv')}>
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {t('exportCustomers')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportCsv('/conversations/export', 'conversations.csv')}>
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {t('exportConversations')}
        </Button>
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-[72px] rounded animate-shimmer" />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-48 rounded animate-shimmer" />
              ))}
            </div>
          </div>
        ) : error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <p className="mt-1 text-xs text-danger-600/80 dark:text-danger-400/80">
              {t('errLoadHint')}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={load}>
              {t('cobaLagi')}
            </Button>
          </Card>
        ) : (
          <>
            {summary && (
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <SummaryCard label={t('totalConversations')} value={summary.totalConversations} />
                <SummaryCard label={t('waitingAdmin')} value={summary.activeConversations} tone="text-review-600" />
                <SummaryCard label={t('aiActive')} value={summary.aiOnConversations} tone="text-channel-700" />
                <SummaryCard label={t('pendingFollowUps')} value={summary.pendingFollowUps} tone="text-review-600" />
                <SummaryCard label={t('messages24h')} value={summary.messagesLast24h} tone="text-hermes-600" />
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title={t('leadFunnel')}>
                {leadFunnel.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-3">
                    {leadFunnel.map((item) => {
                      const total = leadFunnel.reduce((s, i) => s + i.count, 0);
                      const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                      return (
                        <Bar
                          key={item.stage}
                          label={item.stage.replace('_', ' ').toUpperCase()}
                          meta={`${item.count} (${pct}%)`}
                          pct={pct}
                          color={leadColors[item.stage] ?? 'bg-gray-300 dark:bg-gray-600'}
                        />
                      );
                    })}
                  </div>
                )}
              </Panel>

              <Panel title={t('aiModeDistribution')}>
                {aiModeBreakdown.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="space-y-3">
                    {aiModeBreakdown.map((item) => (
                      <Bar
                        key={item.mode}
                        label={MODE_LABEL_KEY[item.mode] ? t(MODE_LABEL_KEY[item.mode]) : item.mode}
                        meta={`${item.count} (${item.percentage}%)`}
                        pct={item.percentage}
                        color={modeColors[item.mode] ?? 'bg-gray-300 dark:bg-gray-600'}
                      />
                    ))}
                  </div>
                )}
              </Panel>

              <Panel title={t('messageVolume7d')} className="lg:col-span-2">
                {messageVolume.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="flex h-40 items-end gap-2">
                    {messageVolume.map((item) => {
                      const heightPct = Math.round((item.count / maxVolume) * 100);
                      const dayLabel = new Date(item.date + 'T00:00:00').toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                      });
                      return (
                        <div key={item.date} className="flex flex-1 flex-col items-center gap-1">
                          <span className="text-xs tabular-nums text-gray-500">{item.count}</span>
                          <div className="flex w-full flex-col justify-end" style={{ height: '100px' }}>
                            <div
                              className="w-full rounded-t bg-hermes-600"
                              style={{ height: `${Math.max(heightPct, item.count > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">{dayLabel}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>

              {summary && summary.topAccounts.length > 0 && (
                <Panel title={t('topAccounts7d')} className="lg:col-span-2">
                  <div className="space-y-1">
                    {summary.topAccounts.map((acc, i) => (
                      <div key={acc.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <span className="w-5 text-center text-xs tabular-nums text-gray-400">{i + 1}</span>
                        <span className="flex-1 text-gray-800 dark:text-gray-200">{acc.name}</span>
                        <span className="tabular-nums text-gray-500 dark:text-gray-400">{t('messagesUnit', { n: acc.messageCount })}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? 'text-gray-900 dark:text-gray-100'}`}>
        {value}
      </p>
    </Card>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {children}
    </Card>
  );
}

function Bar({ label, meta, pct, color }: { label: string; meta: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="tabular-nums text-gray-500 dark:text-gray-400">{meta}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Empty() {
  const t = useT(dict);
  return <p className="text-sm text-gray-400">{t('empty')}</p>;
}

'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface PerformanceOverview {
  rangeDays: number;
  totals: { messages: number; conversations: number; customers: number };
  response: { avgSeconds: number; p95Seconds: number; sampleSize: number };
  aiQuality: {
    reviewCount: number;
    avgConfidence: number;
    avgRisk: number;
    fallbackCount: number;
    fallbackRate: number;
    decisions: Record<string, number>;
    riskLevels: Record<string, number>;
  };
  campaign: {
    campaignCount: number;
    totalRecipients: number;
    sent: number;
    failed: number;
    successRate: number;
    failureRate: number;
    byStatus: Record<string, number>;
    recentCampaigns: { id: string; name: string; status: string; recipients: number; createdAt: string }[];
  };
  messageVolume: { date: string; count: number }[];
  topAccounts: { id: string; name: string; messageCount: number }[];
  csat?: {
    responses: number;
    requested: number;
    responseRate: number;
    avgScore: number;
    distribution: Record<string, number>;
  };
}

interface AdminWorkload {
  rangeDays: number;
  admins: {
    id: string;
    name: string;
    role: string;
    assigned: number;
    resolved: number;
    messagesSent: number;
    avgResponseSeconds: number;
    responseSamples: number;
  }[];
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds} dtk`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes} mnt ${rest} dtk`;
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-400">{hint}</div>}
    </Card>
  );
}

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
      {children}
    </Card>
  );
}

function KeyVals({ data }: { data: Record<string, number> }) {
  return (
    <>
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex justify-between border-b border-gray-50 py-1 text-sm last:border-0 dark:border-gray-800/60">
          <span className="text-gray-500 dark:text-gray-400">{key}</span>
          <span className="tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
        </div>
      ))}
    </>
  );
}

export default function MonitoringPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<PerformanceOverview | null>(null);
  const [workload, setWorkload] = useState<AdminWorkload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workloadError, setWorkloadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setData(await api<PerformanceOverview>(`/dashboard/performance?days=${days}`));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Gagal memuat metrik performa dari API.');
      } finally {
        setLoading(false);
      }
      setWorkloadError(null);
      try {
        setWorkload(await api<AdminWorkload>(`/dashboard/admin-workload?days=${days}`));
      } catch (err) {
        setWorkload(null);
        setWorkloadError(err instanceof Error ? err.message : 'Gagal memuat beban kerja admin dari API.');
      }
    }
    load();
  }, [days]);

  const maxVolume = Math.max(...(data?.messageVolume.map((item) => item.count) ?? [1]), 1);

  return (
    <AppLayout>
      <PageHeader
        title="Performance Monitoring"
        subtitle="Waktu respons, kualitas AI, pengiriman, dan volume pesan"
      >
        <label htmlFor="range-select" className="sr-only">
          Rentang waktu
        </label>
        <select
          id="range-select"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="h-8 rounded-md border border-gray-300 bg-white px-2.5 text-[13px] text-gray-700 outline-none focus:border-hermes-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <option value={7}>7 hari terakhir</option>
          <option value={14}>14 hari terakhir</option>
          <option value={30}>30 hari terakhir</option>
          <option value={90}>90 hari terakhir</option>
        </select>
      </PageHeader>

      <main className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="space-y-5">
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-[76px] rounded animate-shimmer" />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {[1, 2].map((n) => (
                <div key={n} className="h-64 rounded animate-shimmer" />
              ))}
            </div>
          </div>
        ) : error ? (
          <Card className="border-danger-200 bg-danger-50 p-4 dark:border-danger-700/40 dark:bg-danger-900/20">
            <p className="text-sm font-medium text-danger-700 dark:text-danger-400">{error}</p>
            <p className="mt-1 text-xs text-danger-600/80 dark:text-danger-400/80">
              Metrik tidak dapat dimuat. Periksa koneksi API lalu coba lagi.
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setDays((d) => d)}>
              Coba lagi
            </Button>
          </Card>
        ) : data && (
          <div className="space-y-5">
            {workloadError && (
              <p className="rounded-lg border border-review-200 bg-review-50 p-4 text-sm text-review-700 dark:border-review-700/40 dark:bg-review-900/20 dark:text-review-400">
                {workloadError}
              </p>
            )}
            <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard label="Messages" value={data.totals.messages} hint={`${data.rangeDays} hari terakhir`} />
              <MetricCard label="Percakapan" value={data.totals.conversations} />
              <MetricCard label="Pelanggan" value={data.totals.customers} />
              <MetricCard label="Rata-rata respons" value={formatDuration(data.response.avgSeconds)} hint={`${data.response.sampleSize} sampel`} />
              <MetricCard label="Respons P95" value={formatDuration(data.response.p95Seconds)} hint="SLA respons admin" />
              <MetricCard label="Keyakinan AI" value={`${data.aiQuality.avgConfidence}%`} hint={`Risiko ${data.aiQuality.avgRisk}%`} />
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Panel title="Volume pesan">
                {data.messageVolume.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada pesan pada rentang ini.</p>
                ) : (
                <div className="flex h-56 items-end gap-2">
                  {data.messageVolume.map((item) => (
                    <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                      <div
                        className="w-full rounded-t bg-hermes-600"
                        style={{ height: `${Math.max(4, (item.count / maxVolume) * 190)}px` }}
                        title={`${item.date}: ${item.count}`}
                      />
                      <span className="text-[10px] text-gray-400">{item.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
                )}
              </Panel>

              <Panel title="Kualitas AI">
                <div className="grid gap-3 sm:grid-cols-2">
                  <MetricCard label="Review Hermes" value={data.aiQuality.reviewCount} />
                  <MetricCard label="Tingkat fallback" value={`${data.aiQuality.fallbackRate}%`} hint={`${data.aiQuality.fallbackCount} balasan dilempar ke admin`} />
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-2 text-xs font-medium text-gray-500">Keputusan Hermes</div>
                    <KeyVals data={data.aiQuality.decisions} />
                  </div>
                  <div>
                    <div className="mb-2 text-xs font-medium text-gray-500">Tingkat risiko</div>
                    <KeyVals data={data.aiQuality.riskLevels} />
                  </div>
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <Panel title="Pengiriman kampanye">
                <div className="grid gap-3 sm:grid-cols-4">
                  <MetricCard label="Kampanye" value={data.campaign.campaignCount} />
                  <MetricCard label="Penerima" value={data.campaign.totalRecipients} />
                  <MetricCard label="Berhasil" value={`${data.campaign.successRate}%`} hint={`${data.campaign.sent} terkirim`} />
                  <MetricCard label="Gagal" value={`${data.campaign.failureRate}%`} hint={`${data.campaign.failed} gagal`} />
                </div>
                <div className="mt-4">
                  <KeyVals data={data.campaign.byStatus} />
                </div>
              </Panel>

              {data.csat && (
                <Panel title="Customer satisfaction (CSAT)">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard label="Skor rata-rata" value={`${data.csat.avgScore} / 5`} hint={`${data.csat.responses} respons`} />
                    <MetricCard label="Tingkat respons" value={`${data.csat.responseRate}%`} hint={`${data.csat.requested} diminta`} />
                    <MetricCard label="Total respons" value={data.csat.responses} />
                  </div>
                  <div className="mt-4 space-y-1">
                    {[5, 4, 3, 2, 1].map((score) => {
                      const count = data.csat!.distribution[String(score)] ?? 0;
                      const pct = data.csat!.responses > 0 ? Math.round((count / data.csat!.responses) * 100) : 0;
                      return (
                        <div key={score} className="flex items-center gap-2 text-sm">
                          <span className="flex w-10 items-center gap-0.5 tabular-nums text-gray-500">
                            {score}
                            <Star className="h-3.5 w-3.5 text-review-500" strokeWidth={1.75} aria-hidden="true" />
                          </span>
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className="h-full bg-review-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-10 text-right tabular-nums text-gray-500">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              )}

              <Panel title="Akun teraktif">
                {data.topAccounts.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada aktivitas akun pada rentang ini.</p>
                ) : (
                  data.topAccounts.map((account) => (
                    <div key={account.id} className="flex justify-between border-b border-gray-50 py-2 text-sm last:border-0 dark:border-gray-800/60">
                      <span className="text-gray-700 dark:text-gray-300">{account.name}</span>
                      <span className="tabular-nums text-gray-900 dark:text-gray-100">{account.messageCount} pesan</span>
                    </div>
                  ))
                )}
              </Panel>
            </section>

            <Panel title="Kampanye terbaru">
              {data.campaign.recentCampaigns.length === 0 ? (
                <p className="text-sm text-gray-400">Belum ada kampanye yang dijalankan.</p>
              ) : (
                data.campaign.recentCampaigns.map((campaign) => (
                  <div key={campaign.id} className="grid grid-cols-[1fr_140px_100px] gap-3 border-b border-gray-50 py-2 text-sm last:border-0 dark:border-gray-800/60">
                    <span className="text-gray-700 dark:text-gray-300">{campaign.name}</span>
                    <span className="text-gray-500 dark:text-gray-400">{campaign.status}</span>
                    <span className="text-right tabular-nums text-gray-900 dark:text-gray-100">{campaign.recipients}</span>
                  </div>
                ))
              )}
            </Panel>

            {Array.isArray(workload?.admins) && (
              <Panel title={`Admin workload — ${workload!.rangeDays} hari terakhir`}>
                {workload!.admins.length === 0 ? (
                  <p className="text-sm text-gray-400">Belum ada admin terdaftar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-left text-[11px] uppercase tracking-wider text-gray-400 dark:border-gray-800">
                          <th className="py-2 pr-3 font-medium">Admin</th>
                          <th className="py-2 pr-3 text-right font-medium">Ditugaskan</th>
                          <th className="py-2 pr-3 text-right font-medium">Selesai</th>
                          <th className="py-2 pr-3 text-right font-medium">Pesan terkirim</th>
                          <th className="py-2 text-right font-medium">Rata-rata balas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {workload!.admins.map((a) => (
                          <tr key={a.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                            <td className="py-2 pr-3">
                              <span className="text-gray-800 dark:text-gray-200">{a.name}</span>
                              <span className="ml-2 text-xs text-gray-400">{a.role}</span>
                            </td>
                            <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.assigned}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.resolved}</td>
                            <td className="py-2 pr-3 text-right tabular-nums text-gray-600 dark:text-gray-300">{a.messagesSent}</td>
                            <td className="py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                              {a.responseSamples > 0 ? formatDuration(a.avgResponseSeconds) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            )}
          </div>
        )}
      </main>
    </AppLayout>
  );
}

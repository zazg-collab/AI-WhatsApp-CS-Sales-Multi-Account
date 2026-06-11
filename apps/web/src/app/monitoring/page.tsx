'use client';

import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { api } from '@/lib/api';

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
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

export default function MonitoringPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<PerformanceOverview | null>(null);
  const [workload, setWorkload] = useState<AdminWorkload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        setData(await api<PerformanceOverview>(`/dashboard/performance?days=${days}`));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load performance metrics');
      } finally {
        setLoading(false);
      }
      // Workload is supervisor/owner-only; ignore a 403 for lesser roles.
      try {
        setWorkload(await api<AdminWorkload>(`/dashboard/admin-workload?days=${days}`));
      } catch {
        setWorkload(null);
      }
    }
    load();
  }, [days]);

  const maxVolume = Math.max(...(data?.messageVolume.map((item) => item.count) ?? [1]), 1);

  return (
    <AppLayout>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Performance Monitoring</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Response time, AI quality, campaign delivery, dan volume operasional.</p>
            </div>
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="rounded bg-gray-100 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading metrics...</p>
          ) : error ? (
            <p className="rounded border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">{error}</p>
          ) : data && (
            <div className="space-y-6">
              <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <MetricCard label="Messages" value={data.totals.messages} hint={`${data.rangeDays} hari`} />
                <MetricCard label="Conversations" value={data.totals.conversations} />
                <MetricCard label="Customers" value={data.totals.customers} />
                <MetricCard label="Avg response" value={formatDuration(data.response.avgSeconds)} hint={`${data.response.sampleSize} samples`} />
                <MetricCard label="P95 response" value={formatDuration(data.response.p95Seconds)} />
                <MetricCard label="AI confidence" value={`${data.aiQuality.avgConfidence}%`} hint={`Risk ${data.aiQuality.avgRisk}%`} />
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Message Volume</h2>
                  <div className="flex h-56 items-end gap-2">
                    {data.messageVolume.map((item) => (
                      <div key={item.date} className="flex flex-1 flex-col items-center gap-2">
                        <div
                          className="w-full rounded-t bg-emerald-500/80"
                          style={{ height: `${Math.max(4, (item.count / maxVolume) * 190)}px` }}
                          title={`${item.date}: ${item.count}`}
                        />
                        <span className="text-[10px] text-gray-500">{item.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">AI Quality</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard label="Hermes reviews" value={data.aiQuality.reviewCount} />
                    <MetricCard label="Fallback rate" value={`${data.aiQuality.fallbackRate}%`} hint={`${data.aiQuality.fallbackCount} fallback replies`} />
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">Decisions</div>
                      {Object.entries(data.aiQuality.decisions).map(([key, value]) => (
                        <div key={key} className="flex justify-between border-b border-gray-200 dark:border-gray-700 py-1 text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{key}</span><span className="text-gray-900 dark:text-gray-100">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="mb-2 text-sm text-gray-600 dark:text-gray-400">Risk levels</div>
                      {Object.entries(data.aiQuality.riskLevels).map(([key, value]) => (
                        <div key={key} className="flex justify-between border-b border-gray-200 dark:border-gray-700 py-1 text-sm">
                          <span className="text-gray-600 dark:text-gray-400">{key}</span><span className="text-gray-900 dark:text-gray-100">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Campaign Delivery</h2>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MetricCard label="Campaigns" value={data.campaign.campaignCount} />
                    <MetricCard label="Recipients" value={data.campaign.totalRecipients} />
                    <MetricCard label="Success" value={`${data.campaign.successRate}%`} hint={`${data.campaign.sent} sent`} />
                    <MetricCard label="Failure" value={`${data.campaign.failureRate}%`} hint={`${data.campaign.failed} failed`} />
                  </div>
                  <div className="mt-4">
                    {Object.entries(data.campaign.byStatus).map(([key, value]) => (
                      <div key={key} className="flex justify-between border-b border-gray-200 dark:border-gray-700 py-1 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">{key}</span><span className="text-gray-900 dark:text-gray-100">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {data.csat && (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                    <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Customer Satisfaction (CSAT)</h2>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <MetricCard label="Avg score" value={`${data.csat.avgScore} / 5`} hint={`${data.csat.responses} respon`} />
                      <MetricCard label="Response rate" value={`${data.csat.responseRate}%`} hint={`${data.csat.requested} diminta`} />
                      <MetricCard label="Responses" value={data.csat.responses} />
                    </div>
                    <div className="mt-4 space-y-1">
                      {[5, 4, 3, 2, 1].map((score) => {
                        const count = data.csat!.distribution[String(score)] ?? 0;
                        const pct = data.csat!.responses > 0 ? Math.round((count / data.csat!.responses) * 100) : 0;
                        return (
                          <div key={score} className="flex items-center gap-2 text-sm">
                            <span className="w-10 text-gray-600 dark:text-gray-400">{score}★</span>
                            <div className="h-2 flex-1 overflow-hidden rounded bg-gray-100 dark:bg-gray-900">
                              <div className="h-full bg-emerald-500/80" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-10 text-right text-gray-600 dark:text-gray-400">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Top Accounts</h2>
                  {data.topAccounts.length === 0 ? <p className="text-sm text-gray-500">No account activity.</p> : data.topAccounts.map((account) => (
                    <div key={account.id} className="flex justify-between border-b border-gray-200 dark:border-gray-700 py-2 text-sm">
                      <span className="text-gray-700 dark:text-gray-300">{account.name}</span>
                      <span className="text-gray-900 dark:text-gray-100">{account.messageCount} messages</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                <h2 className="mb-4 font-semibold text-gray-900 dark:text-gray-100">Recent Campaigns</h2>
                {data.campaign.recentCampaigns.length === 0 ? <p className="text-sm text-gray-500">No recent campaigns.</p> : data.campaign.recentCampaigns.map((campaign) => (
                  <div key={campaign.id} className="grid grid-cols-[1fr_140px_100px] gap-3 border-b border-gray-200 dark:border-gray-700 py-2 text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{campaign.name}</span>
                    <span className="text-gray-600 dark:text-gray-400">{campaign.status}</span>
                    <span className="text-right text-gray-900 dark:text-gray-100">{campaign.recipients}</span>
                  </div>
                ))}
              </section>

              {Array.isArray(workload?.admins) && (
                <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
                  <h2 className="mb-1 font-semibold text-gray-900 dark:text-gray-100">Beban Kerja Admin</h2>
                  <p className="mb-4 text-xs text-gray-500">
                    Penugasan, penyelesaian, dan kecepatan balas per admin ({workload.rangeDays} hari).
                  </p>
                  {workload.admins.length === 0 ? (
                    <p className="text-sm text-gray-500">Belum ada admin.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-xs uppercase tracking-wide text-gray-500">
                            <th className="py-2 pr-3">Admin</th>
                            <th className="py-2 pr-3 text-right">Ditugaskan</th>
                            <th className="py-2 pr-3 text-right">Resolved</th>
                            <th className="py-2 pr-3 text-right">Pesan Dikirim</th>
                            <th className="py-2 text-right">Avg Balas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {workload.admins.map((a) => (
                            <tr key={a.id} className="border-b border-gray-200 dark:border-gray-700/60">
                              <td className="py-2 pr-3">
                                <span className="text-gray-800 dark:text-gray-200">{a.name}</span>
                                <span className="ml-2 text-xs text-gray-500">{a.role}</span>
                              </td>
                              <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-300">{a.assigned}</td>
                              <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-300">{a.resolved}</td>
                              <td className="py-2 pr-3 text-right text-gray-700 dark:text-gray-300">{a.messagesSent}</td>
                              <td className="py-2 text-right text-gray-700 dark:text-gray-300">
                                {a.responseSamples > 0 ? formatDuration(a.avgResponseSeconds) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}

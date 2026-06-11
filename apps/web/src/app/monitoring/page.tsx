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
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-100">{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}

export default function MonitoringPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<PerformanceOverview | null>(null);
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
    }
    load();
  }, [days]);

  const maxVolume = Math.max(...(data?.messageVolume.map((item) => item.count) ?? [1]), 1);

  return (
    <AppLayout>
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="border-b border-gray-700 bg-gray-800 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-gray-100">Performance Monitoring</h1>
              <p className="text-sm text-gray-400">Response time, AI quality, campaign delivery, dan volume operasional.</p>
            </div>
            <select
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
              className="rounded bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none"
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
            <p className="text-sm text-gray-400">Loading metrics...</p>
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
                <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-100">Message Volume</h2>
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

                <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-100">AI Quality</h2>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MetricCard label="Hermes reviews" value={data.aiQuality.reviewCount} />
                    <MetricCard label="Fallback rate" value={`${data.aiQuality.fallbackRate}%`} hint={`${data.aiQuality.fallbackCount} fallback replies`} />
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm text-gray-400">Decisions</div>
                      {Object.entries(data.aiQuality.decisions).map(([key, value]) => (
                        <div key={key} className="flex justify-between border-b border-gray-700 py-1 text-sm">
                          <span className="text-gray-400">{key}</span><span className="text-gray-100">{value}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <div className="mb-2 text-sm text-gray-400">Risk levels</div>
                      {Object.entries(data.aiQuality.riskLevels).map(([key, value]) => (
                        <div key={key} className="flex justify-between border-b border-gray-700 py-1 text-sm">
                          <span className="text-gray-400">{key}</span><span className="text-gray-100">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-100">Campaign Delivery</h2>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <MetricCard label="Campaigns" value={data.campaign.campaignCount} />
                    <MetricCard label="Recipients" value={data.campaign.totalRecipients} />
                    <MetricCard label="Success" value={`${data.campaign.successRate}%`} hint={`${data.campaign.sent} sent`} />
                    <MetricCard label="Failure" value={`${data.campaign.failureRate}%`} hint={`${data.campaign.failed} failed`} />
                  </div>
                  <div className="mt-4">
                    {Object.entries(data.campaign.byStatus).map(([key, value]) => (
                      <div key={key} className="flex justify-between border-b border-gray-700 py-1 text-sm">
                        <span className="text-gray-400">{key}</span><span className="text-gray-100">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                  <h2 className="mb-4 font-semibold text-gray-100">Top Accounts</h2>
                  {data.topAccounts.length === 0 ? <p className="text-sm text-gray-500">No account activity.</p> : data.topAccounts.map((account) => (
                    <div key={account.id} className="flex justify-between border-b border-gray-700 py-2 text-sm">
                      <span className="text-gray-300">{account.name}</span>
                      <span className="text-gray-100">{account.messageCount} messages</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-gray-700 bg-gray-800 p-5">
                <h2 className="mb-4 font-semibold text-gray-100">Recent Campaigns</h2>
                {data.campaign.recentCampaigns.length === 0 ? <p className="text-sm text-gray-500">No recent campaigns.</p> : data.campaign.recentCampaigns.map((campaign) => (
                  <div key={campaign.id} className="grid grid-cols-[1fr_140px_100px] gap-3 border-b border-gray-700 py-2 text-sm">
                    <span className="text-gray-300">{campaign.name}</span>
                    <span className="text-gray-400">{campaign.status}</span>
                    <span className="text-right text-gray-100">{campaign.recipients}</span>
                  </div>
                ))}
              </section>
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}

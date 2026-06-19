'use client';

import { Card } from '@/components/ui/Card';
import { useApiQuery } from '@/lib/hooks/useApiQuery';
import type { FunnelConversion, BotAttributionResult, WinLoss } from './closing.types';

const STAGE_COLORS: Record<string, string> = {
  cold: 'bg-slate-400',
  warm: 'bg-review-500',
  hot: 'bg-review-600',
  very_hot: 'bg-danger-500',
};
const STAGE_LABELS: Record<string, string> = {
  cold: 'Cold', warm: 'Warm', hot: 'Hot', very_hot: 'Very Hot',
};

interface Props {
  days: number;
}

export function ClosingAnalytics({ days }: Props) {
  const { data: funnel, loading: fl } = useApiQuery<FunnelConversion>(`/dashboard/closing/funnel?days=${days}`, [days]);
  const { data: bots, loading: bl } = useApiQuery<BotAttributionResult>(`/dashboard/closing/bot-attribution?days=${days}`, [days]);
  const { data: winLoss, loading: wl } = useApiQuery<WinLoss>(`/dashboard/closing/win-loss?days=${days}`, [days]);

  const loading = fl || bl || wl;

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-52 rounded animate-shimmer" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Funnel Conversion ─────────────────────────────────────────────── */}
      {funnel && <FunnelPanel funnel={funnel} />}

      {/* ── Bot Attribution ───────────────────────────────────────────────── */}
      {bots && bots.bots.length > 0 && <BotAttributionPanel data={bots} />}

      {/* ── Win / Loss ────────────────────────────────────────────────────── */}
      {winLoss && <WinLossPanel data={winLoss} />}
    </div>
  );
}

// ── Funnel Conversion ──────────────────────────────────────────────────────

function FunnelPanel({ funnel }: { funnel: FunnelConversion }) {
  const maxPop = Math.max(...funnel.stages.map((s) => s.population), 1);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Funnel Conversion
        </h2>
        <div className="flex gap-4 text-xs">
          <span className="text-gray-500">
            <span className="font-semibold text-gray-800 dark:text-gray-200">{funnel.closingCustomers}</span>
            {' '}dari{' '}
            <span className="font-semibold text-gray-800 dark:text-gray-200">{funnel.totalCustomers}</span>
            {' '}customers closing
          </span>
          <span className="font-semibold text-channel-600">Close rate {funnel.closeRate}%</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {funnel.stages.map((stage) => {
          const widthPct = maxPop > 0 ? Math.round((stage.population / maxPop) * 100) : 0;
          return (
            <div key={stage.stage} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  <span className={`inline-block h-2 w-2 rounded-sm ${STAGE_COLORS[stage.stage] ?? 'bg-gray-300'}`} />
                  {STAGE_LABELS[stage.stage] ?? stage.stage}
                </span>
                <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {stage.population}
                </span>
              </div>
              <div className="mb-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={`h-1.5 rounded-full ${STAGE_COLORS[stage.stage] ?? 'bg-gray-400'}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {stage.resolvedConversations} resolved · {stage.conversionRate}% win rate
              </p>
            </div>
          );
        })}
      </div>

      {(funnel.transitions.upgrades > 0 || funnel.transitions.downgrades > 0) && (
        <div className="mt-4 flex gap-6 border-t border-gray-100 pt-4 text-xs dark:border-gray-800">
          <span className="text-gray-500">
            <span className="font-semibold text-channel-600">↑ {funnel.transitions.upgrades}</span>{' '}upgrades
          </span>
          <span className="text-gray-500">
            <span className="font-semibold text-danger-500">↓ {funnel.transitions.downgrades}</span>{' '}downgrades
          </span>
          <span className="text-gray-400 text-[11px]">
            (dari AI scoring events · {funnel.rangeDays} hari terakhir)
          </span>
        </div>
      )}
      {funnel.transitions.upgrades === 0 && funnel.transitions.downgrades === 0 && (
        <p className="mt-3 text-[11px] text-gray-400">
          Velocity data akan terakumulasi seiring AI lead-scoring berjalan.
        </p>
      )}
    </Card>
  );
}

// ── Bot Attribution ────────────────────────────────────────────────────────

function BotAttributionPanel({ data }: { data: BotAttributionResult }) {
  return (
    <Card className="p-5">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
        Attributi per Bot
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[10px] font-semibold uppercase text-gray-400 dark:border-gray-800">
              <th className="pb-2 pr-4">Bot / Persona</th>
              <th className="pb-2 pr-4 text-right">Conversations</th>
              <th className="pb-2 pr-4 text-right">Resolved</th>
              <th className="pb-2 pr-4 text-right">Hot Leads</th>
              <th className="pb-2 pr-4 text-right">Avg Score</th>
              <th className="pb-2 text-right">CSAT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
            {data.bots.map((bot) => (
              <tr key={bot.botId} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                <td className="py-2 pr-4">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{bot.botName}</span>
                  {bot.personaName && (
                    <span className="ml-1 text-gray-400">· {bot.personaName}</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {bot.totalConversations}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  <span className="text-gray-600 dark:text-gray-400">{bot.resolvedConversations}</span>
                  <span className="ml-1 text-[10px] text-gray-400">({bot.resolutionRate}%)</span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  <span className={bot.hotLeads > 0 ? 'font-semibold text-review-600' : 'text-gray-400'}>
                    {bot.hotLeads}
                  </span>
                  {bot.hotLeads > 0 && (
                    <span className="ml-1 text-[10px] text-gray-400">({bot.hotLeadRate}%)</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums text-gray-600 dark:text-gray-400">
                  {bot.avgLeadScore > 0 ? bot.avgLeadScore : '–'}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {bot.avgCsat !== null ? (
                    <span className={bot.avgCsat >= 4 ? 'text-channel-600 font-semibold' : bot.avgCsat < 3 ? 'text-danger-500' : 'text-gray-600'}>
                      {bot.avgCsat} ★
                    </span>
                  ) : (
                    <span className="text-gray-300">–</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ── Win / Loss ──────────────────────────────────────────────────────────────

function WinLossPanel({ data }: { data: WinLoss }) {
  const maxDaily = Math.max(...data.daily.map((d) => d.wins + d.losses), 1);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          Win / Loss — Percakapan Resolved
        </h2>
        <div className="flex gap-4 text-xs">
          <span>
            <span className="font-semibold text-channel-600">{data.wins} Win</span>
            <span className="ml-1 text-gray-400">({data.winRate}%)</span>
          </span>
          <span>
            <span className="font-semibold text-danger-500">{data.losses} Loss</span>
          </span>
          {data.slaLosses > 0 && (
            <span className="text-review-600">
              {data.slaLosses} SLA breach
            </span>
          )}
        </div>
      </div>

      {/* Mini bar chart */}
      {data.total > 0 ? (
        <>
          <div className="mb-4 flex h-20 items-end gap-0.5">
            {data.daily.map((d) => {
              const total = d.wins + d.losses;
              const heightPct = Math.round((total / maxDaily) * 100);
              const winPct = total > 0 ? Math.round((d.wins / total) * 100) : 0;
              return (
                <div key={d.date} className="flex flex-1 flex-col justify-end" style={{ height: '80px' }}>
                  <div
                    className="w-full rounded-t"
                    style={{ height: `${Math.max(heightPct, total > 0 ? 4 : 0)}%` }}
                    title={`${d.date}: ${d.wins}W/${d.losses}L`}
                  >
                    {/* Stacked: win on top (green), loss on bottom (red) */}
                    <div className="flex h-full w-full flex-col">
                      <div className="bg-channel-500 rounded-t" style={{ flex: winPct }} />
                      <div className="bg-danger-400" style={{ flex: 100 - winPct }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {data.topWinLabels.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase text-gray-400">
                  Label pada Win
                </p>
                <div className="space-y-1">
                  {data.topWinLabels.slice(0, 5).map((l) => (
                    <div key={l.label} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 dark:text-gray-300">{l.label}</span>
                      <span className="tabular-nums text-channel-600 font-medium">{l.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.topLossLabels.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase text-gray-400">
                  Label pada Loss
                </p>
                <div className="space-y-1">
                  {data.topLossLabels.slice(0, 5).map((l) => (
                    <div key={l.label} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 dark:text-gray-300">{l.label}</span>
                      <span className="tabular-nums text-danger-500 font-medium">{l.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">Belum ada percakapan resolved dalam periode ini.</p>
      )}
    </Card>
  );
}

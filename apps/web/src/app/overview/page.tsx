'use client';

import Link from 'next/link';
import {
  ShieldCheck,
  TriangleAlert,
  CircleX,
  Unplug,
  Clock,
  ArrowUpRight,
  ChartNoAxesCombined,
  Bot,
  Hand,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { LucideIcon } from 'lucide-react';

/**
 * Operational Overview. Attention queues come first — the things a human must
 * look at now — and analytics sit below. Numbers shown here are illustrative of
 * the layout; in production they are fed by the monitoring + hermes endpoints.
 */

type QueueTone = 'review' | 'danger' | 'neutral';

const queues: {
  key: string;
  label: string;
  count: number;
  hint: string;
  href: string;
  icon: LucideIcon;
  tone: QueueTone;
}[] = [
  {
    key: 'reviews',
    label: 'Pending reviews',
    count: 7,
    hint: 'Drafts awaiting approval',
    href: '/hermes',
    icon: ShieldCheck,
    tone: 'review',
  },
  {
    key: 'risk',
    label: 'High-risk conversations',
    count: 3,
    hint: 'Flagged by Hermes',
    href: '/inbox?filter=risk',
    icon: TriangleAlert,
    tone: 'danger',
  },
  {
    key: 'failed',
    label: 'Failed messages',
    count: 2,
    hint: 'Delivery failures to retry',
    href: '/inbox?filter=failed',
    icon: CircleX,
    tone: 'danger',
  },
  {
    key: 'disconnected',
    label: 'Disconnected accounts',
    count: 1,
    hint: 'Reconnect required',
    href: '/accounts',
    icon: Unplug,
    tone: 'danger',
  },
  {
    key: 'sla',
    label: 'SLA at risk',
    count: 4,
    hint: 'Unanswered over 15m',
    href: '/inbox?filter=sla',
    icon: Clock,
    tone: 'review',
  },
];

const toneRing: Record<QueueTone, string> = {
  review: 'text-review-600',
  danger: 'text-danger-600',
  neutral: 'text-gray-500',
};

const attention = [
  {
    name: 'Putri Andini',
    account: 'Sales · +62 812-3344',
    reason: 'Refund request — Hermes recommends takeover',
    state: 'human-takeover' as const,
    icon: Hand,
    tone: 'neutral' as const,
    time: '2m',
  },
  {
    name: 'Budi Santoso',
    account: 'CS · +62 813-9087',
    reason: 'Draft ready, confidence below auto-send threshold',
    state: 'needs-review' as const,
    icon: TriangleAlert,
    tone: 'review' as const,
    time: '4m',
  },
  {
    name: 'Rina Wijaya',
    account: 'Sales · +62 811-5521',
    reason: 'Legal keyword detected — AI paused',
    state: 'sending-blocked' as const,
    icon: CircleX,
    tone: 'danger' as const,
    time: '11m',
  },
  {
    name: 'Agus Pratama',
    account: 'CS · +62 821-7741',
    reason: 'AI drafted reply, Hermes reviewed and approved',
    state: 'ai-generated' as const,
    icon: Bot,
    tone: 'hermes' as const,
    time: '12m',
  },
];

const stateLabel: Record<string, string> = {
  'human-takeover': 'Human takeover',
  'needs-review': 'Needs review',
  'sending-blocked': 'Sending blocked',
  'ai-generated': 'AI generated',
};

const metrics = [
  { label: 'Conversations today', value: '184', delta: '+12%', positive: true },
  { label: 'AI auto-handled', value: '63%', delta: '+4 pts', positive: true },
  { label: 'Median first response', value: '38s', delta: '-9s', positive: true },
  { label: 'Hermes approval rate', value: '91%', delta: '+1 pt', positive: true },
];

export default function OverviewPage() {
  return (
    <AppLayout>
      <PageHeader title="Overview" subtitle="Operational attention across all accounts">
        <Link
          href="/analytics"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <ChartNoAxesCombined className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Full analytics
        </Link>
      </PageHeader>

      <div className="scrollbar-thin flex-1 overflow-y-auto p-5">
        {/* Attention queues — top priority. */}
        <section aria-labelledby="queues-h">
          <h2
            id="queues-h"
            className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
          >
            Attention required
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {queues.map((q) => {
              const Icon = q.icon;
              return (
                <Link key={q.key} href={q.href} className="group">
                  <Card className="h-full p-3.5 transition-colors hover:border-gray-300 dark:hover:border-gray-700">
                    <div className="flex items-start justify-between">
                      <Icon
                        className={`h-[18px] w-[18px] ${toneRing[q.tone]}`}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      <ArrowUpRight
                        className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500"
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </div>
                    <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {q.count}
                    </p>
                    <p className="mt-0.5 text-[13px] font-medium text-gray-700 dark:text-gray-200">
                      {q.label}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">{q.hint}</p>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Needs-attention conversation list. */}
        <section className="mt-6" aria-labelledby="attn-h">
          <Card>
            <CardHeader>
              <CardTitle>Conversations needing a decision</CardTitle>
              <Link
                href="/inbox"
                className="inline-flex items-center gap-1 text-xs font-medium text-hermes-600 hover:text-hermes-700"
              >
                Open inbox
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </CardHeader>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {attention.map((c) => {
                const Icon = c.icon;
                return (
                  <li
                    key={c.name}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {c.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                          {c.name}
                        </p>
                        <span className="truncate text-xs text-gray-400">{c.account}</span>
                      </div>
                      <p className="truncate text-[13px] text-gray-500 dark:text-gray-400">
                        {c.reason}
                      </p>
                    </div>
                    <Badge tone={c.tone}>
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {stateLabel[c.state]}
                    </Badge>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-gray-400">
                      {c.time}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>

        {/* Analytics — below actionable items. */}
        <section className="mt-6" aria-labelledby="metrics-h">
          <h2
            id="metrics-h"
            className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400"
          >
            Today at a glance
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map((m) => (
              <Card key={m.label} className="p-3.5">
                <p className="text-xs text-gray-500 dark:text-gray-400">{m.label}</p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                    {m.value}
                  </span>
                  <span
                    className={`text-xs font-medium tabular-nums ${
                      m.positive ? 'text-channel-700' : 'text-danger-600'
                    }`}
                  >
                    {m.delta}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

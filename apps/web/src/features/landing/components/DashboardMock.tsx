'use client';

import * as React from 'react';
import { ShieldStar, CheckCircle, TrendUp } from '@phosphor-icons/react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/cn';
import type { TFunction } from '@/lib/i18n';

const convos = [
  { initial: 'R', name: 'Rina', snippet: 'pvMsgCustomer', tone: 'danger' as const, active: true, dot: 'bg-emerald-500' },
  { initial: 'B', name: 'Budi', snippet: 'pvL2Snippet', tone: 'review' as const, active: false, dot: 'bg-emerald-500' },
  { initial: 'S', name: 'Sarah', snippet: 'pvL3Snippet', tone: 'accent' as const, active: false, dot: 'bg-gray-300 dark:bg-gray-600' },
];

/**
 * A real, in-code preview of the 3-pane product (conversation list, chat thread,
 * intelligence panel). Built from the app's own Badge + tokens, not a screenshot,
 * so it stays crisp and theme-correct in light and dark.
 */
export function DashboardMock({ t }: { t: TFunction }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-pop dark:border-gray-800 dark:bg-gray-900">
      {/* Window chrome */}
      <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50/80 px-3.5 py-2.5 dark:border-gray-800 dark:bg-gray-950/60">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
          <ShieldStar className="h-3.5 w-3.5 text-hermes-600 dark:text-hermes-400" weight="fill" aria-hidden="true" />
          Hermes Control Center
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden="true" />
          {t('pvLive')}
        </span>
      </div>

      <div className="grid grid-cols-[148px_1fr] lg:grid-cols-[160px_1fr_180px]">
        {/* Conversation list */}
        <aside className="border-r border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-950/30">
          <p className="px-3 pb-1.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t('pvNav')}
          </p>
          <ul>
            {convos.map((c) => (
              <li
                key={c.name}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5',
                  c.active && 'bg-white shadow-[inset_2px_0_0_0] shadow-hermes-600 dark:bg-gray-900',
                )}
              >
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hermes-700 text-[11px] font-semibold text-white">
                  {c.initial}
                  <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-gray-900', c.dot)} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-gray-800 dark:text-gray-100">{c.name}</span>
                  <span className="block truncate text-[10.5px] text-gray-500">{t(c.snippet)}</span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        {/* Chat thread */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-gray-100 px-3.5 py-2.5 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-hermes-700 text-[11px] font-semibold text-white">R</span>
              <span className="text-[12.5px] font-semibold text-gray-900 dark:text-gray-100">Rina</span>
            </div>
            <Badge tone="danger">Hot</Badge>
          </div>

          <div className="flex-1 space-y-2.5 bg-gray-50 px-3.5 py-3.5 dark:bg-gray-950/40">
            <div className="flex justify-start">
              <p className="max-w-[82%] rounded-xl rounded-tl-sm bg-white px-2.5 py-1.5 text-[12px] leading-5 text-gray-800 shadow-card dark:bg-gray-800 dark:text-gray-100">
                {t('pvMsgCustomer')}
              </p>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[86%] space-y-1">
                <p className="rounded-xl rounded-br-sm bg-hermes-700 px-2.5 py-1.5 text-[12px] leading-5 text-white">
                  {t('pvMsgAi')}
                </p>
                <div className="flex justify-end">
                  <Badge tone="accent">AI</Badge>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2.5 dark:border-gray-800">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
              <ShieldStar className="h-3.5 w-3.5 text-hermes-600 dark:text-hermes-400" aria-hidden="true" />
              {t('pvReviewing')}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40">
              <CheckCircle className="h-3 w-3" weight="fill" aria-hidden="true" />
              {t('pvApproved')}
            </span>
          </div>
        </div>

        {/* Intelligence panel */}
        <aside className="hidden border-l border-gray-100 bg-gray-50/50 p-3.5 dark:border-gray-800 dark:bg-gray-950/30 lg:block">
          <p className="pb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{t('pvIntel')}</p>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-500">{t('pvLeadScore')}</span>
              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-danger-600 dark:text-danger-400">
                <TrendUp className="h-3 w-3" weight="bold" aria-hidden="true" />
                86
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <span className="block h-full w-[86%] rounded-full bg-gradient-to-r from-review-500 to-danger-500" aria-hidden="true" />
            </div>
          </div>

          <dl className="mt-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <dt className="text-[11px] text-gray-500">{t('pvSentiment')}</dt>
              <dd><Badge tone="success">{t('pvSentimentValue')}</Badge></dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[11px] text-gray-500">{t('pvStage')}</dt>
              <dd><Badge tone="hermes">{t('pvStageValue')}</Badge></dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <Badge tone="neutral">DP</Badge>
            <Badge tone="neutral">Pengiriman</Badge>
          </div>
        </aside>
      </div>
    </div>
  );
}

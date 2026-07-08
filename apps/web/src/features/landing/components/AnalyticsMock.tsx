'use client';

import * as React from 'react';
import { ChartLineUp, TrendUp } from '@/components/ui/core-essential-icons';
import { cn } from '@/lib/cn';
import type { TFunction } from '@/lib/i18n';

const funnel = [
  { key: 'anaStgNew', pct: 100, won: false },
  { key: 'anaStgWarm', pct: 72, won: false },
  { key: 'anaStgHot', pct: 48, won: false },
  { key: 'anaStgClosing', pct: 31, won: false },
  { key: 'anaStgWon', pct: 22, won: true },
];

/** Real, in-code funnel chart built from CSS bars (no charting library). */
export function AnalyticsMock({ t }: { t: TFunction }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-pop dark:border-gray-800 dark:bg-gray-900 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
          <ChartLineUp className="h-4 w-4 text-hermes-600 dark:text-hermes-400" weight="bold" aria-hidden="true" />
          {t('anaChartTitle')}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40">
          <TrendUp className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
          {t('anaWonLabel')}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        {funnel.map((row) => (
          <div key={row.key} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-[12px] font-medium text-gray-500">{t(row.key)}</span>
            <span className="relative h-7 flex-1 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
              <span
                style={{ width: `${row.pct}%` }}
                className={cn(
                  'absolute inset-y-0 left-0 rounded-md',
                  row.won
                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                    : 'bg-gradient-to-r from-hermes-400 to-hermes-600',
                )}
                aria-hidden="true"
              />
              <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                {row.pct}%
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

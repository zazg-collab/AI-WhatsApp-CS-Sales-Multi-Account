'use client';

import * as React from 'react';
import { ShieldStar, CheckCircle } from '@/components/ui/core-essential-icons';
import { Badge } from '@/components/ui/Badge';
import type { TFunction } from '@/lib/i18n';

/**
 * Real, in-code preview of a Sentinel review decision (PRD Hermes Decision Output).
 * Replaces the earlier fake "video" frame: this shows the actual feature, in the
 * app's own components, instead of implying a video that does not exist.
 */
export function SupervisorReviewMock({ t }: { t: TFunction }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-pop dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-gray-800">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
          <ShieldStar className="h-4 w-4 text-hermes-600 dark:text-hermes-400" weight="fill" aria-hidden="true" />
          {t('revHeader')}
        </span>
        <Badge tone="success">
          <CheckCircle className="h-3.5 w-3.5" weight="fill" aria-hidden="true" />
          {t('revApprove')}
        </Badge>
      </div>

      <div className="space-y-4 p-5">
        {/* The AI draft under review */}
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950/40">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{t('revDraftLabel')}</p>
          <p className="mt-1.5 text-[12.5px] leading-5 text-gray-700 dark:text-gray-200">{t('pvMsgAi')}</p>
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-gray-500">{t('revConfidence')}</span>
              <span className="font-mono text-[13px] font-semibold text-hermes-700 dark:text-hermes-300">92</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <span className="block h-full w-[92%] rounded-full bg-hermes-500" aria-hidden="true" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-gray-500">{t('revRisk')}</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[13px] font-semibold text-gray-700 dark:text-gray-200">
                8
                <Badge tone="success">{t('revRiskLow')}</Badge>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <span className="block h-full w-[8%] rounded-full bg-emerald-500" aria-hidden="true" />
            </div>
          </div>
        </div>

        {/* Reason */}
        <div className="border-t border-gray-100 pt-3.5 dark:border-gray-800">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">{t('revReasonLabel')}</p>
          <p className="mt-1 text-[12.5px] leading-5 text-gray-600 dark:text-gray-300">{t('revReason')}</p>
        </div>
      </div>
    </div>
  );
}

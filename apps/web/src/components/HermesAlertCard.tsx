import Link from 'next/link';
import { Warning, ArrowUpRight } from '@phosphor-icons/react';
import { Card } from '@/components/ui/Card';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import type { TFunction } from '@/lib/i18n';

export interface HermesAlertCardProps {
  id: string;
  conversationId: string;
  customer?: {
    name?: string | null;
    phoneNumber: string;
  };
  riskLevel: string;
  decision: string;
  reason: string;
  recommendation?: string;
  confidenceScore: number;
  riskScore: number;
  createdAt?: string;
  decisionToneMap: Record<string, BadgeProps['tone']>;
  riskToneMap: Record<string, BadgeProps['tone']>;
  decisionLabelKey: Record<string, string>;
  riskLabelKey: Record<string, string>;
  relTime: (iso?: string) => string;
  t: TFunction;
}

export function HermesAlertCard({
  conversationId,
  customer,
  riskLevel,
  decision,
  reason,
  recommendation,
  confidenceScore,
  riskScore,
  createdAt,
  decisionToneMap,
  riskToneMap,
  decisionLabelKey,
  riskLabelKey,
  relTime,
  t,
}: HermesAlertCardProps) {
  const customerName = customer?.name ?? customer?.phoneNumber ?? t('customer');
  const decisionTone = decisionToneMap[decision] ?? riskToneMap[riskLevel] ?? 'neutral';
  const decisionLabel = decisionLabelKey[decision] ? t(decisionLabelKey[decision]) : decision;
  const riskLabel = t(riskLabelKey[riskLevel] ?? 'riskMedium');

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {customerName}
            </span>
            <span className="text-xs text-gray-400">{relTime(createdAt)}</span>
          </div>
        </div>
        <Badge tone={decisionTone}>
          <Warning className="h-3.5 w-3.5" aria-hidden="true" />
          {riskLabel} · {decisionLabel}
        </Badge>
      </div>
      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{reason}</p>
      {recommendation && (
        <p className="mt-1 text-xs text-gray-500">{t('recommendation', { value: recommendation })}</p>
      )}
      <p className="mt-1 text-xs tabular-nums text-gray-400">
        {t('confRisk', { conf: confidenceScore, risk: riskScore })}
      </p>
      <Link
        href={`/inbox?conversation=${conversationId}`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-hermes-50 px-2.5 py-1 text-[12px] font-semibold text-hermes-700 transition-colors hover:bg-hermes-100 dark:bg-hermes-900/30 dark:text-hermes-300 dark:hover:bg-hermes-900/50"
      >
        {t('openConversation')}
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </Card>
  );
}

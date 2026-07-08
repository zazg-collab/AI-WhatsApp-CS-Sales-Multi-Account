'use client';

import { cn } from '@/lib/cn';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import type { ConvDetail } from '../inbox.types';

interface WorkflowStatusProps {
  conversation: ConvDetail;
  onSetStatus?: (status: string) => Promise<void>;
  loading?: boolean;
}

const STATUSES: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
];

/**
 * WorkflowStatus: move the conversation through the open → pending → resolved
 * workflow. Distinct from AI mode (automation) and takeover (who is replying).
 */
export function WorkflowStatus({ conversation, onSetStatus, loading = false }: WorkflowStatusProps) {
  const t = useT(dict);
  const current = conversation.status;

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">{t('workflowStatusField')}</h3>
      <div className="flex gap-1.5">
        {STATUSES.map((s) => {
          const active = current === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => !active && onSetStatus?.(s.value)}
              disabled={loading || active}
              className={cn(
                'flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors disabled:opacity-100',
                active
                  ? 'border-sentinel-600 bg-sentinel-600 text-white'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800',
              )}
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

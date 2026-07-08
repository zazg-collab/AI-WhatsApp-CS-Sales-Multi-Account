import * as React from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'hermes' | 'accent' | 'channel' | 'review' | 'danger' | 'critical' | 'success';

const tones: Record<Tone, string> = {
  neutral:
    'bg-gray-100 text-gray-600 ring-1 ring-gray-200/80 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700',
  hermes:
    'bg-hermes-50 text-hermes-700 ring-1 ring-hermes-200 dark:bg-hermes-900/50 dark:text-hermes-300 dark:ring-hermes-700/50',
  accent:
    'bg-accent-50 text-accent-700 ring-1 ring-accent-200 dark:bg-accent-900/40 dark:text-accent-300 dark:ring-accent-700/40',
  channel:
    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40',
  review:
    'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-700/40',
  danger:
    'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700/40',
  critical:
    'bg-critical-100 text-critical-700 ring-1 ring-critical-200 dark:bg-critical-900/40 dark:text-critical-400 dark:ring-critical-700/40',
  success:
    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:ring-emerald-700/40',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
        'text-[11px] font-semibold leading-none tracking-wide',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

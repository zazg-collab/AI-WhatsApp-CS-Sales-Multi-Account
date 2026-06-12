import * as React from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'hermes' | 'channel' | 'review' | 'danger' | 'success';

const tones: Record<Tone, string> = {
  neutral:
    'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
  // AI presence — indigo, subtle.
  hermes:
    'bg-hermes-50 text-hermes-700 border-hermes-100 dark:bg-hermes-900/40 dark:text-hermes-200 dark:border-hermes-800',
  channel:
    'bg-channel-50 text-channel-700 border-channel-100 dark:bg-channel-700/20 dark:text-channel-500 dark:border-channel-700/40',
  review:
    'bg-review-50 text-review-700 border-review-100 dark:bg-review-700/20 dark:text-review-500 dark:border-review-700/40',
  danger:
    'bg-danger-50 text-danger-700 border-danger-100 dark:bg-danger-700/20 dark:text-danger-500 dark:border-danger-700/40',
  success:
    'bg-channel-50 text-channel-700 border-channel-100 dark:bg-channel-700/20 dark:text-channel-500 dark:border-channel-700/40',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** Compact status pill. Always pair with a text label — never icon-only. */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5',
        'text-[11px] font-medium leading-none',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

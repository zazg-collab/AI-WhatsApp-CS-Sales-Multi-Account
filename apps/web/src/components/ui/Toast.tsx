import { X } from '@/components/ui/core-essential-icons';
import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'danger';

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  onDismiss: () => void;
}

const tones: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
  danger: 'border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-800 dark:bg-danger-900/30 dark:text-danger-200',
};

export function Toast({ message, tone = 'danger', onDismiss }: ToastProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center justify-between rounded-lg border px-3 py-2 text-sm',
        tones[tone],
      )}
    >
      <span>{message}</span>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-2 shrink-0 transition-opacity hover:opacity-70"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

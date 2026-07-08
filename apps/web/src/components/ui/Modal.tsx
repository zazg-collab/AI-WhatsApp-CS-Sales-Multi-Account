'use client';

import * as React from 'react';
import { X } from '@/components/ui/core-essential-icons';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Max width of the dialog panel. */
  size?: 'sm' | 'md' | 'lg';
  /** Current step (1-based) for multi-step flows — renders a "Step X of Y" + dots. */
  step?: number;
  /** Total steps for multi-step flows. Required for the step indicator to show. */
  totalSteps?: number;
  /** Localised "Step {current} of {total}" label; falls back to English. */
  stepLabel?: string;
}

const sizes: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/**
 * Accessible dialog: backdrop + Escape close, focus is moved into the panel on
 * open and restored on close, and body scroll is locked. Fits within the
 * viewport on mobile (max-h + internal scroll). Status is conveyed by the
 * labelled heading, never by colour alone.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  step,
  totalSteps,
  stepLabel,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();

  // Store latest onClose in a ref so the effect below doesn't re-run (and
  // steal focus) when the parent re-renders with a new callback reference.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog only on initial open.
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'flex max-h-[92dvh] w-full flex-col rounded-t-xl bg-white shadow-pop outline-none',
          'animate-fade-in dark:bg-gray-900 sm:rounded-xl',
          sizes[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[15px] font-semibold tracking-tight text-gray-950 dark:text-gray-50"
            >
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
                {description}
              </p>
            )}
            {step != null && totalSteps != null && totalSteps > 1 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  {Array.from({ length: totalSteps }).map((_, i) => (
                    <span
                      key={i}
                      className={cn(
                        'h-1.5 rounded-full transition-all',
                        i + 1 === step ? 'w-5 bg-sentinel-600' : i + 1 < step ? 'w-1.5 bg-sentinel-400' : 'w-1.5 bg-gray-200 dark:bg-gray-700',
                      )}
                    />
                  ))}
                </span>
                <span className="text-[11px] font-medium text-gray-400">
                  {(stepLabel ?? 'Step {current} of {total}').replace('{current}', String(step)).replace('{total}', String(totalSteps))}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5 dark:border-gray-800">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

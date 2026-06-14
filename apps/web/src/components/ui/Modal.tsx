'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

type Size = 'sm' | 'md' | 'lg';

const sizes: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
};

/**
 * Accessible dialog used across the app.
 *
 *  - `role="dialog"` + `aria-modal` + `aria-labelledby` for assistive tech
 *  - Escape key and backdrop click both dismiss
 *  - Moves focus into the panel on open and locks body scroll
 *  - Responsive: full width on small screens, capped by `size` — never the
 *    fixed `w-96` that overflowed phones.
 */
export function Modal({
  title,
  onClose,
  children,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: Size;
}) {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus to the first interactive control inside the dialog.
    panelRef.current
      ?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"])')
      ?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 dark:bg-gray-950/60"
      // Backdrop click (mousedown on the overlay itself, not its children) closes.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          'scrollbar-thin max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-pop dark:border-gray-800 dark:bg-gray-900',
          sizes[size],
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5 dark:border-gray-800">
          <h2 id={titleId} className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

import * as React from 'react';
import { cn } from '@/lib/cn';

/** White surface, subtle border, minimal shadow — the default container. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-card',
        'dark:border-gray-800 dark:bg-gray-900',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-800',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-sm font-semibold text-gray-900 dark:text-gray-100', className)}
      {...props}
    />
  );
}

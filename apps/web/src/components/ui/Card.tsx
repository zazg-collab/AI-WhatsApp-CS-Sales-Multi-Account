import * as React from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200/80 bg-white',
        'shadow-[0_1px_3px_rgba(15,23,42,0.06),0_1px_2px_rgba(15,23,42,0.04)]',
        'transition-shadow duration-200 hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_1px_3px_rgba(15,23,42,0.06)]',
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
        'flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3.5 dark:border-gray-800/80',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-[13px] font-semibold tracking-tight text-gray-900 dark:text-gray-100', className)}
      {...props}
    />
  );
}

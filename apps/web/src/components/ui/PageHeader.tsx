import * as React from 'react';
import { BackendStatus } from '@/components/BackendStatus';

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="z-10 flex min-h-16 shrink-0 flex-col items-stretch gap-3 border-b border-gray-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-0">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <BackendStatus />
        </div>
        <h1 className="truncate text-[16px] font-semibold tracking-tight text-gray-950 dark:text-gray-50">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-[12px] text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{children}</div>
      )}
    </header>
  );
}

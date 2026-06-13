import * as React from 'react';

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
    <header className="app-header-surface flex h-14 shrink-0 items-center justify-between gap-4 px-5 z-10">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-bold tracking-tight text-gray-900 dark:text-gray-50">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

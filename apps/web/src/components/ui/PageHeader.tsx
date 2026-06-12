import * as React from 'react';

/** Consistent top bar for full-page surfaces. Title left, actions right. */
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
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-5 dark:border-gray-800 dark:bg-gray-900">
      <div className="min-w-0">
        <h1 className="truncate text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

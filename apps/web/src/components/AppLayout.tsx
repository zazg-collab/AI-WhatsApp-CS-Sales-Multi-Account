import { Sidebar } from './Sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-gray-100 p-2 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <Sidebar />
      <main className="ml-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded border border-gray-200 bg-gray-50 shadow-[0_1px_2px_rgba(15,23,42,0.04)] animate-fade-in dark:border-gray-800 dark:bg-gray-950">
        {children}
      </main>
    </div>
  );
}

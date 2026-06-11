import { Sidebar } from './Sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    // Warm off-white canvas (clean editorial look); dark theme keeps the old slate.
    <div className="flex h-screen overflow-hidden bg-[#F7F6F3] dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

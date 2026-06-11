import { Sidebar } from './Sidebar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wa-app-shell flex min-h-[100dvh] overflow-hidden text-gray-100">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden p-3 lg:p-4">
        <div className="wa-panel-card flex min-h-0 flex-1 overflow-hidden rounded-[1.75rem]">
          {children}
        </div>
      </main>
    </div>
  );
}

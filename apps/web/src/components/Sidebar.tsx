'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken, getToken } from '@/lib/api';
import { ThemeToggle } from './ThemeToggle';
import {
  BookOpen,
  ChartNoAxesCombined,
  Code,
  ContactRound,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Phone,
  ScrollText,
  Settings,
  ShieldCheck,
  UsersRound,
  Workflow,
} from './icons';

interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: ReactNode;
  requiredRole?: 'owner' | 'supervisor' | 'admin' | 'viewer';
}

function getRoleFromToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.role;
  } catch {
    return null;
  }
}

const roleHierarchy: Record<string, number> = {
  owner: 4,
  supervisor: 3,
  admin: 2,
  viewer: 1,
};

function canView(userRole: string | null, requiredRole?: string): boolean {
  if (!requiredRole) return true;
  if (!userRole) return false;
  return (roleHierarchy[userRole] ?? 0) >= (roleHierarchy[requiredRole] ?? 0);
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Inbox', description: 'Queues and supervised replies', icon: <Inbox /> },
  { href: '/monitoring', label: 'Overview', description: 'Operational attention', icon: <LayoutDashboard />, requiredRole: 'supervisor' },
  { href: '/customers', label: 'Contacts', description: 'CRM records', icon: <ContactRound /> },
  { href: '/analytics', label: 'CRM Pipeline', description: 'Sales stages and trends', icon: <GitBranch /> },
  { href: '/campaigns', label: 'Campaigns', description: 'Controlled outbound', icon: <Megaphone />, requiredRole: 'admin' },
  { href: '/knowledge', label: 'Knowledge Base', description: 'AI source material', icon: <BookOpen /> },
  { href: '/hermes', label: 'Hermes Review', description: 'Risk and quality rules', icon: <ShieldCheck /> },
  { href: '/audit', label: 'Audit Log', description: 'Traceable activity', icon: <History />, requiredRole: 'supervisor' },
  { href: '/templates', label: 'Templates', description: 'Approved responses', icon: <ScrollText /> },
  { href: '/accounts', label: 'WA Accounts', description: 'Channel connections', icon: <Phone /> },
  { href: '/bots', label: 'Automation', description: 'Personas and modes', icon: <Workflow /> },
  { href: '/admin/users', label: 'Team', description: 'Roles and access', icon: <UsersRound />, requiredRole: 'supervisor' },
  { href: '/settings/ai', label: 'Settings', description: 'AI configuration', icon: <Settings /> },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const userRole = getRoleFromToken();

  function handleLogout() {
    clearToken();
    router.push('/');
  }

  return (
    <aside className="flex h-screen w-[76px] shrink-0 flex-col border-r border-slate-200 bg-white text-slate-700 lg:w-72">
      <div className="border-b border-slate-200 px-3 py-4 lg:px-5">
        <div className="flex items-center justify-center gap-3 lg:justify-start">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700">
            <ShieldCheck size={20} />
          </div>
          <div className="hidden min-w-0 lg:block">
            <p className="truncate text-sm font-semibold text-slate-950">Hermes Control Center</p>
            <p className="truncate text-xs text-slate-500">AI sales and service ops</p>
          </div>
        </div>
        <div className="mt-4 hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 lg:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <span className="text-xs font-medium text-slate-600">WhatsApp channel active</span>
        </div>
      </div>

      <nav className="wa-scrollbar flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3 lg:px-3" aria-label="Main navigation">
        {navItems.map((item) => {
          if (!canView(userRole, item.requiredRole)) return null;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors lg:justify-start lg:px-3 ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              }`}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`flex h-8 w-8 items-center justify-center rounded-md ${isActive ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 group-hover:text-slate-900'}`}>
                {item.icon}
              </span>
              <span className="hidden min-w-0 lg:block">
                <span className="block truncate font-medium">{item.label}</span>
                <span className="block truncate text-[11px] text-slate-400">{item.description}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-2 lg:p-3">
        <ThemeToggle />
        <a
          href={`${(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/api\/v1$/, '')}/api/docs`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950 lg:justify-start lg:px-3"
          title="API Docs"
        >
          <Code size={18} />
          <span className="hidden lg:block">API Docs</span>
        </a>
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm text-slate-600 hover:bg-red-50 hover:text-red-700 lg:justify-start lg:px-3"
          title="Logout"
        >
          <LogOut size={18} />
          <span className="hidden lg:block">Logout</span>
        </button>
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Inbox,
  ContactRound,
  Megaphone,
  BookOpen,
  ShieldCheck,
  History,
  ChartNoAxesCombined,
  UsersRound,
  Settings,
  Smartphone,
  Bot,
  Activity,
  LogOut,
  BookText,
  type LucideIcon,
} from 'lucide-react';
import { getToken, clearToken } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredRole?: 'owner' | 'supervisor' | 'admin' | 'viewer';
}

interface NavSection {
  heading?: string;
  items: NavItem[];
}

function getRoleFromToken(): string | null {
  if (typeof window === 'undefined') return null;
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1])).role ?? null;
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

// Grouped to keep operational surfaces above configuration ones.
const sections: NavSection[] = [
  {
    items: [
      { href: '/overview', label: 'Overview', icon: LayoutDashboard },
      { href: '/inbox', label: 'Inbox', icon: Inbox },
      { href: '/customers', label: 'Contacts', icon: ContactRound },
      { href: '/hermes', label: 'Hermes Review', icon: ShieldCheck },
    ],
  },
  {
    heading: 'Growth',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone, requiredRole: 'admin' },
      { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
      { href: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
      { href: '/monitoring', label: 'Monitoring', icon: Activity, requiredRole: 'supervisor' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/accounts', label: 'Accounts', icon: Smartphone },
      { href: '/bots', label: 'Bots & Personas', icon: Bot },
      { href: '/templates', label: 'Templates', icon: BookText },
      { href: '/audit', label: 'Audit Log', icon: History, requiredRole: 'supervisor' },
      { href: '/admin/users', label: 'Team', icon: UsersRound, requiredRole: 'supervisor' },
      { href: '/settings/ai', label: 'Settings', icon: Settings },
    ],
  },
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
    <aside className="flex h-screen w-14 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:w-56">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-gray-100 px-3 dark:border-gray-800 lg:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hermes-600 text-white">
          <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-100">
            Hermes
          </span>
          <span className="block truncate text-[11px] text-gray-400">Control Center</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4 lg:px-2.5">
        {sections.map((section, i) => {
          const visible = section.items.filter((it) => canView(userRole, it.requiredRole));
          if (visible.length === 0) return null;
          return (
            <div key={i} className="flex flex-col gap-0.5">
              {section.heading && (
                <span className="mb-1 hidden px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 lg:block">
                  {section.heading}
                </span>
              )}
              {visible.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center justify-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium transition-colors duration-150 lg:justify-start lg:px-2.5',
                      isActive
                        ? 'bg-hermes-50 text-hermes-700 dark:bg-hermes-900/40 dark:text-hermes-300'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-hermes-600 lg:block" />
                    )}
                    <Icon
                      className="h-[18px] w-[18px] shrink-0"
                      strokeWidth={isActive ? 2 : 1.75}
                      aria-hidden="true"
                    />
                    <span className="hidden lg:block">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-100 px-2 py-2 dark:border-gray-800 lg:px-3">
        <div className="mb-1">
          <ThemeToggle />
        </div>
        <button
          onClick={handleLogout}
          title="Sign out"
          className="flex w-full items-center justify-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 lg:justify-start lg:px-2.5"
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden lg:block">Sign out</span>
        </button>
      </div>
    </aside>
  );
}

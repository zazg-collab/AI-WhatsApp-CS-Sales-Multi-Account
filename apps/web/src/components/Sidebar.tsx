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
    <aside className="flex h-screen w-14 flex-col border-r border-gray-200/60 bg-gray-950 dark:border-gray-800 lg:w-56">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2.5 border-b border-white/[0.06] px-3 lg:px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-hermes-400 to-hermes-700 shadow-[0_2px_8px_rgba(99,102,241,0.5)]">
          <ShieldCheck className="h-[17px] w-[17px] text-white" strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="hidden min-w-0 lg:block">
          <span className="block truncate text-[13px] font-bold tracking-tight text-white">
            Hermes
          </span>
          <span className="block truncate text-[10px] font-medium text-gray-500 uppercase tracking-widest">Control Center</span>
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
                <span className="mb-1.5 hidden px-2 text-[9px] font-bold uppercase tracking-[0.12em] text-gray-600 lg:block">
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
                      'group flex items-center justify-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium transition-all duration-150 lg:justify-start lg:px-2.5',
                      isActive
                        ? 'bg-hermes-600/20 text-hermes-300 ring-1 ring-hermes-500/30'
                        : 'text-gray-500 hover:bg-white/[0.06] hover:text-gray-200',
                    )}
                  >
                    <Icon
                      className={cn('h-[17px] w-[17px] shrink-0 transition-colors', isActive ? 'text-hermes-400' : 'text-gray-500 group-hover:text-gray-300')}
                      strokeWidth={isActive ? 2.25 : 1.75}
                      aria-hidden="true"
                    />
                    <span className="hidden lg:block">{item.label}</span>
                    {isActive && (
                      <span className="ml-auto hidden h-1.5 w-1.5 shrink-0 rounded-full bg-hermes-400 lg:block" />
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/[0.06] px-2 py-3 lg:px-2.5">
        <ThemeToggle />
        <button
          onClick={handleLogout}
          title="Sign out"
          className="mt-0.5 flex w-full items-center justify-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-white/[0.06] hover:text-gray-300 lg:justify-start lg:px-2.5"
        >
          <LogOut className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden lg:block">Sign out</span>
        </button>
      </div>
    </aside>
  );
}

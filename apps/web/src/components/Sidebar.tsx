'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  SquaresFour,
  Tray,
  AddressBook,
  MegaphoneSimple,
  Books,
  ShieldStar,
  ClockCounterClockwise,
  ChartLineUp,
  UsersThree,
  Gear,
  DeviceMobile,
  ArrowsSplit,
  Pulse,
  SignOut,
  FileText,
  BookOpen,
  GraduationCap,
  Images,
  Cube,
  List,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { getToken, clearToken, api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/cn';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import { useT, type Dict } from '@/lib/i18n';

interface NavItem {
  href: string;
  label: string;
  icon: PhosphorIcon;
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
      { href: '/overview', label: 'Overview', icon: SquaresFour },
      { href: '/inbox', label: 'Inbox', icon: Tray },
      { href: '/customers', label: 'Contacts', icon: AddressBook },
      { href: '/wa-contacts', label: 'WA Contacts', icon: BookOpen },
      { href: '/hermes', label: 'Hermes Review', icon: ShieldStar },
    ],
  },
  {
    heading: 'Growth',
    items: [
      { href: '/campaigns', label: 'Campaigns', icon: MegaphoneSimple, requiredRole: 'admin' },
      { href: '/knowledge', label: 'Knowledge Base', icon: Books },
      { href: '/products', label: 'Produk & Stok', icon: Cube },
      { href: '/assets', label: 'Media Library', icon: Images },
      { href: '/learning', label: 'AI Learning', icon: GraduationCap, requiredRole: 'supervisor' },
      { href: '/analytics', label: 'Analytics', icon: ChartLineUp },
      { href: '/monitoring', label: 'Monitoring', icon: Pulse, requiredRole: 'supervisor' },
    ],
  },
  {
    heading: 'Operations',
    items: [
      { href: '/accounts', label: 'Accounts', icon: DeviceMobile },
      { href: '/bots', label: 'Automation Mode', icon: ArrowsSplit },
      { href: '/templates', label: 'Templates', icon: FileText },
      { href: '/audit', label: 'Audit Log', icon: ClockCounterClockwise, requiredRole: 'supervisor' },
      { href: '/admin/users', label: 'Team', icon: UsersThree, requiredRole: 'supervisor' },
      { href: '/settings/ai', label: 'Settings', icon: Gear },
    ],
  },
];

const dict: Dict = {
  tagline: { id: 'Sales Control Desk', en: 'Sales Control Desk' },
  Growth: { id: 'Pertumbuhan', en: 'Growth' },
  Operations: { id: 'Operasional', en: 'Operations' },
  signOut: { id: 'Keluar', en: 'Sign out' },
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const userRole = getRoleFromToken();
  const t = useT(dict);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (!getToken()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        api<{ count: number }>('/conversations/unread-count').then((r) => setUnread(r?.count ?? 0)).catch(() => {});
      }, 500);
    };
    api<{ count: number }>('/conversations/unread-count').then((r) => setUnread(r?.count ?? 0)).catch(() => {});
    const socket = getSocket();
    if (!socket) return;
    socket.on('message:new', refresh);
    socket.on('conversation:updated', refresh);
    socket.on('connect', () => setIsOnline(true));
    socket.on('disconnect', () => setIsOnline(false));
    return () => {
      if (timer) clearTimeout(timer);
      socket.off('message:new', refresh);
      socket.off('conversation:updated', refresh);
      socket.off('connect', () => setIsOnline(true));
      socket.off('disconnect', () => setIsOnline(false));
    };
  }, [pathname]);

  function handleLogout() {
    clearToken();
    router.push('/');
  }

  // On mobile the rail is icon-only; tapping the toggle expands it to a labelled
  // drawer (overlaid). On lg+ it is always the full labelled sidebar.
  const labelCls = open ? 'block' : 'hidden lg:block';

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}
      <aside className="flex h-full w-14 flex-col rounded border border-gray-800 bg-gray-900 shadow-[0_1px_2px_rgba(15,23,42,0.18)] lg:w-60">
      {/* Brand */}
      <div className="flex h-16 items-center justify-between gap-2.5 border-b border-gray-800 px-3 lg:px-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-hermes-600 text-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]">
            <ShieldStar className="h-[18px] w-[18px]" weight="duotone" aria-hidden="true" />
          </span>
          <span className="hidden min-w-0 lg:block">
            <span className="block truncate text-sm font-semibold tracking-tight text-gray-50">
              Hermes AI
            </span>
            <span className="block truncate text-[11px] text-gray-400">{t('tagline')}</span>
          </span>
        </div>
        <button
          type="button"
          aria-label="Open navigation"
          onClick={() => setOpen(true)}
          className="flex lg:hidden h-8 w-8 items-center justify-center rounded text-gray-400 hover:text-gray-50 hover:bg-gray-800 transition-colors"
        >
          <List className="h-5 w-5" weight="regular" aria-hidden="true" />
        </button>
      </div>

      {/* Nav */}
      <nav className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto px-2 py-4 lg:px-2.5">
        {sections.map((section, i) => {
          const visible = section.items.filter((it) => canView(userRole, it.requiredRole));
          if (visible.length === 0) return null;
          return (
            <div key={i} className="flex flex-col gap-0.5">
              {section.heading && (
                <span className="mb-1 hidden px-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500 lg:block">
                  {t(section.heading)}
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
                    onClick={() => setOpen(false)}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'group relative flex items-center gap-2.5 rounded px-2 py-2 text-[13px] font-medium transition-colors duration-150 lg:justify-start lg:px-2.5',
                      open ? 'justify-start' : 'justify-center',
                      isActive
                        ? 'bg-hermes-500/15 text-hermes-200 ring-1 ring-hermes-500/20'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-50',
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 hidden h-5 w-0.5 -translate-y-1/2 rounded-full bg-hermes-500 lg:block" />
                    )}
                    <span className="relative shrink-0">
                      <Icon
                        className="h-[18px] w-[18px]"
                        weight={isActive ? 'duotone' : 'regular'}
                        aria-hidden="true"
                      />
                      {item.href === '/inbox' && unread > 0 && !open && (
                        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-hermes-600 px-1 text-[9px] font-semibold text-white lg:hidden">
                          {unread > 9 ? '9+' : unread}
                        </span>
                      )}
                    </span>
                    <span className={cn('flex-1', labelCls)}>{item.label}</span>
                    {item.href === '/inbox' && unread > 0 && (
                      <span className={cn('flex h-4 min-w-4 items-center justify-center rounded-full bg-hermes-600 px-1 text-[10px] font-semibold text-white', open ? 'flex' : 'hidden lg:flex')}>
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Offline indicator */}
      {!isOnline && (
        <div className="border-t border-gray-800 bg-danger-50 px-2 py-2 dark:bg-danger-900/20 lg:px-3">
          <div className="flex items-center gap-2 rounded px-2 py-1.5 text-[11px] font-medium text-danger-700 dark:text-danger-300">
            <span className="h-2 w-2 rounded-full bg-danger-600 animate-pulse"></span>
            <span className="hidden lg:inline">Offline</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-gray-800 px-2 py-2 lg:px-3">
        <div className="mb-1">
          <LanguageToggle />
        </div>
        <div className="mb-1">
          <ThemeToggle />
        </div>
        <button
          onClick={handleLogout}
          title="Sign out"
          className="flex w-full items-center justify-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50 lg:justify-start lg:px-2.5"
        >
          <SignOut className="h-[18px] w-[18px] shrink-0" weight="regular" aria-hidden="true" />
          <span className="hidden lg:block">{t('signOut')}</span>
        </button>
      </div>
    </aside>
    </>
  );
}

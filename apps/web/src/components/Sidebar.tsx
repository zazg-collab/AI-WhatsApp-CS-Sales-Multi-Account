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
// Accounts (Baileys/WhatsApp connection) lives in the top group — it is the
// most-used operational surface and must never sit below the scroll fold.
const sections: NavSection[] = [
  {
    items: [
      { href: '/overview', label: 'Overview', icon: SquaresFour },
      { href: '/inbox', label: 'Inbox', icon: Tray },
      { href: '/accounts', label: 'Accounts', icon: DeviceMobile },
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
  waConnected: { id: 'WhatsApp terhubung', en: 'WhatsApp connected' },
  waDegraded: { id: 'Sebagian akun WhatsApp terputus', en: 'Some WhatsApp accounts disconnected' },
  waDown: { id: 'Semua akun WhatsApp terputus', en: 'All WhatsApp accounts disconnected' },
  waNone: { id: 'Belum ada akun WhatsApp', en: 'No WhatsApp accounts yet' },
  appOffline: { id: 'Realtime terputus', en: 'Realtime offline' },
  apiOffline: { id: 'API mati', en: 'API offline' },
  apiChecking: { id: 'Cek koneksi…', en: 'Checking…' },
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const userRole = getRoleFromToken();
  const t = useT(dict);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  // Backend REST API reachability (null = checking on first paint).
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  // WhatsApp account health: how many Baileys sessions are connected vs total.
  const [waHealth, setWaHealth] = useState<{ connected: number; total: number } | null>(null);

  useEffect(() => {
    if (!getToken()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refreshUnread = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        api<{ count: number }>('/conversations/unread-count').then((r) => setUnread(r?.count ?? 0)).catch(() => {});
      }, 500);
    };
    const refreshWaHealth = () => {
      api<Array<{ sessionStatus?: string }>>('/wa/accounts')
        .then((accts) => {
          const list = accts ?? [];
          setWaHealth({
            connected: list.filter((a) => a.sessionStatus === 'connected').length,
            total: list.length,
          });
        })
        .catch(() => {});
    };
    // Backend reachability — single source of truth for "is the API up?",
    // replacing the per-page header badge.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    const checkApi = () => {
      if (typeof fetch !== 'function') { setApiOnline(false); return; }
      fetch(`${apiUrl}/health`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((res: { status?: string }) => setApiOnline(res.status === 'ok'))
        .catch(() => setApiOnline(false));
    };
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    refreshUnread();
    refreshWaHealth();
    checkApi();
    // Poll WA health + API reachability so the rail reflects reconnects/drops.
    const waTimer = setInterval(refreshWaHealth, 30_000);
    const apiTimer = setInterval(checkApi, 30_000);

    const socket = getSocket();
    if (socket) {
      socket.on('message:new', refreshUnread);
      socket.on('conversation:updated', refreshUnread);
      socket.on('wa:status', refreshWaHealth);
      socket.on('connect', handleOnline);
      socket.on('disconnect', handleOffline);
    }
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(waTimer);
      clearInterval(apiTimer);
      if (socket) {
        socket.off('message:new', refreshUnread);
        socket.off('conversation:updated', refreshUnread);
        socket.off('wa:status', refreshWaHealth);
        socket.off('connect', handleOnline);
        socket.off('disconnect', handleOffline);
      }
    };
  }, [pathname]);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
      <nav className="scrollbar-thin flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3 lg:px-2.5">
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

      {/* Single system-health row — the one place for connectivity status.
          Priority: API down (nothing works) > realtime socket down > WhatsApp
          account health. Replaces the old per-page "API online/offline" badge. */}
      {(() => {
        const connected = waHealth?.connected ?? 0;
        const total = waHealth?.total ?? 0;
        let tone: 'ok' | 'degraded' | 'down' | 'none' | 'checking';
        let labelKey: string;
        let text: string;
        if (apiOnline === false) {
          tone = 'down'; labelKey = 'apiOffline'; text = t('apiOffline');
        } else if (apiOnline === null) {
          tone = 'checking'; labelKey = 'apiChecking'; text = t('apiChecking');
        } else if (!isOnline) {
          tone = 'degraded'; labelKey = 'appOffline'; text = t('appOffline');
        } else if (total === 0) {
          tone = 'none'; labelKey = 'waNone'; text = t('waNone');
        } else if (connected === 0) {
          tone = 'down'; labelKey = 'waDown'; text = `WA ${connected}/${total}`;
        } else if (connected < total) {
          tone = 'degraded'; labelKey = 'waDegraded'; text = `WA ${connected}/${total}`;
        } else {
          tone = 'ok'; labelKey = 'waConnected'; text = `WA ${connected}/${total}`;
        }
        const dot = {
          ok: 'bg-emerald-500',
          degraded: 'bg-amber-500 animate-pulse',
          down: 'bg-danger-500 animate-pulse',
          none: 'bg-gray-500',
          checking: 'bg-gray-500 animate-pulse',
        }[tone];
        return (
          <Link
            href="/accounts"
            onClick={() => setOpen(false)}
            title={t(labelKey)}
            className="flex items-center gap-2 border-t border-gray-800 px-3 py-2 text-[11px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50 lg:px-4"
          >
            <span className={cn('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden="true" />
            <span className={cn('truncate', labelCls)}>{text}</span>
          </Link>
        );
      })()}

      {/* Footer — single compact action row (language · theme · sign out) */}
      <div className="flex items-center gap-1 border-t border-gray-800 px-2 py-2 lg:px-3">
        <LanguageToggle compact />
        <ThemeToggle compact />
        <button
          onClick={handleLogout}
          title={t('signOut')}
          aria-label={t('signOut')}
          className="ml-auto flex h-9 items-center justify-center gap-2 rounded-md px-2 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-danger-300"
        >
          <SignOut className="h-[18px] w-[18px] shrink-0" weight="regular" aria-hidden="true" />
          <span className={cn('hidden', open ? 'inline' : 'lg:inline')}>{t('signOut')}</span>
        </button>
      </div>
    </aside>
    </>
  );
}

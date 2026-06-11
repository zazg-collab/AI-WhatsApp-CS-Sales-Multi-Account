'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getToken } from '@/lib/api';

interface NavItem {
  href: string;
  label: string;
  mark: string;
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
  { href: '/dashboard', label: 'Dashboard', mark: 'Ch' },
  { href: '/accounts', label: 'Accounts', mark: 'WA' },
  { href: '/bots', label: 'Bots', mark: 'AI' },
  { href: '/campaigns', label: 'Campaigns', mark: 'Cp', requiredRole: 'admin' },
  { href: '/customers', label: 'Customers', mark: 'Cr' },
  { href: '/knowledge', label: 'Knowledge', mark: 'Kb' },
  { href: '/hermes', label: 'Hermes', mark: 'He' },
  { href: '/monitoring', label: 'Monitoring', mark: 'Mo', requiredRole: 'supervisor' },
  { href: '/analytics', label: 'Analytics', mark: 'An' },
  { href: '/audit', label: 'Audit Log', mark: 'Au', requiredRole: 'supervisor' },
  { href: '/admin/users', label: 'Users', mark: 'Us', requiredRole: 'supervisor' },
  { href: '/settings/ai', label: 'AI Settings', mark: 'St', requiredRole: 'supervisor' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    setUserRole(getRoleFromToken());
  }, []);

  function handleLogout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    router.push('/');
  }

  return (
    <aside className="relative flex min-h-[100dvh] w-16 flex-col items-center border-r border-white/10 bg-[#071116]/95 py-4 shadow-2xl shadow-black/30 lg:w-64 lg:items-stretch">
      <div className="pointer-events-none absolute inset-x-2 top-3 h-32 rounded-full bg-emerald-500/10 blur-3xl" />

      <div className="relative mb-6 flex items-center justify-center gap-3 px-2 lg:justify-start lg:px-4">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-[#00a884] text-lg font-black text-[#06251e] shadow-lg shadow-emerald-950/50">
          H
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="text-base font-bold leading-tight text-gray-50">Hermes</p>
          <p className="text-[11px] font-medium tracking-[0.08em] text-emerald-300/80">WhatsApp cockpit</p>
        </div>
      </div>

      <nav className="wa-scrollbar relative flex flex-1 flex-col gap-1 overflow-y-auto px-1 lg:px-3">
        {navItems.map((item) => {
          if (!canView(userRole, item.requiredRole)) return null;
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center justify-center gap-3 rounded-2xl px-2 py-2.5 text-sm font-medium transition-all duration-200 active:translate-y-px lg:justify-start lg:px-3 ${
                isActive
                  ? 'bg-emerald-500/15 text-emerald-50 shadow-inner shadow-emerald-950/40 ring-1 ring-emerald-400/30'
                  : 'text-gray-400 hover:bg-white/[0.06] hover:text-gray-100'
              }`}
              title={item.label}
            >
              <span className={`grid h-9 w-9 place-items-center rounded-xl text-[11px] font-black tracking-tight transition-colors ${isActive ? 'bg-emerald-400 text-[#06251e]' : 'bg-white/[0.04] text-gray-300 group-hover:bg-white/[0.08]'}`}>
                {item.mark}
              </span>
              <span className="hidden flex-1 lg:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="relative border-t border-white/10 px-1 pt-3 lg:px-3">
        <div className="mb-3 hidden rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-3 lg:block">
          <p className="text-[11px] tracking-[0.08em] text-emerald-200/70">Signed in as</p>
          <p className="mt-1 text-sm font-semibold capitalize text-emerald-50">{userRole ?? 'operator'}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-3 rounded-2xl px-2 py-2.5 text-sm text-gray-400 transition-colors active:translate-y-px hover:bg-red-500/10 hover:text-red-200 lg:justify-start lg:px-3"
          title="Logout"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] text-[11px] font-black tracking-tight text-gray-300">Lo</span>
          <span className="hidden lg:block">Logout</span>
        </button>
      </div>
    </aside>
  );
}

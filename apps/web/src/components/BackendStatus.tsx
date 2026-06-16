'use client';

import { useEffect, useState } from 'react';
import { GearSix, PlugsConnected } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';
import { useT, type Dict } from '@/lib/i18n';

type HealthState = 'checking' | 'online' | 'offline';

const dict: Dict = {
  checking: { id: 'Cek API', en: 'Checking API' },
  online: { id: 'API aktif', en: 'API online' },
  offline: { id: 'API mati', en: 'API offline' },
};

/**
 * Live backend status badge. This intentionally calls the API instead of
 * presenting a static "connected" label, so operators never see fake wiring.
 */
export function BackendStatus() {
  const t = useT(dict);
  const [state, setState] = useState<HealthState>('checking');

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    if (typeof fetch !== 'function') {
      setState('offline');
      return () => {
        mounted = false;
      };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
    fetch(`${apiUrl}/health`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Health check failed: ${res.status}`))))
      .then((res: { status?: string }) => {
        if (!mounted) return;
        setState(res.status === 'ok' ? 'online' : 'offline');
      })
      .catch(() => {
        if (mounted) setState('offline');
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  const Icon = state === 'offline' ? PlugsConnected : GearSix;
  const label = t(state);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
        state === 'online' && 'border-channel-200 bg-channel-50 text-channel-700 dark:border-channel-700/40 dark:bg-channel-900/20 dark:text-channel-500',
        state === 'offline' && 'border-danger-200 bg-danger-50 text-danger-700 dark:border-danger-700/40 dark:bg-danger-900/20 dark:text-danger-400',
        state === 'checking' && 'border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

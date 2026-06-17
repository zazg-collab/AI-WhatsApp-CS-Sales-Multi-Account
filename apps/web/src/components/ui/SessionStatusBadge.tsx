'use client';

/**
 * SessionStatusBadge — single source of truth for WhatsApp account session
 * status rendering. Use this everywhere instead of local `statusTone` maps,
 * `sessionDot` functions, or inline status-check logic.
 *
 * Variants:
 *   badge  — coloured pill with label (accounts list, account selects)
 *   dot    — small coloured dot only (compact lists, bot-assign rows)
 *   inline — dot + label inline (composer header, campaign account picker)
 */

import { cn } from '@/lib/cn';
import { Badge } from './Badge';
import type { BadgeProps } from './Badge';

export type SessionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'qr_required'
  | 'disconnected'
  | 'banned'
  | 'paused'
  | (string & {}); // allow unknown statuses without breaking

type Variant = 'badge' | 'dot' | 'inline';

// Maps session status to badge tone
const STATUS_TONE: Record<string, BadgeProps['tone']> = {
  connected: 'success',
  connecting: 'review',
  reconnecting: 'review',
  qr_required: 'review',
  disconnected: 'danger',
  banned: 'danger',
  paused: 'neutral',
};

// Maps session status to dot colour class
const DOT_COLOR: Record<string, string> = {
  connected: 'bg-emerald-500',
  connecting: 'bg-amber-400',
  reconnecting: 'bg-amber-400',
  qr_required: 'bg-amber-500',
  disconnected: 'bg-red-500',
  banned: 'bg-red-600',
  paused: 'bg-gray-400 dark:bg-gray-500',
};

// Operator-friendly labels per status (English; wrap in useT at call site if needed)
const STATUS_LABEL_EN: Record<string, string> = {
  connected: 'Connected',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  qr_required: 'Needs re-scan',
  disconnected: 'Disconnected',
  banned: 'Suspended',
  paused: 'Paused',
};

const STATUS_LABEL_ID: Record<string, string> = {
  connected: 'Terhubung',
  connecting: 'Sedang terhubung…',
  reconnecting: 'Menyambung ulang…',
  qr_required: 'Perlu scan ulang',
  disconnected: 'Terputus',
  banned: 'Ditangguhkan',
  paused: 'Dijeda',
};

export function getSessionLabel(status: string, lang: 'id' | 'en' = 'id'): string {
  const map = lang === 'en' ? STATUS_LABEL_EN : STATUS_LABEL_ID;
  return map[status] ?? status;
}

export function isSessionHealthy(status: string): boolean {
  return status === 'connected';
}

export function isSessionDegraded(status: string): boolean {
  return status === 'connecting' || status === 'reconnecting';
}

export function isSessionBroken(status: string): boolean {
  return status === 'disconnected' || status === 'banned' || status === 'qr_required';
}

interface SessionStatusBadgeProps {
  status: SessionStatus;
  variant?: Variant;
  /** Override the displayed label; defaults to the built-in operator label */
  label?: string;
  lang?: 'id' | 'en';
  className?: string;
}

export function SessionStatusBadge({
  status,
  variant = 'badge',
  label,
  lang = 'id',
  className,
}: SessionStatusBadgeProps) {
  const displayLabel = label ?? getSessionLabel(status, lang);
  const tone = STATUS_TONE[status] ?? 'neutral';
  const dotColor = DOT_COLOR[status] ?? 'bg-gray-400 dark:bg-gray-500';

  if (variant === 'dot') {
    return (
      <span
        className={cn('inline-block h-2 w-2 rounded-full', dotColor, className)}
        aria-label={displayLabel}
        title={displayLabel}
      />
    );
  }

  if (variant === 'inline') {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <span className={cn('h-2 w-2 rounded-full', dotColor)} aria-hidden="true" />
        <span className="text-[12px] text-gray-700 dark:text-gray-300">{displayLabel}</span>
      </span>
    );
  }

  // badge (default)
  return (
    <Badge tone={tone} className={className}>
      {displayLabel}
    </Badge>
  );
}

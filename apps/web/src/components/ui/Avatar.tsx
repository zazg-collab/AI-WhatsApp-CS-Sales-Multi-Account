'use client';

import { useState } from 'react';
import { UsersThree } from '@/components/ui/core-essential-icons';
import { resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

function initialsFor(name: string | null | undefined, phone: string): string {
  const base = name?.trim() || phone || '?';
  return base.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

// Professional SalesOps palette — deterministic per contact so the same person
// always gets the same color across the whole app.
const PALETTES = [
  'bg-sentinel-100 text-sentinel-700 dark:bg-sentinel-900/50 dark:text-sentinel-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
];

function paletteFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(h) % PALETTES.length];
}

/**
 * Contact avatar: shows the WhatsApp profile photo when available, falling back
 * to initials (or a group glyph). Falls back to initials too if the image fails
 * to load (profile-picture URLs can expire).
 */
export function Avatar({
  name,
  phone,
  avatarUrl,
  isGroup,
  className,
  iconClassName,
}: {
  name?: string | null;
  phone: string;
  avatarUrl?: string | null;
  isGroup?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  const [broken, setBroken] = useState(false);
  const src = !isGroup && !broken ? resolveMediaUrl(avatarUrl) : null;

  const palette = paletteFor(phone || name || '?');

  if (src) {
    return (
      <span className={cn('flex shrink-0 overflow-hidden rounded-lg', className)}>
        <img src={src} alt={name ?? phone} className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg text-xs font-semibold select-none', palette, className)}>
      {isGroup
        ? <UsersThree className={cn('h-4 w-4', iconClassName)} aria-hidden="true" />
        : <span>{initialsFor(name, phone)}</span>}
    </span>
  );
}

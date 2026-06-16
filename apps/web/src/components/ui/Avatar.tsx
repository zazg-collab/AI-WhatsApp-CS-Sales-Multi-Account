'use client';

import { useState } from 'react';
import { UsersThree } from '@phosphor-icons/react';
import { resolveMediaUrl } from '@/lib/api';
import { cn } from '@/lib/cn';

function initialsFor(name: string | null | undefined, phone: string): string {
  const base = name?.trim() || phone || '?';
  return base.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
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

  const base = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    className,
  );

  if (src) {
    return (
      <span className={base}>
        <img src={src} alt={name ?? phone} className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className={base}>
      {isGroup ? <UsersThree className={cn('h-4 w-4', iconClassName)} aria-hidden="true" /> : <span>{initialsFor(name, phone)}</span>}
    </span>
  );
}

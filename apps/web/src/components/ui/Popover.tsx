'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  /** Position relative to the nearest `relative` ancestor (usually the trigger wrapper). */
  align?: 'left' | 'right';
  /** Anchor edge: open above or below the trigger. */
  side?: 'top' | 'bottom';
}

/**
 * Lightweight dropdown/menu panel: closes on outside click, Escape, and
 * scroll of the page (so it never floats away from its trigger). Pair with
 * a `relative` wrapper around the trigger button — this renders
 * absolutely-positioned within that wrapper, mirroring the Modal primitive's
 * focus/Escape handling but for transient menus instead of dialogs.
 */
export function Popover({ open, onClose, children, className, align = 'left', side = 'bottom' }: PopoverProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      className={cn(
        'absolute z-30 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900',
        side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        align === 'left' ? 'left-0' : 'right-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Tracks which single popover/menu id is open across a page, so opening one
 * auto-closes any sibling (quick replies, asset picker, header menu, bubble
 * action menu, etc.) without each call site wiring that up by hand.
 */
export function useSinglePopover<T extends string>() {
  const [openId, setOpenId] = React.useState<T | null>(null);
  const toggle = React.useCallback((id: T) => {
    setOpenId((cur) => (cur === id ? null : id));
  }, []);
  const close = React.useCallback(() => setOpenId(null), []);
  return { openId, toggle, close, isOpen: (id: T) => openId === id };
}

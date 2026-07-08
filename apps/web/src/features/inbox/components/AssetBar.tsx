'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Popover, useSinglePopover } from '@/components/ui/Popover';
import { Lightbulb, X, Folder } from '@/components/ui/core-essential-icons';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';

export interface Asset {
  id: string;
  title: string;
  kind: string;
  purpose: string;
}

export interface AssetSuggestion extends Asset {
  reason: string;
}

interface AssetBarProps {
  assets: Asset[];
  suggestions: AssetSuggestion[];
  onSendAsset?: (assetId: string) => Promise<void> | void;
  onDismiss?: (assetId: string) => void;
  disabled?: boolean;
}

/**
 * AssetBar: proactive media/asset suggestions for the open conversation plus a
 * library picker to send any active asset. Sits above the composer.
 */
export function AssetBar({ assets, suggestions, onSendAsset, onDismiss, disabled = false }: AssetBarProps) {
  const t = useT(dict);
  const { isOpen, toggle, close } = useSinglePopover<'library'>();
  const [sendingId, setSendingId] = useState<string | null>(null);

  const send = async (id: string) => {
    setSendingId(id);
    try {
      await onSendAsset?.(id);
    } finally {
      setSendingId(null);
      close();
    }
  };

  if (assets.length === 0 && suggestions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-t border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-900/60">
      {/* Suggestions */}
      <div className="scrollbar-thin flex flex-1 items-center gap-2 overflow-x-auto">
        {suggestions.length === 0 ? (
          <span className="text-xs text-gray-400">{t('noAssetSuggestions')}</span>
        ) : (
          suggestions.map((s) => (
            <div
              key={s.id}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-hermes-200 bg-white py-1 pl-2.5 pr-1 text-xs dark:border-hermes-900/30 dark:bg-gray-800"
              title={s.reason}
            >
              <span className="flex items-center gap-1 font-medium text-gray-800 dark:text-gray-100">
                <Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{s.title}
              </span>
              <button
                onClick={() => send(s.id)}
                disabled={disabled || sendingId === s.id}
                className="rounded-full bg-hermes-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-hermes-700 disabled:opacity-50"
              >
                {sendingId === s.id ? '…' : t('send')}
              </button>
              <button
                onClick={() => onDismiss?.(s.id)}
                disabled={disabled}
                aria-label={t('ariaDismissSuggestion')}
                className="px-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Library picker */}
      {assets.length > 0 && (
        <div className="relative shrink-0">
          <Button variant="ghost" size="sm" disabled={disabled} onClick={() => toggle('library')} className="flex items-center gap-1">
            <Folder className="h-3.5 w-3.5" aria-hidden="true" />Library
          </Button>
          <Popover open={isOpen('library')} onClose={() => close()} align="right" side="top">
            <div className="max-h-72 w-64 space-y-0.5 overflow-y-auto p-1.5">
              {assets.map((a) => (
                <button
                  key={a.id}
                  onClick={() => send(a.id)}
                  disabled={disabled || sendingId === a.id}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 disabled:opacity-50 dark:hover:bg-gray-700"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-800 dark:text-gray-100">{a.title}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{a.kind} · {a.purpose}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-hermes-600">{sendingId === a.id ? '…' : 'Send'}</span>
                </button>
              ))}
            </div>
          </Popover>
        </div>
      )}
    </div>
  );
}

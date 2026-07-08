'use client';

import { useState, useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import { api } from '@/lib/api';
import type { ConvDetail } from '../inbox.types';

const LABEL_COLORS = [
  '#ff6b6b','#ffa94d','#ffd43b','#69db7c','#74c0fc','#da77f2',
  '#f783ac','#a9e34b','#4dabf7','#748ffc','#e599f7','#63e6be',
  '#ff8787','#ffc078','#8ce99a','#74c0fc','#91a7ff','#f783ac',
  '#66d9e8','#a9e34b',
];
const labelColor = (n: number) => LABEL_COLORS[n % LABEL_COLORS.length];

interface WaLabel { id: string; name: string; color: number; }

interface ConversationLabelsProps {
  conversation: ConvDetail;
  /** legacy free-text labels callback — kept for compat but unused by this component */
  onSaveLabels?: (labels: string[]) => Promise<void>;
  loading?: boolean;
}

/**
 * ConversationLabels: WhatsApp API label chips for the active conversation.
 * Fetches available labels from GET /wa/accounts/:id/labels, lets the user
 * add/remove them via POST/DELETE /wa/accounts/:id/chats/:phone/labels/:labelId.
 */
export function ConversationLabels({ conversation, loading = false }: ConversationLabelsProps) {
  const t = useT(dict);
  const accountId = conversation.whatsappAccount.id;
  const phone = conversation.customer.phoneNumber.replace(/\D/g, '');

  const [availableLabels, setAvailableLabels] = useState<WaLabel[]>([]);
  const [appliedLabels, setAppliedLabels] = useState<WaLabel[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch available labels when account changes
  useEffect(() => {
    if (!accountId) return;
    api<WaLabel[]>(`/wa/accounts/${accountId}/labels`)
      .then(setAvailableLabels)
      .catch(() => setAvailableLabels([]));
  }, [accountId]);

  // Reset applied labels when conversation changes
  useEffect(() => {
    setAppliedLabels([]);
    setError(null);
  }, [conversation.id]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  const unapplied = availableLabels.filter(
    (l) => !appliedLabels.some((a) => a.id === l.id),
  );

  const addLabel = async (label: WaLabel) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/wa/accounts/${accountId}/chats/${phone}/labels/${label.id}`, {
        method: 'POST',
      });
      setAppliedLabels((prev) => [...prev, label]);
      setDropdownOpen(false);
    } catch {
      setError('Failed to add label');
    } finally {
      setBusy(false);
    }
  };

  const removeLabel = async (label: WaLabel) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/wa/accounts/${accountId}/chats/${phone}/labels/${label.id}`, {
        method: 'DELETE',
      });
      setAppliedLabels((prev) => prev.filter((l) => l.id !== label.id));
    } catch {
      setError('Failed to remove label');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Labels</h3>
      </div>

      {/* Applied label chips */}
      <div className="flex flex-wrap gap-1 mb-2">
        {appliedLabels.length === 0 && (
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('noLabels')}</p>
        )}
        {appliedLabels.map((label) => {
          const bg = labelColor(label.color);
          return (
            <span
              key={label.id}
              className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium text-gray-900"
              style={{ backgroundColor: bg + '33', border: `1px solid ${bg}` }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: bg }}
                aria-hidden="true"
              />
              {label.name}
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => removeLabel(label)}
                className="ml-0.5 rounded-full hover:bg-black/10 disabled:opacity-40"
                aria-label={`Remove label ${label.name}`}
              >
                <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                  <path d="M6.4 5 9 2.4 7.6 1 5 3.6 2.4 1 1 2.4 3.6 5 1 7.6 2.4 9 5 6.4 7.6 9 9 7.6z" />
                </svg>
              </button>
            </span>
          );
        })}
      </div>

      {/* Add label dropdown */}
      {availableLabels.length > 0 && (
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            disabled={busy || loading || unapplied.length === 0}
            onClick={() => setDropdownOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
              <path d="M5.75 1.25h-1.5v3h-3v1.5h3v3h1.5v-3h3v-1.5h-3z" />
            </svg>
            Add label
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
              <ul className="py-1 max-h-48 overflow-y-auto">
                {unapplied.map((label) => {
                  const bg = labelColor(label.color);
                  return (
                    <li key={label.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => addLabel(label)}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: bg }}
                          aria-hidden="true"
                        />
                        {label.name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

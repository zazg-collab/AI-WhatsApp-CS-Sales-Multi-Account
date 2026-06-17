'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export interface FollowUp {
  id: string;
  scheduledAt: string;
  messageTemplate: string | null;
  status: string;
}

interface FollowUpsProps {
  followUps: FollowUp[];
  onSchedule?: (scheduledAt: string, message: string) => Promise<void>;
  onCancel?: (id: string) => Promise<void>;
  loading?: boolean;
}

/**
 * FollowUps: list scheduled follow-up messages for the conversation and
 * schedule a new one (date-time + message).
 */
export function FollowUps({ followUps, onSchedule, onCancel, loading = false }: FollowUpsProps) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSchedule = async () => {
    if (!when || !message.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSchedule?.(new Date(when).toISOString(), message.trim());
      setWhen('');
      setMessage('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Follow-ups</h3>
        {onSchedule && !open && (
          <button
            onClick={() => setOpen(true)}
            className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            + Schedule
          </button>
        )}
      </div>

      {followUps.length === 0 && !open && (
        <p className="text-xs text-gray-500 dark:text-gray-400">No scheduled follow-ups</p>
      )}

      <ul className="space-y-1.5">
        {followUps.map((f) => (
          <li
            key={f.id}
            className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-800/50"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-gray-700 dark:text-gray-200">
                {new Date(f.scheduledAt).toLocaleString()}
                <span className="ml-1 text-gray-400">· {f.status}</span>
              </p>
              {f.messageTemplate && (
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{f.messageTemplate}</p>
              )}
            </div>
            {onCancel && f.status === 'pending' && (
              <button
                onClick={() => onCancel(f.id)}
                disabled={loading}
                className="shrink-0 text-[11px] text-danger-600 hover:underline dark:text-danger-400"
              >
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>

      {open && (
        <div className="mt-2 space-y-2">
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            disabled={saving}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={saving}
            rows={2}
            placeholder="Follow-up message…"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          {error && <p className="text-[11px] text-danger-600 dark:text-danger-400">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={saving || !when || !message.trim()} onClick={handleSchedule}>
              {saving ? '⏳' : '✓'} Schedule
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" disabled={saving} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

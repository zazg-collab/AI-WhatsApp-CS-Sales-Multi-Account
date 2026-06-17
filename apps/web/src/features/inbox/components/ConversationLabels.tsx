'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ConvDetail } from '../inbox.types';

interface ConversationLabelsProps {
  conversation: ConvDetail;
  onSaveLabels?: (labels: string[]) => Promise<void>;
  loading?: boolean;
}

/**
 * ConversationLabels: view + edit the free-form labels attached to a
 * conversation (priority, renewal, invoice, …). Comma-separated input.
 */
export function ConversationLabels({ conversation, onSaveLabels, loading = false }: ConversationLabelsProps) {
  const labels = conversation.labels ?? [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(labels.join(', '));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsed = draft.split(',').map((l) => l.trim()).filter(Boolean);
      await onSaveLabels?.(parsed);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">Labels</h3>
        {!editing && onSaveLabels && (
          <button
            onClick={() => { setDraft(labels.join(', ')); setEditing(true); }}
            className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        labels.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {labels.map((label) => (
              <Badge key={label} tone="neutral" className="text-[10px]">{label}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">No labels</p>
        )
      ) : (
        <div className="space-y-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving || loading}
            placeholder="priority, renewal, invoice"
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" disabled={saving || loading} onClick={handleSave}>
              {saving ? '⏳' : '✓'} Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={saving}
              onClick={() => { setEditing(false); setDraft(labels.join(', ')); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

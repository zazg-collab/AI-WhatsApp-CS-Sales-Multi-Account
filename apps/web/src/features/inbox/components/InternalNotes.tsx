'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ConvDetail } from '../inbox.types';

interface InternalNotesProps {
  conversation: ConvDetail;
  onUpdateNotes?: (notes: string) => Promise<void>;
  loading?: boolean;
}

export function InternalNotes({
  conversation,
  onUpdateNotes,
  loading = false,
}: InternalNotesProps) {
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState(conversation.customer.notes || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdateNotes?.(draftNotes);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          Internal Notes
        </h3>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Edit
          </button>
        )}
      </div>

      {!editing ? (
        <p className="text-xs text-gray-700 dark:text-gray-300">
          {draftNotes || 'No notes yet'}
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            disabled={saving}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder="Add internal notes..."
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={saving}
              onClick={handleSave}
              className="flex-1"
            >
              {saving ? '⏳' : '✓'} Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setDraftNotes(conversation.customer.notes || '');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

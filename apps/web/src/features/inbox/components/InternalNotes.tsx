'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Check, CircleNotch } from '@/components/ui/core-essential-icons';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
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
  const t = useT(dict);
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState(conversation.customer.notes || '');
  const [saving, setSaving] = useState(false);

  const busy = saving || loading;

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
            disabled={busy}
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            placeholder={t('addInternalNotesPlaceholder')}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={handleSave}
              className="flex flex-1 items-center justify-center gap-1"
            >
              {saving ? <CircleNotch className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />} Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
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

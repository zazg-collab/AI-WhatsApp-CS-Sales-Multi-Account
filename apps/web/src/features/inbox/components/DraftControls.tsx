'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import type { Message } from '../inbox.types';

interface DraftControlsProps {
  draftMessage: Message | null;
  approving?: boolean;
  blocking?: boolean;
  onApprove?: () => Promise<void>;
  onBlock?: () => Promise<void>;
  onEdit?: () => void;
}

export function DraftControls({
  draftMessage,
  approving = false,
  blocking = false,
  onApprove,
  onBlock,
  onEdit,
}: DraftControlsProps) {
  const [showReasoning, setShowReasoning] = useState(false);

  if (!draftMessage || !draftMessage.aiGenerated) {
    return null;
  }

  return (
    <div className="border-b border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/30 dark:bg-yellow-900/20">
      <div className="mb-3 flex items-center justify-between">
        <Badge tone="review" className="text-xs">
          AI Draft — requires approval
        </Badge>
        <button
          onClick={() => setShowReasoning(!showReasoning)}
          className="text-xs text-yellow-700 hover:text-yellow-800 dark:text-yellow-300 dark:hover:text-yellow-200"
        >
          {showReasoning ? '▼ Hide' : '▶ View'} reasoning
        </button>
      </div>

      {/* Draft text */}
      <div className="mb-3 rounded-lg border border-yellow-200 bg-white p-2.5 dark:border-yellow-900/30 dark:bg-gray-900">
        <p className="text-sm text-gray-800 dark:text-gray-200">
          {draftMessage.content}
        </p>
      </div>

      {/* Reasoning (expandable) */}
      {showReasoning && draftMessage.quotedMessage && (
        <div className="mb-3 text-xs text-yellow-700 dark:text-yellow-300">
          <p className="font-medium">Based on: {draftMessage.quotedMessage.content}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={approving || blocking}
          onClick={onApprove}
          className="flex-1 whitespace-nowrap"
        >
          {approving ? '⏳' : '✓'} Approve
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={approving || blocking}
          onClick={onEdit}
          className="flex-1 whitespace-nowrap"
        >
          ✎ Edit
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={approving || blocking}
          onClick={onBlock}
          className="flex-1 whitespace-nowrap"
        >
          {blocking ? '⏳' : '✕'} Block
        </Button>
      </div>
    </div>
  );
}

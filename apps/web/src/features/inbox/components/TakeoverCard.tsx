'use client';

import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { FilmSlate, ArrowUUpLeft } from '@/components/ui/core-essential-icons';
import type { ConvDetail } from '../inbox.types';

interface TakeoverCardProps {
  conversation: ConvDetail;
  onRelease?: () => Promise<void>;
  loading?: boolean;
}

export function TakeoverCard({ conversation, onRelease, loading = false }: TakeoverCardProps) {
  if (conversation.takeoverStatus !== 'admin_takeover') {
    return null;
  }

  const admin = conversation.assignedAdmin;

  return (
    <div className="border-b border-orange-200 bg-orange-50 p-4 dark:border-orange-900/30 dark:bg-orange-900/20">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-orange-700 dark:text-orange-400">
          <FilmSlate className="h-3.5 w-3.5" aria-hidden="true" />
          Admin Takeover
        </span>
      </div>

      {admin && (
        <div className="mb-3 flex items-center gap-2">
          <Avatar
            name={admin.name}
            phone={admin.id}
            className="h-8 w-8"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {admin.name}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Currently replying manually
            </p>
          </div>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={onRelease}
        disabled={loading}
        className="flex w-full items-center justify-center gap-1"
      >
        <ArrowUUpLeft className="h-3.5 w-3.5" aria-hidden="true" /> Return to AI
      </Button>
    </div>
  );
}

'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import type { ConvDetail } from '../inbox.types';

interface ChatThreadHeaderProps {
  conversation: ConvDetail;
  onBack?: () => void;
  onShowDetails?: () => void;
}

export function ChatThreadHeader({
  conversation,
  onBack,
  onShowDetails,
}: ChatThreadHeaderProps) {
  const customer = conversation.customer;
  const isOnline = conversation.whatsappAccount?.sessionStatus === 'connected';

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="md:hidden"
            aria-label="Back to list"
          >
            ←
          </Button>
        )}

        <Avatar
          name={customer.name}
          phone={customer.phoneNumber}
          avatarUrl={customer.avatarUrl}
          className="h-10 w-10"
        />

        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
            {customer.name || 'No name'}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span className={cn('h-2 w-2 rounded-full', isOnline ? 'bg-green-500' : 'bg-gray-400')} />
            {isOnline ? 'Online' : 'Offline'}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled aria-label="Call" title="Coming soon">
          ☎️
        </Button>
        <Button variant="ghost" size="sm" disabled aria-label="Video call" title="Coming soon">
          📹
        </Button>
        {onShowDetails && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowDetails}
            aria-label="Show conversation details"
          >
            ℹ️
          </Button>
        )}
      </div>
    </div>
  );
}

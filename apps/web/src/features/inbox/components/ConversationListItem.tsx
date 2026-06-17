'use client';

import { Badge } from '@/components/ui/Badge';
import { StatusLabel, type StatusKind } from '@/components/ui/StatusLabel';
import { Avatar } from '@/components/ui/Avatar';
import { WhatsAppMark } from '@/components/WhatsAppMark';
import { cn } from '@/lib/cn';
import { contactDisplayName } from '@/lib/contact';
import { useT, type Dict } from '@/lib/i18n';
import type { ConvSummary } from '../inbox.types';

const dict: Dict = {
  noMessagesYet: { id: 'Belum ada pesan', en: 'No messages yet' },
  hiddenContact: { id: 'Kontak tersembunyi', en: 'Hidden contact' },
};

interface ConversationListItemProps {
  conversation: ConvSummary;
  isActive: boolean;
  onClick: () => void;
}

export function ConversationListItem({
  conversation: c,
  isActive,
  onClick,
}: ConversationListItemProps) {
  const t = useT(dict);
  const name = c.isGroup
    ? c.groupSubject || c.customer.name || c.customer.phoneNumber
    : contactDisplayName(c.customer.name, c.customer.phoneNumber, t('hiddenContact'));

  const status: StatusKind = (() => {
    if (c.aiMode === 'ai_paused') return 'sending-blocked';
    if (c.takeoverStatus === 'admin_takeover') return 'human-takeover';
    if (c.takeoverStatus === 'waiting_admin') return 'needs-review';
    if (c.aiMode === 'ai_on' || c.aiMode === 'ai_supervised') return 'ai-generated';
    return 'sent';
  })();

  const relTime = (isoDate: string | null | undefined): string => {
    if (!isoDate) return '';
    const date = new Date(isoDate);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  return (
    <li className="relative">
      {isActive && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-hermes-500"
          aria-hidden="true"
        />
      )}
      <button
        onClick={onClick}
        className={cn(
          'flex w-full gap-3 border-b border-gray-100 px-3 py-3 text-left transition-colors dark:border-gray-800',
          isActive
            ? 'bg-hermes-50 dark:bg-hermes-900/20'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
        )}
      >
        <span className="relative shrink-0">
          <Avatar
            name={c.customer.name}
            phone={c.customer.phoneNumber}
            avatarUrl={c.customer.avatarUrl}
            isGroup={c.isGroup}
            className="h-10 w-10 text-[13px] font-semibold"
          />
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-white bg-channel-500 text-white dark:border-gray-900"
            title="WhatsApp"
            aria-label="WhatsApp channel"
          >
            <WhatsAppMark className="h-2.5 w-2.5" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
              {name}
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-gray-400">
              {relTime(c.lastMessageAt)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
            {c.lastMessage ?? t('noMessagesYet')}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <StatusLabel kind={status} />
            {c.isGroup && <Badge tone="neutral">Group</Badge>}
            {!!c.unreadCount && c.unreadCount > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-hermes-600 px-1 text-[10px] font-semibold text-white">
                {c.unreadCount}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
  );
}

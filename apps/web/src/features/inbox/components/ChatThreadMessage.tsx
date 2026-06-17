'use client';

import { useRef, useState } from 'react';
import { useT, type Dict } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { MediaContent } from './MediaContent';
import { StatusTick } from './StatusTick';
import type { Message } from '../inbox.types';

const dict: Dict = {
  edited: { id: '(disunting)', en: '(edited)' },
  deletedMessage: { id: '[Pesan dihapus]', en: '[Message deleted]' },
  quotedMessage: { id: 'Membalas:', en: 'Replying to:' },
};

interface ChatThreadMessageProps {
  message: Message;
  isCustomer: boolean;
  hoveredId: string | null;
  onHoverEnter: (id: string) => void;
  onHoverExit: () => void;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onStar?: (starred: boolean) => void;
}

export function ChatThreadMessage({
  message: m,
  isCustomer,
  hoveredId,
  onHoverEnter,
  onHoverExit,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onStar,
}: ChatThreadMessageProps) {
  const t = useT(dict);
  const [showReactions, setShowReactions] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const isDeleted = m.deletedAt !== null && m.deletedAt !== undefined;
  const isEdited = m.editedAt && m.editedAt !== m.createdAt;

  return (
    <div
      key={m.id}
      className={cn(
        'group relative flex gap-3 px-2 py-1.5',
        isCustomer ? 'flex-row' : 'flex-row-reverse',
      )}
      onMouseEnter={() => onHoverEnter(m.id)}
      onMouseLeave={onHoverExit}
    >
      {/* Actions menu (hover) */}
      {hoveredId === m.id && !isCustomer && (
        <div className={cn('absolute top-0.5 flex items-center gap-1', isCustomer ? 'right-0' : 'left-0')}>
          {/* Action buttons would go here — kept minimal for this component */}
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          'relative max-w-xs rounded-lg px-3 py-2 text-sm break-words lg:max-w-md 2xl:max-w-xl',
          isCustomer
            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'
            : 'bg-hermes-50 text-gray-900 dark:bg-hermes-900/30 dark:text-gray-100',
        )}
      >
        {/* Quoted message preview */}
        {m.quotedMessage && (
          <div className="mb-2 border-l-2 border-gray-300 pl-2 text-xs italic text-gray-600 dark:text-gray-400">
            <div>{t('quotedMessage')}</div>
            <div className="mt-0.5 line-clamp-2">{m.quotedMessage.content || `[${m.quotedMessage.messageType}]`}</div>
          </div>
        )}

        {/* Message content */}
        {isDeleted ? (
          <p className="italic opacity-60">{t('deletedMessage')}</p>
        ) : (
          <MediaContent message={m} />
        )}

        {/* Edited indicator */}
        {isEdited && !isDeleted && (
          <p className="mt-1 text-xs italic opacity-70">{t('edited')}</p>
        )}

        {/* Delivery status tick (admin messages only) */}
        {!isCustomer && (
          <div className="mt-1 flex items-center justify-end gap-1">
            <span className="text-[11px] text-gray-500">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            <StatusTick status={m.status} />
          </div>
        )}
      </div>

      {/* Reactions display */}
      {m.reactions && Object.keys(m.reactions).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {Object.entries(m.reactions).map(([emoji, users]) => (
            <button
              key={emoji}
              onClick={() => onReact?.(emoji)}
              className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
              title={users.join(', ')}
            >
              {emoji}
              <span className="text-[11px]">{users.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tooltip for failed messages */}
      {m.status === 'failed' && (
        <div
          ref={tooltipRef}
          className={cn(
            'absolute top-full mt-1 rounded-lg border bg-white px-2 py-1 text-[11px] shadow-lg dark:border-gray-700 dark:bg-gray-800 z-50',
            isCustomer ? 'left-0' : 'right-0',
            'w-48 text-danger-600',
          )}
        >
          Failed to send. Retry or delete.
        </div>
      )}
    </div>
  );
}

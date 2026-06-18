'use client';

import { useRef, useState } from 'react';
import {
  ArrowBendUpLeft,
  PencilSimple,
  Trash,
  Star,
  Smiley,
} from '@phosphor-icons/react';
import { useT, type Dict } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { Popover } from '@/components/ui/Popover';
import { MediaContent } from './MediaContent';
import { StatusTick } from './StatusTick';
import type { Message } from '../inbox.types';

const dict: Dict = {
  edited: { id: '(disunting)', en: '(edited)' },
  deletedMessage: { id: '[Pesan dihapus]', en: '[Message deleted]' },
  quotedMessage: { id: 'Membalas:', en: 'Replying to:' },
  reply: { id: 'Balas', en: 'Reply' },
  react: { id: 'Beri reaksi', en: 'React' },
  star: { id: 'Bintangi', en: 'Star' },
  unstar: { id: 'Hapus bintang', en: 'Unstar' },
  edit: { id: 'Edit', en: 'Edit' },
  retract: { id: 'Tarik pesan', en: 'Retract' },
};

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

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
  const canModify = !isCustomer && !isDeleted; // can edit/retract own (admin/ai) messages
  const showActions = hoveredId === m.id && !isDeleted;

  const actionBtn =
    'flex h-7 w-7 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-100';

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
      {/* Actions toolbar (hover) */}
      {showActions && (
        <div
          className={cn(
            'absolute -top-3 z-10 flex items-center gap-1',
            isCustomer ? 'left-2' : 'right-2',
          )}
        >
          <div className="relative">
            <button
              type="button"
              className={actionBtn}
              onClick={() => setShowReactions((v) => !v)}
              aria-label={t('react')}
              title={t('react')}
            >
              <Smiley className="h-4 w-4" aria-hidden="true" />
            </button>
            <Popover
              open={showReactions}
              onClose={() => setShowReactions(false)}
              align={isCustomer ? 'left' : 'right'}
              side="top"
            >
              <div className="flex gap-1 p-1.5">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onReact?.(emoji);
                      setShowReactions(false);
                    }}
                    className="rounded-full px-1.5 py-0.5 text-lg transition-transform hover:scale-125"
                    aria-label={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </Popover>
          </div>

          {onReply && (
            <button type="button" className={actionBtn} onClick={onReply} aria-label={t('reply')} title={t('reply')}>
              <ArrowBendUpLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {onStar && (
            <button
              type="button"
              className={actionBtn}
              onClick={() => onStar(!m.isStarred)}
              aria-label={m.isStarred ? t('unstar') : t('star')}
              title={m.isStarred ? t('unstar') : t('star')}
            >
              <Star className={cn('h-4 w-4', m.isStarred && 'fill-amber-400 text-amber-400')} aria-hidden="true" />
            </button>
          )}

          {canModify && onEdit && (
            <button type="button" className={actionBtn} onClick={onEdit} aria-label={t('edit')} title={t('edit')}>
              <PencilSimple className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          {canModify && onDelete && (
            <button
              type="button"
              className={cn(actionBtn, 'hover:text-danger-600')}
              onClick={onDelete}
              aria-label={t('retract')}
              title={t('retract')}
            >
              <Trash className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Message bubble */}
      <div
        className={cn(
          'relative max-w-[80%] min-w-0 rounded-lg px-3 py-2 text-sm break-words lg:max-w-md 2xl:max-w-xl',
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

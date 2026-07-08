'use client';

import { memo, useRef, useState } from 'react';
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  PencilSimple,
  Trash,
  Star,
  Smiley,
} from '@/components/ui/core-essential-icons';
import { useT, type Dict } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { Popover } from '@/components/ui/Popover';
import { Avatar } from '@/components/ui/Avatar';
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
  forward: { id: 'Teruskan', en: 'Forward' },
  forwardTo: { id: 'Teruskan ke nomor', en: 'Forward to number' },
  forwardPlaceholder: { id: 'Nomor tujuan, mis. 628123…', en: 'Target number, e.g. 628123…' },
  forwardSend: { id: 'Teruskan', en: 'Forward' },
  forwardSending: { id: 'Mengirim…', en: 'Sending…' },
  forwardError: { id: 'Gagal meneruskan. Periksa nomor & koneksi akun.', en: 'Forward failed. Check the number & account connection.' },
  forwardInvalid: { id: 'Masukkan nomor yang valid (mis. 628123456789).', en: 'Enter a valid number (e.g. 628123456789).' },
  edit: { id: 'Edit', en: 'Edit' },
  retract: { id: 'Tarik pesan', en: 'Retract' },
  draftBadge: { id: 'Draft', en: 'Draft' },
  draftNotSent: { id: 'Belum terkirim — menunggu persetujuan', en: 'Not sent yet — awaiting approval' },
};

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface ChatThreadMessageProps {
  message: Message;
  isCustomer: boolean;
  isGroup?: boolean;
  hoveredId: string | null;
  onHoverEnter: (id: string) => void;
  onHoverExit: () => void;
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onStar?: (starred: boolean) => void;
  onForward?: (toPhone: string) => Promise<boolean>;
  onJumpToMessage?: (messageId: string) => void;
}

// Stable color per sender name so each group member gets a consistent hue
const GROUP_COLORS = [
  'text-pink-600','text-purple-600','text-blue-600','text-teal-600',
  'text-orange-600','text-rose-600','text-indigo-600','text-cyan-600',
];
function senderColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
}

function ChatThreadMessageImpl({
  message: m,
  isCustomer,
  isGroup = false,
  hoveredId,
  onHoverEnter,
  onHoverExit,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onStar,
  onForward,
  onJumpToMessage,
}: ChatThreadMessageProps) {
  const t = useT(dict);
  const [showReactions, setShowReactions] = useState(false);
  const [showForward, setShowForward] = useState(false);
  const [forwardPhone, setForwardPhone] = useState('');
  const [forwardState, setForwardState] = useState<'idle' | 'sending' | 'error'>('idle');
  const tooltipRef = useRef<HTMLDivElement>(null);

  const isDeleted = m.deletedAt !== null && m.deletedAt !== undefined;
  const isEdited = m.editedAt && m.editedAt !== m.createdAt;
  // An unsent AI reply held for approval — render it distinctly so it is never
  // mistaken for a message already delivered to the customer.
  const isDraft = !isCustomer && m.aiGenerated && m.status === 'pending';
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
      {/* Small per-sender avatar on incoming group messages, like WhatsApp */}
      {isGroup && isCustomer && (
        <Avatar
          name={m.senderName}
          phone={m.senderName || m.id}
          className="h-6 w-6 self-end rounded-full text-[10px] font-semibold"
        />
      )}

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

          {onForward && (
            <div className="relative">
              <button
                type="button"
                className={actionBtn}
                onClick={() => setShowForward((v) => !v)}
                aria-label={t('forward')}
                title={t('forward')}
              >
                <ArrowBendUpRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <Popover
                open={showForward}
                onClose={() => { setShowForward(false); setForwardState('idle'); }}
                align={isCustomer ? 'left' : 'right'}
                side="top"
              >
                <form
                  className="flex flex-col gap-2 p-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (forwardState === 'sending') return;
                    // Mirror the server guard (normalizePhone collapses non-digits):
                    // a WA number is well over 8 digits, so reject short/garbage input.
                    const digits = forwardPhone.replace(/\D/g, '');
                    if (digits.length < 8) { setForwardState('error'); return; }
                    setForwardState('sending');
                    // The forwarded message lands in a different conversation, so the
                    // current timeline won't reflect it — await the result and only
                    // close on success; keep the popover open with an error otherwise.
                    const ok = await onForward(digits);
                    if (ok) {
                      setForwardPhone('');
                      setForwardState('idle');
                      setShowForward(false);
                    } else {
                      setForwardState('error');
                    }
                  }}
                >
                  <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{t('forwardTo')}</label>
                  <input
                    type="tel"
                    value={forwardPhone}
                    onChange={(e) => { setForwardPhone(e.target.value); if (forwardState === 'error') setForwardState('idle'); }}
                    placeholder={t('forwardPlaceholder')}
                    className="w-52 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-sentinel-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                  />
                  {forwardState === 'error' && (
                    <p className="text-[11px] text-danger-600 dark:text-danger-400" role="alert">
                      {forwardPhone.replace(/\D/g, '').length < 8 ? t('forwardInvalid') : t('forwardError')}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={!forwardPhone.trim() || forwardState === 'sending'}
                    className="rounded-md bg-sentinel-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sentinel-700 disabled:opacity-50"
                  >
                    {forwardState === 'sending' ? t('forwardSending') : t('forwardSend')}
                  </button>
                </form>
              </Popover>
            </div>
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
          isDraft
            ? 'border border-dashed border-yellow-400 bg-yellow-50 text-gray-900 dark:border-yellow-500/50 dark:bg-yellow-900/20 dark:text-gray-100'
            : isCustomer
              ? 'rounded-tl-none bg-white text-gray-900 shadow-sm dark:bg-[#202c33] dark:text-gray-100'
              : 'rounded-tr-none bg-[#d9fdd3] text-gray-900 shadow-sm dark:bg-[#005c4b] dark:text-gray-100',
        )}
      >
        {/* WA-style bubble tail — small notch on the corner nearest the sender */}
        {!isDraft && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-0 h-2.5 w-2.5',
              isCustomer
                ? "-left-[5px] bg-white [clip-path:polygon(100%_0,100%_100%,0_0)] dark:bg-[#202c33]"
                : "-right-[5px] bg-[#d9fdd3] [clip-path:polygon(0_0,0_100%,100%_0)] dark:bg-[#005c4b]",
            )}
          />
        )}

        {/* Group sender name inside the bubble (like WhatsApp) */}
        {isGroup && isCustomer && m.senderName && (
          <span className={cn('mb-0.5 block text-[12px] font-semibold', senderColor(m.senderName))}>
            {m.senderName}
          </span>
        )}

        {/* Draft badge — this reply has not been sent yet */}
        {isDraft && (
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="rounded bg-yellow-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-800 dark:bg-yellow-500/30 dark:text-yellow-200">
              {t('draftBadge')}
            </span>
            <span className="text-[10px] text-yellow-700 dark:text-yellow-300">{t('draftNotSent')}</span>
          </div>
        )}

        {/* Quoted message preview — tap to jump to the original, like WhatsApp */}
        {m.quotedMessage && (
          <button
            type="button"
            onClick={() => onJumpToMessage?.(m.quotedMessage!.id)}
            className="mb-2 block w-full border-l-2 border-gray-300 pl-2 text-left text-xs italic text-gray-600 hover:opacity-80 dark:text-gray-400"
          >
            <div>{t('quotedMessage')}</div>
            <div className="mt-0.5 line-clamp-2">{m.quotedMessage.content || `[${m.quotedMessage.messageType}]`}</div>
          </button>
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

        {/* Timestamp + delivery tick row — always shown, tick only for outbound */}
        {!isDraft && (
          <div className={`mt-1 flex items-center gap-1 ${isCustomer ? 'justify-start' : 'justify-end'}`}>
            <span className="text-[11px] text-gray-400 dark:text-gray-500">
              {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {!isCustomer && <StatusTick status={m.status} />}
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

// hoveredId changes on every mouse move across the timeline; without this custom
// comparator, every bubble would re-render on every hover transition even though
// only the previously-hovered and newly-hovered row's appearance actually changes.
export const ChatThreadMessage = memo(ChatThreadMessageImpl, (prev, next) => {
  if (prev.message !== next.message) return false;
  if (prev.isCustomer !== next.isCustomer) return false;
  if (prev.onHoverEnter !== next.onHoverEnter) return false;
  if (prev.onHoverExit !== next.onHoverExit) return false;
  if (prev.onReact !== next.onReact) return false;
  if (prev.onReply !== next.onReply) return false;
  if (prev.onEdit !== next.onEdit) return false;
  if (prev.onDelete !== next.onDelete) return false;
  if (prev.onStar !== next.onStar) return false;
  if (prev.onForward !== next.onForward) return false;
  const wasHovered = prev.hoveredId === prev.message.id;
  const isHovered = next.hoveredId === next.message.id;
  return wasHovered === isHovered;
});

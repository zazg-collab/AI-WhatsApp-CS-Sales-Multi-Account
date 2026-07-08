'use client';

import React from 'react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChatThreadMessage } from './ChatThreadMessage';
import { ChatThreadHeader, type ConversationActions } from './ChatThreadHeader';
import { ChatComposer } from './ChatComposer';
import { AssetBar, type Asset, type AssetSuggestion } from './AssetBar';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import type { ConvDetail, Message } from '../inbox.types';

interface RowCallbacks {
  onHoverEnter: () => void;
  onHoverExit: () => void;
  onReact?: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete?: () => void;
  onStar: () => void;
  onForward?: (toPhone: string) => Promise<boolean>;
}

interface ChatThreadProps {
  conversation: ConvDetail | null;
  loading?: boolean;
  composerValue?: string;
  quoteMessage?: Message | null;
  editingMessage?: Message | null;
  onSendMessage?: (text: string) => Promise<void>;
  onComposerChange?: (value: string) => void;
  onReactMessage?: (messageId: string, emoji: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onBack?: () => void;
  onShowDetails?: () => void;
  conversationActions?: ConversationActions;
  customerTyping?: boolean;
  onClearQuote?: () => void;
  onClearEdit?: () => void;
  onUploadFile?: (file: File) => Promise<void>;
  onSendLocation?: (raw: string) => void;
  onSendPoll?: (raw: string) => void;
  onSendContacts?: (raw: string) => void;
  quickReplies?: Array<{ id: string; title: string; content: string; shortcut: string | null }>;
  onApplyQuickReply?: (content: string) => void;
  sendError?: string | null;
  assets?: Asset[];
  assetSuggestions?: AssetSuggestion[];
  onSendAsset?: (assetId: string) => Promise<void> | void;
  onDismissAsset?: (assetId: string) => void;
  hoveredMessageId?: string | null;
  onHoverMessageEnter?: (messageId: string) => void;
  onHoverMessageExit?: () => void;
  onReplyToMessage?: (message: Message) => void;
  onEditMessage?: (message: Message) => void;
  onStarMessage?: (messageId: string, star: boolean) => Promise<void>;
  onForwardMessage?: (messageId: string, toPhone: string) => Promise<boolean>;
  msgSearch?: string;
  msgSearchResults?: Message[];
  msgSearching?: boolean;
  onSearchMessages?: (q: string) => void;
  hasMoreMessages?: boolean;
  loadingOlderMessages?: boolean;
  onLoadOlderMessages?: () => void;
}

/**
 * ChatThread: Renders the conversation's message timeline and composer.
 *
 * Responsibilities:
 * - Message bubble rendering (via ChatThreadMessage)
 * - Timeline scrolling (auto-scroll to latest)
 * - Composer UI (via ChatComposer)
 * - Message actions (react, edit, delete, quote, star)
 *
 * The inbox/page.tsx handles:
 * - State management (composerValue, quoteMessage, etc.)
 * - API calls (send, edit, delete, react)
 * - High-level message actions (approve draft, takeover, etc.)
 */
export function ChatThread({
  conversation,
  loading,
  composerValue = '',
  quoteMessage,
  editingMessage,
  onSendMessage,
  onComposerChange,
  onReactMessage,
  onDeleteMessage,
  onBack,
  onShowDetails,
  conversationActions,
  customerTyping,
  onClearQuote,
  onClearEdit,
  onUploadFile,
  onSendLocation,
  onSendPoll,
  onSendContacts,
  quickReplies,
  onApplyQuickReply,
  sendError,
  assets = [],
  assetSuggestions = [],
  onSendAsset,
  onDismissAsset,
  hoveredMessageId,
  onHoverMessageEnter,
  onHoverMessageExit,
  onReplyToMessage,
  onEditMessage,
  onStarMessage,
  onForwardMessage,
  msgSearch = '',
  msgSearchResults = [],
  msgSearching,
  onSearchMessages,
  hasMoreMessages,
  loadingOlderMessages,
  onLoadOlderMessages,
}: ChatThreadProps) {
  const t = useT(dict);
  const timelineRef = useRef<HTMLDivElement>(null);
  const convId = conversation?.id;
  const messageCount = conversation?.messages.length ?? 0;
  const prevConvId = useRef(convId);
  const prevCount = useRef(messageCount);
  // Whether the user was near the bottom before the latest update. Kept current
  // by the timeline's onScroll handler so we never yank them away from history.
  const nearBottom = useRef(true);
  // WA's floating "scroll to latest" button — shown once the user has
  // scrolled away from the bottom, with a count of what they've missed.
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [missedCount, setMissedCount] = useState(0);

  // WA behavior: tapping a quoted-message preview scrolls the timeline to the
  // original message and briefly flashes it, instead of leaving the user to
  // hunt for it manually.
  const jumpToMessage = (messageId: string) => {
    const el = timelineRef.current?.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('bg-hermes-100/60', 'dark:bg-hermes-900/30');
    setTimeout(() => el.classList.remove('bg-hermes-100/60', 'dark:bg-hermes-900/30'), 1200);
  };

  // Scroll to the latest message only when (a) the conversation switches, or
  // (b) a new message is appended AND the user was already near the bottom.
  // A plain reload that doesn't add messages (e.g. approving a draft) preserves
  // the current scroll position instead of jumping to the bottom/old messages.
  useLayoutEffect(() => {
    const el = timelineRef.current;
    if (!el) return;
    const convChanged = prevConvId.current !== convId;
    const grew = messageCount > prevCount.current;
    if (convChanged || (grew && nearBottom.current)) {
      el.scrollTop = el.scrollHeight;
      if (convChanged) { setShowJumpToLatest(false); setMissedCount(0); }
    } else if (grew) {
      // New message arrived while the user was scrolled up reading history —
      // don't yank them down, just surface the floating jump button + count.
      setMissedCount((c) => c + (messageCount - prevCount.current));
      setShowJumpToLatest(true);
    }
    prevConvId.current = convId;
    prevCount.current = messageCount;
  }, [convId, messageCount]);

  const handleTimelineScroll = () => {
    const el = timelineRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottom.current = atBottom;
    if (atBottom) { setShowJumpToLatest(false); setMissedCount(0); }
  };

  const scrollToLatest = () => {
    const el = timelineRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    setShowJumpToLatest(false);
    setMissedCount(0);
  };

  // Per-message callback bundles, cached by message id so identical handlers
  // are reused across renders (e.g. while the composer is being typed into).
  // Without this, ChatThreadMessage's memo would be defeated every render by
  // freshly-created closures, forcing every bubble in long timelines to re-render.
  const rowCallbacksCache = useRef(new Map<string, { deps: unknown[]; bundle: RowCallbacks }>());
  const rowCallbacks = useMemo(() => {
    const cache = rowCallbacksCache.current;
    const liveIds = new Set<string>();
    const result = new Map<string, RowCallbacks>();
    for (const message of conversation?.messages ?? []) {
      liveIds.add(message.id);
      const deps = [message.id, onHoverMessageEnter, onHoverMessageExit, onReactMessage, onReplyToMessage, onEditMessage, onDeleteMessage, onStarMessage, onForwardMessage, message.isStarred];
      const cached = cache.get(message.id);
      if (cached && deps.every((d, i) => d === cached.deps[i])) {
        result.set(message.id, cached.bundle);
        continue;
      }
      const bundle: RowCallbacks = {
        onHoverEnter: () => onHoverMessageEnter?.(message.id),
        onHoverExit: () => onHoverMessageExit?.(),
        onReact: onReactMessage ? (emoji) => onReactMessage(message.id, emoji) : undefined,
        onReply: () => onReplyToMessage?.(message),
        onEdit: () => onEditMessage?.(message),
        onDelete: onDeleteMessage ? () => onDeleteMessage(message.id) : undefined,
        onStar: () => onStarMessage?.(message.id, !message.isStarred),
        onForward: onForwardMessage ? (toPhone) => onForwardMessage(message.id, toPhone) : undefined,
      };
      cache.set(message.id, { deps, bundle });
      result.set(message.id, bundle);
    }
    for (const id of cache.keys()) if (!liveIds.has(id)) cache.delete(id);
    return result;
  }, [conversation?.messages, onHoverMessageEnter, onHoverMessageExit, onReactMessage, onReplyToMessage, onEditMessage, onDeleteMessage, onStarMessage, onForwardMessage]);

  // Only blank the pane when there is no conversation to show. When one is
  // already open, keep the timeline mounted during busy actions (approve,
  // return-to-ai, etc.) so its scroll position is preserved — unmounting it
  // here would reset scroll to the top (oldest messages) after every action.
  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-gray-400">
        <p className="text-sm">{loading ? t('loadingConversation') : t('selectConversation')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 bg-white dark:bg-gray-900">
      <ChatThreadHeader
        conversation={conversation}
        onBack={onBack}
        onShowDetails={onShowDetails}
        actions={conversationActions}
        customerTyping={customerTyping}
      />

      {/* Message timeline — WA-style wallpaper behind the bubbles */}
      <div className="relative min-h-0 flex-1">
      <div ref={timelineRef} onScroll={handleTimelineScroll} className="scrollbar-thin h-full space-y-3 overflow-y-auto bg-[#efeae2] px-4 py-5 dark:bg-[#0b141a] sm:px-5">
        {hasMoreMessages && (
          <div className="flex justify-center pb-2">
            <button
              onClick={onLoadOlderMessages}
              disabled={loadingOlderMessages}
              className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
            >
              {loadingOlderMessages ? 'Memuat…' : 'Muat pesan lama'}
            </button>
          </div>
        )}
        {conversation.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {t('noMessagesYet')}
          </div>
        ) : (
          (() => {
            const nodes: React.ReactNode[] = [];
            let lastDateLabel = '';
            for (const message of conversation.messages) {
              const d = new Date(message.createdAt);
              const now = new Date();
              const msAgo = now.getTime() - d.getTime();
              const daysAgo = Math.floor(msAgo / 86400000);
              const dateLabel =
                daysAgo === 0 ? 'Hari ini' :
                daysAgo === 1 ? 'Kemarin' :
                daysAgo < 7 ? d.toLocaleDateString('id-ID', { weekday: 'long' }) :
                d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: daysAgo > 365 ? 'numeric' : undefined });
              if (dateLabel !== lastDateLabel) {
                lastDateLabel = dateLabel;
                nodes.push(
                  <div key={`sep-${message.id}`} className="flex items-center justify-center py-1">
                    <span className="shrink-0 rounded-md bg-white/90 px-3 py-1 text-[11px] font-medium text-gray-500 shadow-sm dark:bg-gray-800/90 dark:text-gray-400">
                      {dateLabel}
                    </span>
                  </div>
                );
              }
              // Group system events (member added/removed, subject/description
              // changed) render as a centered notice pill, like WhatsApp —
              // never as a chat bubble attributed to "admin".
              if (message.senderType === 'system') {
                nodes.push(
                  <div key={message.id} data-message-id={message.id} className="flex items-center justify-center py-1 transition-colors duration-300">
                    <span className="max-w-[85%] rounded-md bg-white/90 px-3 py-1 text-center text-[11.5px] text-gray-500 shadow-sm dark:bg-gray-800/90 dark:text-gray-400">
                      {message.content}
                    </span>
                  </div>,
                );
                continue;
              }
              const cb = rowCallbacks.get(message.id);
              nodes.push(
                <div key={message.id} data-message-id={message.id} className="rounded-lg transition-colors duration-300">
                  <ChatThreadMessage
                    message={message}
                    isCustomer={message.senderType === 'customer'}
                    isGroup={conversation.isGroup}
                    hoveredId={hoveredMessageId || null}
                    onHoverEnter={cb?.onHoverEnter ?? (() => onHoverMessageEnter?.(message.id))}
                    onHoverExit={cb?.onHoverExit ?? (() => onHoverMessageExit?.())}
                    onReact={cb?.onReact}
                    onReply={cb?.onReply ?? (() => onReplyToMessage?.(message))}
                    onEdit={cb?.onEdit ?? (() => onEditMessage?.(message))}
                    onDelete={cb?.onDelete}
                    onStar={cb?.onStar ?? (() => onStarMessage?.(message.id, !message.isStarred))}
                    onForward={cb?.onForward}
                    onJumpToMessage={jumpToMessage}
                  />
                </div>
              );
            }
            return nodes;
          })()
        )}
      </div>

      {/* WA-style "jump to latest" — appears once scrolled away from the bottom */}
      {showJumpToLatest && (
        <button
          type="button"
          onClick={scrollToLatest}
          aria-label="Ke pesan terbaru"
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-pop ring-1 ring-gray-200 transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700 dark:hover:bg-gray-700"
        >
          {missedCount > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-hermes-600 px-1 text-[10px] font-semibold text-white">
              {missedCount}
            </span>
          )}
          ↓
        </button>
      )}
      </div>

      {onSearchMessages && (
        <div className="border-t border-gray-100 px-3 py-1.5 dark:border-gray-800">
          <input
            type="search"
            value={msgSearch}
            onChange={(e) => onSearchMessages(e.target.value)}
            placeholder="Cari pesan…"
            className="h-7 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
          {msgSearch && (
            <div className="mt-1 max-h-40 overflow-y-auto rounded border border-gray-100 bg-white text-xs dark:border-gray-800 dark:bg-gray-900">
              {msgSearching ? (
                <p className="px-3 py-2 text-gray-400">Mencari…</p>
              ) : msgSearchResults.length === 0 ? (
                <p className="px-3 py-2 text-gray-400">Tidak ditemukan</p>
              ) : (
                msgSearchResults.map((m) => (
                  <div key={m.id} className="border-b border-gray-50 px-3 py-1.5 last:border-0 dark:border-gray-800">
                    <span className="text-[10px] text-gray-400">{m.senderType} · {new Date(m.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    <p className="mt-0.5 text-gray-700 dark:text-gray-300">{m.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <AssetBar
        assets={assets}
        suggestions={assetSuggestions}
        onSendAsset={onSendAsset}
        onDismiss={onDismissAsset}
        disabled={loading}
      />

      <ChatComposer
        conversation={conversation}
        disabled={loading}
        composerValue={composerValue}
        onComposerChange={onComposerChange || (() => {})}
        onSend={onSendMessage || (async () => {})}
        onUploadFile={onUploadFile}
        onSendLocation={onSendLocation}
        onSendPoll={onSendPoll}
        onSendContacts={onSendContacts}
        quickReplies={quickReplies}
        onApplyQuickReply={onApplyQuickReply}
        sendError={sendError}
        quoteMessage={quoteMessage}
        editingMessage={editingMessage}
        onClearQuote={onClearQuote}
        onClearEdit={onClearEdit}
      />
    </div>
  );
}

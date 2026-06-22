'use client';

import { useLayoutEffect, useMemo, useRef } from 'react';
import { ChatThreadMessage } from './ChatThreadMessage';
import { ChatThreadHeader, type ConversationActions } from './ChatThreadHeader';
import { ChatComposer } from './ChatComposer';
import { AssetBar, type Asset, type AssetSuggestion } from './AssetBar';
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
}: ChatThreadProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const convId = conversation?.id;
  const messageCount = conversation?.messages.length ?? 0;
  const prevConvId = useRef(convId);
  const prevCount = useRef(messageCount);
  // Whether the user was near the bottom before the latest update. Kept current
  // by the timeline's onScroll handler so we never yank them away from history.
  const nearBottom = useRef(true);

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
    }
    prevConvId.current = convId;
    prevCount.current = messageCount;
  }, [convId, messageCount]);

  const handleTimelineScroll = () => {
    const el = timelineRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
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
        <p className="text-sm">{loading ? 'Loading conversation...' : 'Select a conversation to view messages'}</p>
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

      {/* Message timeline */}
      <div ref={timelineRef} onScroll={handleTimelineScroll} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-5">
        {conversation.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No messages yet
          </div>
        ) : (
          conversation.messages.map((message) => {
            const cb = rowCallbacks.get(message.id);
            return (
              <ChatThreadMessage
                key={message.id}
                message={message}
                isCustomer={message.senderType === 'customer'}
                hoveredId={hoveredMessageId || null}
                onHoverEnter={cb?.onHoverEnter ?? (() => onHoverMessageEnter?.(message.id))}
                onHoverExit={cb?.onHoverExit ?? (() => onHoverMessageExit?.())}
                onReact={cb?.onReact}
                onReply={cb?.onReply ?? (() => onReplyToMessage?.(message))}
                onEdit={cb?.onEdit ?? (() => onEditMessage?.(message))}
                onDelete={cb?.onDelete}
                onStar={cb?.onStar ?? (() => onStarMessage?.(message.id, !message.isStarred))}
                onForward={cb?.onForward}
              />
            );
          })
        )}
      </div>

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

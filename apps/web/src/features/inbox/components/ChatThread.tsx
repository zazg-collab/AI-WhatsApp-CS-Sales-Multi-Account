'use client';

import { useEffect, useRef } from 'react';
import { ChatThreadMessage } from './ChatThreadMessage';
import { ChatThreadHeader, type ConversationActions } from './ChatThreadHeader';
import { ChatComposer } from './ChatComposer';
import { AssetBar, type Asset, type AssetSuggestion } from './AssetBar';
import type { ConvDetail, Message } from '../inbox.types';

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
}: ChatThreadProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message when the count changes.
  const messageCount = conversation?.messages.length ?? 0;
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [messageCount, conversation?.id]);

  if (!conversation) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-gray-400">
        <p className="text-sm">Select a conversation to view messages</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center text-gray-400">
        <p className="text-sm">Loading conversation...</p>
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
      <div ref={timelineRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-5">
        {conversation.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No messages yet
          </div>
        ) : (
          conversation.messages.map((message) => (
            <ChatThreadMessage
              key={message.id}
              message={message}
              isCustomer={message.senderType === 'customer'}
              hoveredId={hoveredMessageId || null}
              onHoverEnter={() => onHoverMessageEnter?.(message.id)}
              onHoverExit={() => onHoverMessageExit?.()}
              onReact={onReactMessage ? (emoji) => onReactMessage(message.id, emoji) : undefined}
              onReply={() => onReplyToMessage?.(message)}
              onEdit={() => onEditMessage?.(message)}
              onDelete={onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
              onStar={() => onStarMessage?.(message.id, !message.isStarred)}
            />
          ))
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

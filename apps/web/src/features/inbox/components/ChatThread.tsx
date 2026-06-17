'use client';

import { useRef } from 'react';
import { ChatThreadMessage } from './ChatThreadMessage';
import { ChatThreadHeader } from './ChatThreadHeader';
import { ChatComposer } from './ChatComposer';
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
  onEditMessage?: (messageId: string, newText: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onBack?: () => void;
  onShowDetails?: () => void;
  onClearQuote?: () => void;
  onClearEdit?: () => void;
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
  onEditMessage,
  onDeleteMessage,
  onBack,
  onShowDetails,
  onClearQuote,
  onClearEdit,
}: ChatThreadProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

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
    <div className="flex flex-1 flex-col">
      <ChatThreadHeader
        conversation={conversation}
        onBack={onBack}
        onShowDetails={onShowDetails}
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
              hoveredId={null} // TODO: manage hover state
              onHoverEnter={() => {}} // TODO
              onHoverExit={() => {}} // TODO
              onReact={onReactMessage ? (emoji) => onReactMessage(message.id, emoji) : undefined}
              onReply={() => {}} // TODO: set quote state
              onEdit={onEditMessage ? () => onEditMessage(message.id, '') : undefined} // TODO: edit flow
              onDelete={onDeleteMessage ? () => onDeleteMessage(message.id) : undefined}
              onStar={() => {}} // TODO: star action
            />
          ))
        )}
      </div>

      <ChatComposer
        conversation={conversation}
        disabled={loading}
        composerValue={composerValue}
        onComposerChange={onComposerChange || (() => {})}
        onSend={onSendMessage || (async () => {})}
        quoteMessage={quoteMessage}
        editingMessage={editingMessage}
        onClearQuote={onClearQuote}
        onClearEdit={onClearEdit}
      />
    </div>
  );
}

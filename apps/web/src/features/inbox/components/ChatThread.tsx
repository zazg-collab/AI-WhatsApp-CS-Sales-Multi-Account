'use client';

import { useRef } from 'react';
import { ChatThreadMessage } from './ChatThreadMessage';
import type { ConvDetail, Message } from '../inbox.types';

interface ChatThreadProps {
  conversation: ConvDetail | null;
  loading?: boolean;
  onSendMessage?: (text: string, quotedMessageId?: string) => Promise<void>;
  onReactMessage?: (messageId: string, emoji: string) => Promise<void>;
  onEditMessage?: (messageId: string, newText: string) => Promise<void>;
  onDeleteMessage?: (messageId: string) => Promise<void>;
}

/**
 * ChatThread: Renders the conversation's message timeline and composer.
 *
 * Responsibilities:
 * - Message bubble rendering (via ChatThreadMessage)
 * - Timeline scrolling (auto-scroll to latest)
 * - Composer UI (text input + media/location/poll menus)
 * - Message actions (react, edit, delete, quote, star)
 * - Typing indicators + Hermes draft display
 *
 * The inbox/page.tsx handles:
 * - Which conversation to show (activeId)
 * - Fetching conversation data (via useConversation hook)
 * - High-level message actions (send, approve draft, takeover, etc.)
 */
export function ChatThread({
  conversation,
  loading,
  onSendMessage,
  onReactMessage,
  onEditMessage,
  onDeleteMessage,
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
    <>
      {/* Header with customer name + online status + actions */}
      {/* TODO: Extract to <ChatThreadHeader conversation={conversation} /> */}

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

      {/* Composer (text input + send + media/location/poll/quick-reply menus) */}
      {/* TODO: Extract to <ChatComposer conversation={conversation} onSend={onSendMessage} /> */}
    </>
  );
}

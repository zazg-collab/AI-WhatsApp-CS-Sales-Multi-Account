'use client';

import { useRef, useState } from 'react';
import {
  PaperPlaneTilt,
  Paperclip,
  MapPin,
  Smiley,
  ArchiveBox,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import type { ConvDetail, Message } from '../inbox.types';

interface ChatComposerProps {
  conversation: ConvDetail;
  disabled?: boolean;
  loading?: boolean;
  quoteMessage?: Message | null;
  editingMessage?: Message | null;
  composerValue: string;
  onComposerChange: (value: string) => void;
  onSend: (text: string) => Promise<void>;
  onAttachMedia?: () => void;
  onSendLocation?: () => void;
  onSendPoll?: () => void;
  onSendContacts?: () => void;
  onClearQuote?: () => void;
  onClearEdit?: () => void;
}

export function ChatComposer({
  conversation,
  disabled = false,
  loading = false,
  quoteMessage,
  editingMessage,
  composerValue,
  onComposerChange,
  onSend,
  onAttachMedia,
  onSendLocation,
  onSendPoll,
  onSendContacts,
  onClearQuote,
  onClearEdit,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!composerValue.trim() || sending) return;
    setSending(true);
    try {
      await onSend(composerValue);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isComposing = editingMessage || quoteMessage;

  return (
    <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:p-5">
      {/* Quote preview or edit indicator */}
      {isComposing && (
        <div className="mb-3 rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
          {editingMessage && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">Editing sent message</p>
              <p className="mt-1 truncate text-sm text-gray-700 dark:text-gray-200">
                {editingMessage.content}
              </p>
            </>
          )}
          {quoteMessage && !editingMessage && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">Replying to {quoteMessage.senderType}</p>
              <p className="mt-1 truncate text-sm text-gray-700 dark:text-gray-200">
                {quoteMessage.content}
              </p>
            </>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={editingMessage ? onClearEdit : onClearQuote}
            className="mt-2 text-xs"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Text input */}
      <div className="flex gap-2">
        <textarea
          ref={textareaRef}
          value={composerValue}
          onChange={(e) => onComposerChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            editingMessage
              ? 'Edit sent message'
              : quoteMessage
                ? 'Reply with quoted message'
                : 'Write a reply, or edit the AI draft above'
          }
          disabled={disabled || loading}
          rows={3}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          aria-label="Message input"
        />

        <div className="flex flex-col gap-2">
          {/* Send button */}
          <Button
            size="sm"
            disabled={!composerValue.trim() || sending || disabled}
            onClick={handleSend}
            className="h-full"
            aria-label="Send message"
          >
            <PaperPlaneTilt className="h-4 w-4" />
            <span className="hidden sm:inline">Send</span>
          </Button>

          {/* Media menu */}
          <Popover placement="top-end">
            <Button
              variant="ghost"
              size="sm"
              icon
              disabled={disabled || loading}
              aria-label="Attach media"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <button
                onClick={onAttachMedia}
                disabled={disabled}
                className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                📎 Attach media
              </button>
              <button
                onClick={onSendLocation}
                disabled={disabled}
                className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                <MapPin className="mb-0.5 mr-1.5 inline h-3.5 w-3.5" />
                Send location
              </button>
              <button
                onClick={onSendPoll}
                disabled={disabled}
                className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                📋 Send poll
              </button>
              <button
                onClick={onSendContacts}
                disabled={disabled}
                className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                👥 Send contacts
              </button>
            </div>
          </Popover>

          {/* More menu */}
          <Popover placement="top-end">
            <Button
              variant="ghost"
              size="sm"
              icon
              disabled={disabled || loading}
              aria-label="More options"
            >
              ⋮
            </Button>
            <div className="space-y-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <button
                className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                😊 Reactions
              </button>
              <button
                className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                ⏰ Schedule
              </button>
              <button
                className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                💾 Save draft
              </button>
            </div>
          </Popover>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        aria-hidden="true"
      />
    </div>
  );
}

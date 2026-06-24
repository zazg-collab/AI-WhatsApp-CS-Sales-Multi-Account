'use client';

import { useRef, useState } from 'react';
import {
  PaperPlaneTilt,
  Paperclip,
  MapPin,
  Lightning,
  ChartBar,
  UserCircle,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/Button';
import { Popover, useSinglePopover } from '@/components/ui/Popover';
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
  onUploadFile?: (file: File) => Promise<void>;
  onSendLocation?: (raw: string) => void;
  onSendPoll?: (raw: string) => void;
  onSendContacts?: (raw: string) => void;
  onClearQuote?: () => void;
  onClearEdit?: () => void;
  quickReplies?: Array<{ id: string; title: string; content: string; shortcut: string | null }>;
  onApplyQuickReply?: (content: string) => void;
  sendError?: string | null;
}

type MediaForm = 'location' | 'poll' | 'contacts';

const mediaFormConfig: Record<MediaForm, { label: string; placeholder: string }> = {
  location: { label: 'Send location', placeholder: 'latitude, longitude, name (optional)' },
  poll: { label: 'Send poll', placeholder: 'Question | Option 1 | Option 2' },
  contacts: { label: 'Send contact', placeholder: 'Name | Phone number' },
};

export function ChatComposer({
  disabled = false,
  loading = false,
  quoteMessage,
  editingMessage,
  composerValue,
  onComposerChange,
  onSend,
  onAttachMedia,
  onUploadFile,
  onSendLocation,
  onSendPoll,
  onSendContacts,
  onClearQuote,
  onClearEdit,
  quickReplies = [],
  onApplyQuickReply,
  sendError,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [mediaForm, setMediaForm] = useState<MediaForm | null>(null);
  const [mediaFormValue, setMediaFormValue] = useState('');
  const { toggle, close, isOpen } = useSinglePopover<'media' | 'quick'>();

  const mediaFormHandlers: Record<MediaForm, ((raw: string) => void) | undefined> = {
    location: onSendLocation,
    poll: onSendPoll,
    contacts: onSendContacts,
  };

  const openMediaForm = (form: MediaForm) => {
    setMediaForm(form);
    setMediaFormValue('');
    close();
  };

  const submitMediaForm = () => {
    if (!mediaForm || !mediaFormValue.trim()) return;
    mediaFormHandlers[mediaForm]?.(mediaFormValue.trim());
    setMediaForm(null);
    setMediaFormValue('');
  };

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
      {/* Send error */}
      {sendError && (
        <div className="mb-3 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs font-medium text-danger-700 dark:border-danger-900/30 dark:bg-danger-900/20 dark:text-danger-400">
          {sendError}
        </div>
      )}

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
            size="sm"
            onClick={editingMessage ? onClearEdit : onClearQuote}
            className="mt-2 text-xs"
          >
            Cancel
          </Button>
        </div>
      )}

      {/* Text input + actions (compact single-row layout) */}
      <div className="flex items-end gap-2">
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
                : 'Write a reply...'
          }
          disabled={disabled || loading}
          rows={3}
          className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          aria-label="Message input"
        />

        <div className="flex items-center gap-1 shrink-0">
          {/* Quick replies popover */}
          {quickReplies.length > 0 && onApplyQuickReply && (
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                disabled={disabled || loading}
                onClick={() => toggle('quick')}
                aria-label="Quick replies"
                title="Quick replies"
                className="p-2"
              >
                <Lightning className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Popover open={isOpen('quick')} onClose={() => close()} align="right" side="top">
                <div className="max-h-64 w-60 space-y-0.5 overflow-y-auto p-1.5">
                  {quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => { onApplyQuickReply(qr.content); close(); }}
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <span className="block font-medium text-gray-800 dark:text-gray-100">
                        {qr.title}
                        {qr.shortcut && <span className="ml-1 text-[11px] text-gray-400">/{qr.shortcut}</span>}
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{qr.content}</span>
                    </button>
                  ))}
                </div>
              </Popover>
            </div>
          )}

          {/* Media menu popover */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || loading}
              onClick={() => toggle('media')}
              aria-label="Attach media"
              className="p-2"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Popover open={isOpen('media')} onClose={() => close()} align="right" side="top">
              <div className="space-y-1 p-2">
                <button
                  onClick={() => {
                    if (onUploadFile) fileInputRef.current?.click();
                    else onAttachMedia?.();
                    close();
                  }}
                  disabled={disabled}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  Attach media
                </button>
                {onSendLocation && (
                  <button
                    onClick={() => openMediaForm('location')}
                    disabled={disabled}
                    className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <MapPin className="mb-0.5 mr-1.5 inline h-3.5 w-3.5" />
                    Send location
                  </button>
                )}
                {onSendPoll && (
                  <button
                    onClick={() => openMediaForm('poll')}
                    disabled={disabled}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <ChartBar className="h-4 w-4" aria-hidden="true" />
                    Send poll
                  </button>
                )}
                {onSendContacts && (
                  <button
                    onClick={() => openMediaForm('contacts')}
                    disabled={disabled}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <UserCircle className="h-4 w-4" aria-hidden="true" />
                    Send contact
                  </button>
                )}
              </div>
            </Popover>
          </div>

          {/* Send button */}
          <Button
            size="sm"
            disabled={!composerValue.trim() || sending || disabled}
            onClick={handleSend}
            aria-label={sending ? 'Sending…' : 'Send message'}
            className="shrink-0 p-2"
          >
            {sending
              ? <span className="block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              : <PaperPlaneTilt className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Inline mini-form for location / poll / contact */}
      {mediaForm && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
          <input
            autoFocus
            value={mediaFormValue}
            onChange={(e) => setMediaFormValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitMediaForm(); }
              if (e.key === 'Escape') setMediaForm(null);
            }}
            placeholder={mediaFormConfig[mediaForm].placeholder}
            aria-label={mediaFormConfig[mediaForm].label}
            className="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <Button size="sm" onClick={submitMediaForm} disabled={!mediaFormValue.trim()}>
            {mediaFormConfig[mediaForm].label}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMediaForm(null)}>
            Cancel
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        hidden
        aria-hidden="true"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onUploadFile) {
            onUploadFile(file).finally(() => {
              if (fileInputRef.current) fileInputRef.current.value = '';
            });
          }
        }}
      />
    </div>
  );
}

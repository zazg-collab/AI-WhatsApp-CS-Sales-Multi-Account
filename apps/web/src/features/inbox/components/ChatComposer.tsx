'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PaperPlaneTilt,
  Paperclip,
  MapPin,
  Lightning,
  ChartBar,
  UserCircle,
  Smiley,
} from '@/components/ui/core-essential-icons';
import { Button } from '@/components/ui/Button';
import { Popover, useSinglePopover } from '@/components/ui/Popover';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import { api } from '@/lib/api';
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
type ActiveModal = 'buttons' | 'list' | 'pin' | 'caption' | 'linkPreview' | null;

// ─── More-menu modal state types ─────────────────────────────────────────────

interface ButtonsForm {
  text: string;
  footer: string;
  buttons: Array<{ id: string; text: string }>;
}

interface ListSection {
  title: string;
  rows: Array<{ id: string; title: string; description: string }>;
}

interface ListForm {
  title: string;
  text: string;
  footer: string;
  buttonText: string;
  sections: ListSection[];
}

interface PinForm { messageId: string; unpin: boolean }
interface CaptionForm { messageId: string; mediaType: 'image' | 'video' | 'document'; caption: string }
interface LinkPreviewForm { text: string; url: string; title: string; description: string }

// ─── Small shared modal wrapper ───────────────────────────────────────────────

function Modal({ title, onClose, onSubmit, submitting, error, children }: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" aria-label="Close">✕</button>
        </div>
        <div className="space-y-3 p-4">
          {error && (
            <p className="rounded bg-danger-50 px-3 py-2 text-xs text-danger-700 dark:bg-danger-900/20 dark:text-danger-400">{error}</p>
          )}
          {children}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={submitting}>
            {submitting ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function inputCls(extra = '') {
  return `w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${extra}`;
}

function labelCls() {
  return 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5';
}

// WA's left-of-composer emoji button. A small curated set, not a full picker —
// covers the common cases without the weight of an emoji library.
const QUICK_EMOJIS = ['😀', '😂', '🥰', '😍', '🙏', '👍', '👏', '🎉', '😢', '😮', '🔥', '✅'];

// ─── Main component ───────────────────────────────────────────────────────────

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
  const t = useT(dict);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  const [sending, setSending] = useState(false);
  const [mediaForm, setMediaForm] = useState<MediaForm | null>(null);
  const [mediaFormValue, setMediaFormValue] = useState('');
  const { toggle, close, isOpen } = useSinglePopover<'media' | 'quick' | 'emoji'>();

  // More-menu state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [sentFeedback, setSentFeedback] = useState(false);

  // Modal form states
  const [buttonsForm, setButtonsForm] = useState<ButtonsForm>({
    text: '', footer: '', buttons: [{ id: 'btn1', text: '' }],
  });
  const [listForm, setListForm] = useState<ListForm>({
    title: '', text: '', footer: '', buttonText: 'Choose',
    sections: [{ title: '', rows: [{ id: 'row1', title: '', description: '' }] }],
  });
  const [pinForm, setPinForm] = useState<PinForm>({ messageId: '', unpin: false });
  const [captionForm, setCaptionForm] = useState<CaptionForm>({ messageId: '', mediaType: 'image', caption: '' });
  const [linkForm, setLinkForm] = useState<LinkPreviewForm>({ text: '', url: '', title: '', description: '' });

  // WA behavior: tapping Reply/Edit on a bubble should drop you straight into
  // typing, cursor at the end — not leave you to go click the textarea yourself.
  useEffect(() => {
    if (!quoteMessage && !editingMessage) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [quoteMessage, editingMessage]);

  // WA composer grows with the text instead of a fixed 3-row box, capped so a
  // long paste doesn't swallow the timeline.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [composerValue]);

  // Close more-menu when clicking outside
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMoreMenu]);

  const phone = conversation.customer.phoneNumber;
  const accountId = conversation.whatsappAccount.id;
  const base = `wa/accounts/${accountId}`;

  const showFeedback = () => {
    setSentFeedback(true);
    setTimeout(() => setSentFeedback(false), 1500);
  };

  const openModal = (m: ActiveModal) => {
    setActiveModal(m);
    setModalError(null);
    setShowMoreMenu(false);
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalError(null);
  };

  const handleModalSubmit = async (payload: object, endpoint: string, method: 'POST' | 'PUT' = 'POST') => {
    setModalSubmitting(true);
    setModalError(null);
    try {
      await api(endpoint, { method, body: JSON.stringify(payload) });
      closeModal();
      showFeedback();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setModalSubmitting(false);
    }
  };

  // ── Buttons submit ──
  const submitButtons = () => {
    if (!buttonsForm.text.trim() || buttonsForm.buttons.some(b => !b.text.trim())) {
      setModalError('Fill in message text and all button labels.');
      return;
    }
    handleModalSubmit(
      { phone, text: buttonsForm.text, footer: buttonsForm.footer || undefined, buttons: buttonsForm.buttons },
      `${base}/messages/buttons`,
    );
  };

  // ── List submit ──
  const submitList = () => {
    if (!listForm.title.trim() || !listForm.text.trim() || !listForm.buttonText.trim()) {
      setModalError('Title, body and button text are required.');
      return;
    }
    handleModalSubmit(
      { phone, title: listForm.title, text: listForm.text, footer: listForm.footer || undefined, buttonText: listForm.buttonText, sections: listForm.sections },
      `${base}/messages/list`,
    );
  };

  // ── Pin submit ──
  const submitPin = () => {
    if (!pinForm.messageId.trim()) { setModalError('Message ID is required.'); return; }
    handleModalSubmit({ phone, messageId: pinForm.messageId, unpin: pinForm.unpin }, `${base}/messages/pin`);
  };

  // ── Caption submit ──
  const submitCaption = () => {
    if (!captionForm.messageId.trim() || !captionForm.caption.trim()) {
      setModalError('Message ID and caption are required.');
      return;
    }
    handleModalSubmit(
      { phone, messageId: captionForm.messageId, mediaType: captionForm.mediaType, caption: captionForm.caption },
      `${base}/messages/caption`,
      'PUT',
    );
  };

  // ── Link preview submit ──
  const submitLinkPreview = () => {
    if (!linkForm.text.trim() || !linkForm.url.trim() || !linkForm.title.trim()) {
      setModalError('Text, URL and title are required.');
      return;
    }
    handleModalSubmit(
      { phone, text: linkForm.text, url: linkForm.url, title: linkForm.title, description: linkForm.description || undefined },
      `${base}/messages/link-preview`,
    );
  };

  // ── Recording ──
  const sendRecording = async (action: 'start' | 'stop') => {
    setShowMoreMenu(false);
    try {
      await api(`${base}/chats/${encodeURIComponent(phone)}/recording/${action}`, { method: 'POST' });
      showFeedback();
    } catch {
      // best-effort
    }
  };

  // ─── Existing media form logic (unchanged) ────────────────────────────────

  const mediaFormConfig: Record<MediaForm, { label: string; placeholder: string }> = {
    location: { label: t('mediaSendLocation'), placeholder: t('mediaLocationPlaceholder') },
    poll: { label: t('mediaSendPoll'), placeholder: t('mediaPollPlaceholder') },
    contacts: { label: t('mediaSendContact'), placeholder: t('mediaContactPlaceholder') },
  };

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
      return;
    }
    if (e.key === 'Escape' && (quoteMessage || editingMessage)) {
      e.preventDefault();
      (editingMessage ? onClearEdit : onClearQuote)?.();
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

      {/* Sent feedback */}
      {sentFeedback && (
        <div className="mb-3 rounded-lg bg-success-50 px-3 py-2 text-xs font-medium text-success-700 dark:bg-success-900/20 dark:text-success-400">
          Sent ✓
        </div>
      )}

      {/* Quote preview or edit indicator */}
      {isComposing && (
        <div className="mb-3 rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800">
          {editingMessage && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('composerEditing')}</p>
              <p className="mt-1 truncate text-sm text-gray-700 dark:text-gray-200">
                {editingMessage.content}
              </p>
            </>
          )}
          {quoteMessage && !editingMessage && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('composerReplyingTo', { who: quoteMessage.senderType })}</p>
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
            {t('composerCancel')}
          </Button>
        </div>
      )}

      {/* Text input + actions (compact single-row layout) */}
      <div className="flex items-end gap-2">
        {/* Emoji button — WA puts this to the left of the input, not the right */}
        <div className="relative shrink-0">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || loading}
            onClick={() => toggle('emoji')}
            aria-label={t('ariaEmoji')}
            title={t('ariaEmoji')}
            className="p-2"
          >
            <Smiley className="h-5 w-5" />
          </Button>
          <Popover open={isOpen('emoji')} onClose={() => close()} align="left" side="top">
            <div className="grid grid-cols-6 gap-1 p-2">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onComposerChange(composerValue + emoji);
                    close();
                    textareaRef.current?.focus();
                  }}
                  className="rounded p-1 text-xl transition-transform hover:scale-125"
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </Popover>
        </div>

        <textarea
          ref={textareaRef}
          value={composerValue}
          onChange={(e) => onComposerChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            editingMessage
              ? t('composerEditPlaceholder')
              : quoteMessage
                ? t('composerQuotePlaceholder')
                : t('composerPlaceholder')
          }
          disabled={disabled || loading}
          rows={1}
          className="flex-1 resize-none overflow-y-auto rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          aria-label={t('composerAriaLabel')}
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
                aria-label={t('ariaQuickReplies')}
                title={t('ariaQuickReplies')}
                className="p-2"
              >
                <Lightning className="h-4 w-4" />
              </Button>
              <Popover open={isOpen('quick')} onClose={() => close()} align="right" side="top">
                <div className="max-h-64 overflow-y-auto p-2">
                  {quickReplies.map((qr) => (
                    <button
                      key={qr.id}
                      onClick={() => { onApplyQuickReply(qr.content); close(); }}
                      className="flex w-full flex-col rounded px-2 py-1.5 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{qr.title}</span>
                      {qr.shortcut && <span className="text-xs text-gray-400">/{qr.shortcut}</span>}
                      <span className="truncate text-xs text-gray-500">{qr.content}</span>
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
              aria-label={t('attachMedia')}
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
                  {t('attachMedia')}
                </button>
                {onSendLocation && (
                  <button
                    onClick={() => openMediaForm('location')}
                    disabled={disabled}
                    className="w-full rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <MapPin className="mb-0.5 mr-1.5 inline h-3.5 w-3.5" />
                    {t('mediaSendLocation')}
                  </button>
                )}
                {onSendPoll && (
                  <button
                    onClick={() => openMediaForm('poll')}
                    disabled={disabled}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <ChartBar className="h-4 w-4" aria-hidden="true" />
                    {t('mediaSendPoll')}
                  </button>
                )}
                {onSendContacts && (
                  <button
                    onClick={() => openMediaForm('contacts')}
                    disabled={disabled}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    <UserCircle className="h-4 w-4" aria-hidden="true" />
                    {t('mediaSendContact')}
                  </button>
                )}
              </div>
            </Popover>
          </div>

          {/* More menu ("+" button) */}
          <div className="relative" ref={moreMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || loading}
              onClick={() => setShowMoreMenu((v) => !v)}
              aria-label="More send options"
              className="p-2"
            >
              <span className="text-base font-bold leading-none">+</span>
            </Button>
            {showMoreMenu && (
              <div className="absolute bottom-full right-0 z-40 mb-1 w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                {[
                  { label: '📋 Send Buttons', key: 'buttons' as const },
                  { label: '📄 Send List', key: 'list' as const },
                  { label: '📌 Pin Message', key: 'pin' as const },
                  { label: '✏️ Edit Caption', key: 'caption' as const },
                  { label: '🔗 Link Preview', key: 'linkPreview' as const },
                ].map(({ label, key }) => (
                  <button
                    key={key}
                    onClick={() => openModal(key)}
                    className="flex w-full items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {label}
                  </button>
                ))}
                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                <button
                  onClick={() => sendRecording('start')}
                  className="flex w-full items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  🎙 Recording On
                </button>
                <button
                  onClick={() => sendRecording('stop')}
                  className="flex w-full items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  🎙 Recording Off
                </button>
              </div>
            )}
          </div>

          {/* Send button */}
          <Button
            size="sm"
            disabled={!composerValue.trim() || sending || disabled}
            onClick={handleSend}
            aria-label={sending ? t('ariaSending') : t('ariaSend')}
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
            {t('composerCancel')}
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

      {/* ── More-menu modals ──────────────────────────────────────────────── */}

      {/* Send Buttons modal */}
      {activeModal === 'buttons' && (
        <Modal title="Send Buttons" onClose={closeModal} onSubmit={submitButtons} submitting={modalSubmitting} error={modalError}>
          <div>
            <label className={labelCls()}>Message text *</label>
            <textarea
              value={buttonsForm.text}
              onChange={(e) => setButtonsForm((f) => ({ ...f, text: e.target.value }))}
              rows={3}
              className={inputCls('resize-none')}
              placeholder="Enter message body"
            />
          </div>
          <div>
            <label className={labelCls()}>Footer (optional)</label>
            <input
              value={buttonsForm.footer}
              onChange={(e) => setButtonsForm((f) => ({ ...f, footer: e.target.value }))}
              className={inputCls()}
              placeholder="Footer text"
            />
          </div>
          <div className="space-y-2">
            <label className={labelCls()}>Buttons (up to 3) *</label>
            {buttonsForm.buttons.map((btn, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={btn.id}
                  onChange={(e) => setButtonsForm((f) => {
                    const buttons = [...f.buttons];
                    buttons[i] = { ...buttons[i], id: e.target.value };
                    return { ...f, buttons };
                  })}
                  className={inputCls('w-24 shrink-0')}
                  placeholder="ID"
                />
                <input
                  value={btn.text}
                  onChange={(e) => setButtonsForm((f) => {
                    const buttons = [...f.buttons];
                    buttons[i] = { ...buttons[i], text: e.target.value };
                    return { ...f, buttons };
                  })}
                  className={inputCls('flex-1')}
                  placeholder={`Button ${i + 1} label`}
                />
                {buttonsForm.buttons.length > 1 && (
                  <button
                    onClick={() => setButtonsForm((f) => ({ ...f, buttons: f.buttons.filter((_, j) => j !== i) }))}
                    className="text-gray-400 hover:text-danger-500"
                    aria-label="Remove button"
                  >✕</button>
                )}
              </div>
            ))}
            {buttonsForm.buttons.length < 3 && (
              <button
                onClick={() => setButtonsForm((f) => ({
                  ...f,
                  buttons: [...f.buttons, { id: `btn${f.buttons.length + 1}`, text: '' }],
                }))}
                className="text-xs text-primary-600 hover:underline dark:text-primary-400"
              >
                + Add button
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* Send List modal */}
      {activeModal === 'list' && (
        <Modal title="Send List" onClose={closeModal} onSubmit={submitList} submitting={modalSubmitting} error={modalError}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls()}>Title *</label>
              <input value={listForm.title} onChange={(e) => setListForm((f) => ({ ...f, title: e.target.value }))} className={inputCls()} placeholder="List title" />
            </div>
            <div>
              <label className={labelCls()}>Button text *</label>
              <input value={listForm.buttonText} onChange={(e) => setListForm((f) => ({ ...f, buttonText: e.target.value }))} className={inputCls()} placeholder="e.g. Choose" />
            </div>
          </div>
          <div>
            <label className={labelCls()}>Body *</label>
            <textarea value={listForm.text} onChange={(e) => setListForm((f) => ({ ...f, text: e.target.value }))} rows={2} className={inputCls('resize-none')} placeholder="Message body" />
          </div>
          <div>
            <label className={labelCls()}>Footer (optional)</label>
            <input value={listForm.footer} onChange={(e) => setListForm((f) => ({ ...f, footer: e.target.value }))} className={inputCls()} placeholder="Footer text" />
          </div>

          {/* Sections */}
          <div className="space-y-3">
            <label className={labelCls()}>Section</label>
            {listForm.sections.map((sec, si) => (
              <div key={si} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700 space-y-2">
                <input
                  value={sec.title}
                  onChange={(e) => setListForm((f) => {
                    const sections = [...f.sections];
                    sections[si] = { ...sections[si], title: e.target.value };
                    return { ...f, sections };
                  })}
                  className={inputCls()}
                  placeholder="Section title"
                />
                {sec.rows.map((row, ri) => (
                  <div key={ri} className="grid grid-cols-3 gap-1">
                    <input
                      value={row.id}
                      onChange={(e) => setListForm((f) => {
                        const sections = [...f.sections];
                        const rows = [...sections[si].rows];
                        rows[ri] = { ...rows[ri], id: e.target.value };
                        sections[si] = { ...sections[si], rows };
                        return { ...f, sections };
                      })}
                      className={inputCls()}
                      placeholder="ID"
                    />
                    <input
                      value={row.title}
                      onChange={(e) => setListForm((f) => {
                        const sections = [...f.sections];
                        const rows = [...sections[si].rows];
                        rows[ri] = { ...rows[ri], title: e.target.value };
                        sections[si] = { ...sections[si], rows };
                        return { ...f, sections };
                      })}
                      className={inputCls()}
                      placeholder="Title"
                    />
                    <input
                      value={row.description}
                      onChange={(e) => setListForm((f) => {
                        const sections = [...f.sections];
                        const rows = [...sections[si].rows];
                        rows[ri] = { ...rows[ri], description: e.target.value };
                        sections[si] = { ...sections[si], rows };
                        return { ...f, sections };
                      })}
                      className={inputCls()}
                      placeholder="Desc (opt)"
                    />
                  </div>
                ))}
                <button
                  onClick={() => setListForm((f) => {
                    const sections = [...f.sections];
                    sections[si] = {
                      ...sections[si],
                      rows: [...sections[si].rows, { id: `row${sections[si].rows.length + 1}`, title: '', description: '' }],
                    };
                    return { ...f, sections };
                  })}
                  className="text-xs text-primary-600 hover:underline dark:text-primary-400"
                >
                  + Add row
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Pin Message modal */}
      {activeModal === 'pin' && (
        <Modal title="Pin Message" onClose={closeModal} onSubmit={submitPin} submitting={modalSubmitting} error={modalError}>
          <div>
            <label className={labelCls()}>Message ID *</label>
            <input value={pinForm.messageId} onChange={(e) => setPinForm((f) => ({ ...f, messageId: e.target.value }))} className={inputCls()} placeholder="e.g. 3EB0..." />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={pinForm.unpin}
              onChange={(e) => setPinForm((f) => ({ ...f, unpin: e.target.checked }))}
              className="rounded"
            />
            Unpin instead
          </label>
        </Modal>
      )}

      {/* Edit Caption modal */}
      {activeModal === 'caption' && (
        <Modal title="Edit Caption" onClose={closeModal} onSubmit={submitCaption} submitting={modalSubmitting} error={modalError}>
          <div>
            <label className={labelCls()}>Message ID *</label>
            <input value={captionForm.messageId} onChange={(e) => setCaptionForm((f) => ({ ...f, messageId: e.target.value }))} className={inputCls()} placeholder="e.g. 3EB0..." />
          </div>
          <div>
            <label className={labelCls()}>Media type *</label>
            <select
              value={captionForm.mediaType}
              onChange={(e) => setCaptionForm((f) => ({ ...f, mediaType: e.target.value as CaptionForm['mediaType'] }))}
              className={inputCls()}
            >
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="document">Document</option>
            </select>
          </div>
          <div>
            <label className={labelCls()}>Caption *</label>
            <textarea value={captionForm.caption} onChange={(e) => setCaptionForm((f) => ({ ...f, caption: e.target.value }))} rows={3} className={inputCls('resize-none')} placeholder="New caption text" />
          </div>
        </Modal>
      )}

      {/* Link Preview modal */}
      {activeModal === 'linkPreview' && (
        <Modal title="Custom Link Preview" onClose={closeModal} onSubmit={submitLinkPreview} submitting={modalSubmitting} error={modalError}>
          <div>
            <label className={labelCls()}>Message text *</label>
            <textarea value={linkForm.text} onChange={(e) => setLinkForm((f) => ({ ...f, text: e.target.value }))} rows={2} className={inputCls('resize-none')} placeholder="Message with link" />
          </div>
          <div>
            <label className={labelCls()}>URL *</label>
            <input value={linkForm.url} onChange={(e) => setLinkForm((f) => ({ ...f, url: e.target.value }))} className={inputCls()} placeholder="https://example.com" type="url" />
          </div>
          <div>
            <label className={labelCls()}>Preview title *</label>
            <input value={linkForm.title} onChange={(e) => setLinkForm((f) => ({ ...f, title: e.target.value }))} className={inputCls()} placeholder="Link title" />
          </div>
          <div>
            <label className={labelCls()}>Description (optional)</label>
            <input value={linkForm.description} onChange={(e) => setLinkForm((f) => ({ ...f, description: e.target.value }))} className={inputCls()} placeholder="Short description" />
          </div>
        </Modal>
      )}
    </div>
  );
}

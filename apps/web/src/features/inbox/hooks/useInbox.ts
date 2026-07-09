'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, uploadFile } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import { useInboxSocket } from './useInboxSocket';
import type {
  AdminUser,
  WaAccount,
  ConvSummary,
  ConvDetail,
  Message,
  Filter,
} from '../inbox.types';

type ConfirmAction = { type: 'retract' | 'block'; messageId?: string } | null;

export function useInbox(initialConversationId: string | null) {
  const t = useT(dict);

  // ── Core state ────────────────────────────────────────────────────────────
  const [list, setList] = useState<ConvSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // Remembered across visits — re-picking "Account X" + "hide groups" on every
  // reload is the kind of friction WA itself doesn't impose (its tabs persist too).
  const [accountFilter, setAccountFilter] = useState(() =>
    typeof window === 'undefined' ? '' : localStorage.getItem('sentinel:inbox:accountFilter') ?? '');
  const [excludeGroups, setExcludeGroups] = useState(() =>
    typeof window === 'undefined' ? false : localStorage.getItem('sentinel:inbox:excludeGroups') === 'true');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<{ id: string; title: string; content: string; shortcut: string | null }[]>([]);
  const [followUps, setFollowUps] = useState<{ id: string; scheduledAt: string; messageTemplate: string | null; status: string }[]>([]);
  const [typingCustomer, setTypingCustomer] = useState<{ conversationId: string; phone: string } | null>(null);
  const [quoteMessage, setQuoteMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [msgSearch, setMsgSearch] = useState('');
  const [msgSearchResults, setMsgSearchResults] = useState<Message[]>([]);
  const [msgSearching, setMsgSearching] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [bots, setBots] = useState<Array<{ id: string; botName: string; persona?: { name: string } | null }>>([]);
  const [botSuggestion, setBotSuggestion] = useState<{ botId: string; botName: string; personaName: string | null; reason: string } | null>(null);
  const [assets, setAssets] = useState<Array<{ id: string; title: string; kind: string; purpose: string }>>([]);
  const [assetSuggestions, setAssetSuggestions] = useState<Array<{ id: string; title: string; kind: string; purpose: string; reason: string }>>([]);
  const [dismissedAssets, setDismissedAssets] = useState<Set<string>>(new Set());

  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;

  // ── Reference data ────────────────────────────────────────────────────────
  useEffect(() => {
    api<{ users: AdminUser[] }>('/users')
      .then((d) => setAdmins(d.users))
      .catch(() => setAdmins([]));
  }, []);

  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then(setAccounts)
      .catch((err) => setListError(err instanceof Error ? err.message : t('errLoadAccounts')));
  }, [t]);

  useEffect(() => {
    api<Array<{ id: string; botName: string; persona?: { name: string } | null }>>('/bots')
      .then(setBots)
      .catch(() => setBots([]));
    api<Array<{ id: string; title: string; kind: string; purpose: string }>>('/assets?status=active')
      .then(setAssets)
      .catch(() => setAssets([]));
  }, []);

  useEffect(() => {
    api<{ id: string; title: string; content: string; shortcut: string | null }[]>('/quick-replies')
      .then((r) => setQuickReplies(Array.isArray(r) ? r : []))
      .catch(() => {});
  }, []);

  // Asset suggestions refresh when conversation or message count changes.
  useEffect(() => {
    if (!activeId) { setAssetSuggestions([]); return; }
    api<Array<{ id: string; title: string; kind: string; purpose: string; reason: string }>>(
      `/assets/suggestions?conversationId=${activeId}`,
    ).then(setAssetSuggestions).catch(() => setAssetSuggestions([]));
  }, [activeId, conv?.messages?.length]);

  useEffect(() => {
    localStorage.setItem('sentinel:inbox:accountFilter', accountFilter);
  }, [accountFilter]);

  useEffect(() => {
    localStorage.setItem('sentinel:inbox:excludeGroups', String(excludeGroups));
  }, [excludeGroups]);

  // ── Conversation list ─────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    if (accountFilter) params.set('accountId', accountFilter);
    if (excludeGroups) params.set('excludeGroups', 'true');
    try {
      const data = await api<{ items: ConvSummary[] }>(`/conversations?${params}`);
      setList(data.items);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : t('errLoadConversations'));
    }
  }, [debouncedSearch, accountFilter, excludeGroups, t]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { loadList(); }, [loadList]);

  // ── Active conversation ───────────────────────────────────────────────────
  const loadConv = useCallback(async (id: string) => {
    try {
      const data = await api<ConvDetail & { hasMoreMessages?: boolean; oldestCursor?: string | null }>(`/conversations/${id}`);
      // H3 guard: ignore stale responses from a conversation we've since switched away from.
      // Switch from A (slow) to B (fast), then A's late response overwrites B with A's messages.
      if (activeIdRef.current !== id) return;
      setConv(data);
      setHasMoreMessages(data.hasMoreMessages ?? false);
      setOldestCursor(data.oldestCursor ?? null);
      api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    } catch (err) {
      // A transient reload failure (network blip / 5xx) must NOT wipe the open
      // conversation — that looks like data loss to the operator. Only clear it
      // when the conversation genuinely no longer exists (404). For any other
      // error keep the current view and surface a non-destructive message.
      const status = (err as { status?: number } | null)?.status;
      if (status === 404) setConv(null);
      else setListError(err instanceof Error ? err.message : t('errLoadConversations'));
    }
  }, [t]);

  const loadFollowUps = useCallback(async (convId: string) => {
    try {
      const r = await api<{ id: string; scheduledAt: string; messageTemplate: string | null; status: string }[]>(`/follow-ups?conversationId=${convId}`);
      setFollowUps(Array.isArray(r) ? r : []);
    } catch {
      setFollowUps([]);
    }
  }, []);

  useEffect(() => {
    if (activeId) {
      loadConv(activeId);
      loadFollowUps(activeId);
      // Auto-send read receipt to WhatsApp (blue tick) when admin opens chat.
      api(`/conversations/${activeId}/read`, { method: 'POST' }).catch(() => {});
    } else {
      setConv(null);
      setFollowUps([]);
    }
  }, [activeId, loadConv, loadFollowUps]);

  useEffect(() => {
    setQuoteMessage(null);
    setEditingMessage(null);
  }, [conv?.id]);

  // ── Notifications permission ──────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // ── Socket live updates ───────────────────────────────────────────────────
  // loadListRef/loadConvRef are also consumed by `act` and `approveDraft`
  // below, so they stay here; the socket wiring itself lives in useInboxSocket.
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  const loadConvRef = useRef(loadConv);
  loadConvRef.current = loadConv;

  useInboxSocket({ activeIdRef, loadList, loadConv, setConv, setTypingCustomer });

  // ── Shared action wrapper ─────────────────────────────────────────────────
  // Returns true on success, false if the action itself failed. Previously this
  // had no catch, so a failed star/mute/forward/etc. became an unhandled
  // rejection with no user feedback. A refetch blip after a successful action is
  // treated as non-fatal (we don't report the action as failed).
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setSendError(null);
    let ok = false;
    try {
      await fn();
      ok = true;
      if (activeIdRef.current) await loadConvRef.current(activeIdRef.current);
      await loadListRef.current();
    } catch (err) {
      if (!ok) setSendError(err instanceof Error ? err.message : t('errAction'));
    } finally {
      setBusy(false);
    }
  }, [busy, t]);

  // ── Send message ──────────────────────────────────────────────────────────
  // Single source of truth for account status: the conversation detail's own
  // whatsappAccount (now includes sessionStatus), refreshed live on wa:status.
  // The separately-fetched `accounts` list is only for the start-chat picker.
  const composerBlockedReason = (() => {
    if (!conv) return null;
    const status = conv.whatsappAccount?.sessionStatus;
    if (status === 'banned') return 'composerBlockedBanned' as const;
    if (status === 'disconnected') return 'composerBlockedDisconnected' as const;
    return null;
  })();

  async function sendMessage() {
    if (!activeId || !composer.trim() || sending) return;
    if (composerBlockedReason) { setSendError(t(composerBlockedReason)); return; }
    const text = composer.trim();
    setSending(true);
    setSendError(null);
    try {
      if (editingMessage) {
        await api(`/conversations/${activeId}/messages/${editingMessage.id}`, {
          method: 'PATCH', body: JSON.stringify({ text }),
        });
        setEditingMessage(null);
        setComposer('');
        await loadConv(activeId);
      } else {
        const tempId = `temp-${Date.now()}`;
        const optimistic: Message = {
          id: tempId, senderType: 'admin', content: text, messageType: 'text',
          status: 'pending', aiGenerated: false, createdAt: new Date().toISOString(),
        };
        const quotedId = quoteMessage?.id;
        setConv((prev) => (prev && prev.id === activeId ? { ...prev, messages: [...prev.messages, optimistic] } : prev));
        setQuoteMessage(null);
        setComposer('');
        try {
          await api(`/conversations/${activeId}/messages`, {
            method: 'POST', body: JSON.stringify({ text, quotedMessageId: quotedId }),
          });
          await loadConv(activeId);
        } catch (err) {
          setConv((prev) => (prev && prev.id === activeId
            ? { ...prev, messages: prev.messages.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)) }
            : prev));
          setSendError(err instanceof Error ? err.message : 'Failed to send message');
        }
      }
    } finally {
      setSending(false);
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  function fillTokens(content: string) {
    const name = conv?.customer.name || '';
    const phone = conv?.customer.phoneNumber || '';
    return content.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*phone\s*\}\}/gi, phone);
  }

  const applyQuickReply = (content: string) => {
    const filled = fillTokens(content);
    setComposer((prev) => (prev.trim() ? `${prev} ${filled}` : filled));
  };

  const scheduleFollowUp = async (scheduledAt: string, message: string) => {
    if (!activeId) return;
    await api('/follow-ups', { method: 'POST', body: JSON.stringify({ conversationId: activeId, scheduledAt, message }) });
    await loadFollowUps(activeId);
  };

  const cancelFollowUp = async (id: string) => {
    await api(`/follow-ups/${id}/cancel`, { method: 'PATCH' });
    if (activeId) await loadFollowUps(activeId);
  };

  const takeOver = () => act(() => api(`/conversations/${activeId}/takeover`, { method: 'POST' }));
  const returnToAi = () => act(() => api(`/conversations/${activeId}/return-to-ai`, { method: 'POST' }));
  const escalate = () => act(() => api(`/conversations/${activeId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) }));
  // Approve is optimistic: the backend blocks on the WhatsApp send (typing
  // delay + anti-ban throttle, several seconds), so we DON'T run it through
  // act()'s global busy + full reload. Clear the draft instantly, send in the
  // background, and let the message:new socket event reconcile. Revert on error.
  const approveDraft = async (msgId: string) => {
    const convId = activeIdRef.current;
    if (!convId) return;
    setConv((prev) =>
      prev && prev.id === convId
        ? { ...prev, messages: prev.messages.map((m) => (m.id === msgId ? { ...m, status: 'sent' } : m)) }
        : prev,
    );
    try {
      await api(`/conversations/${convId}/messages/${msgId}/approve`, { method: 'POST' });
      loadListRef.current(); // refresh list ordering/preview, non-blocking
    } catch (err) {
      setConv((prev) =>
        prev && prev.id === convId
          ? { ...prev, messages: prev.messages.map((m) => (m.id === msgId ? { ...m, status: 'pending' } : m)) }
          : prev,
      );
      setSendError(err instanceof Error ? err.message : t('errApproveDraft'));
    }
  };

  // Editing a draft must enter edit mode so submitting PATCHes the existing
  // draft in place (then it can be approved). Previously this only dumped the
  // text into the composer with no edit target, so "send" created a brand-new
  // message and left the stale draft behind — the edit-then-approve flow was
  // unreachable.
  const editDraft = (m: Message) => { setEditingMessage(m); setQuoteMessage(null); setComposer(m.content ?? ''); };
  const quoteReply = (m: Message) => { setQuoteMessage(m); setEditingMessage(null); };
  const editSentMessage = (m: Message) => { setEditingMessage(m); setQuoteMessage(null); setComposer(m.content ?? ''); };

  const deleteMessage = (msgId: string) => { setConfirmAction({ type: 'retract', messageId: msgId }); setHoveredMessageId(null); };
  const confirmDeleteMessage = (msgId: string) => { setConfirmAction(null); act(() => api(`/conversations/${activeId}/messages/${msgId}`, { method: 'DELETE' })); };
  const blockDraftWithConfirm = (msgId: string) => { setConfirmAction({ type: 'block', messageId: msgId }); setHoveredMessageId(null); };
  const confirmBlockDraft = (msgId: string) => { setConfirmAction(null); act(() => api(`/conversations/${activeId}/messages/${msgId}/block`, { method: 'POST' })); };

  const reactToMessage = (msgId: string, emoji: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }));
  const markRead = () => act(() => api(`/conversations/${activeId}/read`, { method: 'POST' }));
  const setAiMode = (aiMode: string) => act(() => api(`/conversations/${activeId}/ai-mode`, { method: 'PATCH', body: JSON.stringify({ aiMode }) }));
  const setBot = (botId: string) => act(() => api(`/conversations/${activeId}/bot`, { method: 'PATCH', body: JSON.stringify({ botId: botId || null }) }));
  const setWorkflowStatus = (status: string) => act(() => api(`/conversations/${activeId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
  const sendAsset = (assetId: string) => act(() => api(`/assets/${assetId}/send`, { method: 'POST', body: JSON.stringify({ conversationId: activeId }) }));
  const dismissAsset = (assetId: string) => setDismissedAssets((prev) => new Set(prev).add(assetId));

  const suggestBot = useCallback(async () => {
    const id = activeIdRef.current;
    if (!id) return;
    setBotSuggestion(null);
    try {
      const s = await api<{ botId: string; botName: string; personaName: string | null; reason: string } | null>(`/learning/conversations/${id}/suggest-bot`);
      setBotSuggestion(s);
    } catch { setBotSuggestion(null); }
  }, []);

  // Proactively fetch a bot-fit suggestion once per conversation when it opens
  // (the backend returns null when there's nothing to suggest, so this is cheap
  // in the common case and avoids the user having to click "suggest").
  const autoSuggestedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    setBotSuggestion(null);
    if (!activeId || autoSuggestedRef.current.has(activeId)) return;
    autoSuggestedRef.current.add(activeId);
    suggestBot();
  }, [activeId, suggestBot]);

  const sendLocation = (raw: string) => act(async () => {
    const [latRaw, lngRaw, ...nameParts] = raw.split(',').map((p) => p.trim());
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    await api(`/conversations/${activeId}/location`, { method: 'POST', body: JSON.stringify({ latitude, longitude, name: nameParts.join(', ') || undefined }) });
  });

  const sendPoll = (raw: string) => act(async () => {
    const [question, ...options] = raw.split('|').map((p) => p.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    await api(`/conversations/${activeId}/poll`, { method: 'POST', body: JSON.stringify({ question, options, selectableCount: 1 }) });
  });

  const sendContactCard = (raw: string) => act(async () => {
    const [name, phone] = raw.split('|').map((p) => p.trim());
    if (!name || !phone) return;
    await api(`/conversations/${activeId}/contacts`, { method: 'POST', body: JSON.stringify({ contacts: [{ name, phone }] }) });
  });

  const setContactBlocked = (blocked: boolean) => act(() => api(`/conversations/${activeId}/${blocked ? 'block-contact' : 'unblock-contact'}`, { method: 'POST' }));
  const setChatMuted = (mute: boolean) => act(() => api(`/conversations/${activeId}/mute`, { method: 'POST', body: JSON.stringify({ mute }) }));
  const setChatArchived = (archive: boolean) => act(() => api(`/conversations/${activeId}/archive`, { method: 'POST', body: JSON.stringify({ archive }) }));
  const setChatPinned = (pin: boolean) => act(() => api(`/conversations/${activeId}/pin`, { method: 'POST', body: JSON.stringify({ pin }) }));
  const clearChat = () => act(() => api(`/conversations/${activeId}/clear-chat`, { method: 'POST' }));
  const setMessageStarred = (messageId: string, star: boolean) => act(() => api(`/conversations/${activeId}/messages/${messageId}/star`, { method: 'POST', body: JSON.stringify({ star }) }));
  const setMessagePinned = (messageId: string, pin: boolean) => act(() => api(`/conversations/${activeId}/messages/${messageId}/pin`, { method: 'POST', body: JSON.stringify({ pin }) }));
  // Dedicated (not via act): a forward lands in a different conversation, so
  // there is nothing in the current timeline to refetch. Returns success so the
  // popover can keep itself open with an error and close only on success.
  const forwardMessage = async (messageId: string, toPhone: string): Promise<boolean> => {
    if (!activeId) return false;
    setSendError(null);
    try {
      await api(`/conversations/${activeId}/messages/${messageId}/forward`, { method: 'POST', body: JSON.stringify({ toPhone }) });
      return true;
    } catch (err) {
      setSendError(err instanceof Error ? err.message : t('errAction'));
      return false;
    }
  };
  const setDisappearing = (enable: boolean, duration = 7 * 24 * 60 * 60) => act(() => api(`/conversations/${activeId}/disappearing-messages`, { method: 'POST', body: JSON.stringify({ enable, duration }) }));
  const saveLabels = (labels: string[]) => act(() => api(`/conversations/${activeId}/labels`, { method: 'PATCH', body: JSON.stringify({ labels }) }));

  const loadOlderMessages = useCallback(async () => {
    if (!activeId || !oldestCursor || loadingOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const res = await api<{ messages: Message[]; hasMore: boolean; oldestCursor: string | null }>(
        `/conversations/${activeId}/messages?before=${encodeURIComponent(oldestCursor)}&limit=50`
      );
      setConv((prev) => prev ? { ...prev, messages: [...(res.messages ?? []), ...prev.messages] } : prev);
      setHasMoreMessages(res.hasMore ?? false);
      setOldestCursor(res.oldestCursor ?? null);
    } catch { /* best-effort */ }
    finally { setLoadingOlderMessages(false); }
  }, [activeId, oldestCursor, loadingOlderMessages]);

  const searchMessages = useCallback(async (q: string) => {
    setMsgSearch(q);
    if (!activeId || !q.trim()) { setMsgSearchResults([]); return; }
    setMsgSearching(true);
    try {
      const res = await api<{ messages: Message[] }>(`/conversations/${activeId}/messages/search?q=${encodeURIComponent(q)}`);
      setMsgSearchResults(res.messages ?? []);
    } catch { setMsgSearchResults([]); }
    finally { setMsgSearching(false); }
  }, [activeId]);

  const validateNumber = async (accountId: string, phone: string) => {
    try {
      const result = await api<{ phoneNumber: string; exists: boolean }>('/conversations/validate-number', {
        method: 'POST', body: JSON.stringify({ accountId, phoneNumber: phone }),
      });
      return t('numberResult', { phone: result.phoneNumber, state: result.exists ? t('numberRegistered') : t('numberNotRegistered') });
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to validate number');
    }
  };

  const startConversation = (accountId: string, phone: string, name: string) => act(async () => {
    if (!accountId || !phone.trim()) return;
    const opened = await api<ConvDetail>('/conversations/start', {
      method: 'POST', body: JSON.stringify({ accountId, phoneNumber: phone.trim(), name: name.trim() || undefined }),
    });
    setActiveId(opened.id);
  });

  // Search the account's synced WhatsApp contact book so the user can pick a
  // contact instead of typing a number from memory.
  const searchContacts = useCallback(async (accountId: string, query: string) => {
    if (!accountId) return [];
    const params = new URLSearchParams({ limit: '8' });
    if (query.trim()) params.set('search', query.trim());
    try {
      const r = await api<{ items: Array<{ phoneNumber: string; name: string | null; notify: string | null; verifiedName: string | null; customer: { name: string | null } | null }> }>(
        `/wa/accounts/${accountId}/contacts?${params}`,
      );
      return r.items.map((c) => ({
        phoneNumber: c.phoneNumber,
        name: c.customer?.name || c.name || c.verifiedName || c.notify || '',
      }));
    } catch {
      return [];
    }
  }, []);

  const assignAdmin = (adminId: string | null) =>
    act(() => api(`/conversations/${activeId}/assign`, { method: 'PATCH', body: JSON.stringify({ adminId }) }));

  const updateNotes = async (notes: string) => {
    if (!activeId) return;
    await api(`/conversations/${activeId}`, { method: 'PATCH', body: JSON.stringify({ customerNotes: notes }) });
    await loadConv(activeId);
  };

  const clearQuote = () => setQuoteMessage(null);
  const clearEdit = () => setEditingMessage(null);

  const handleMediaFile = async (file: File, asSticker = false, viewOnce = false) => {
    if (!activeId || uploadingMedia) return;
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (asSticker) formData.append('asSticker', 'true');
      if (viewOnce) formData.append('viewOnce', 'true');
      await uploadFile(`/conversations/${activeId}/media/upload`, formData);
      if (activeId) await loadConv(activeId);
      await loadList();
    } finally {
      setUploadingMedia(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeAccount = conv?.whatsappAccount;
  const accountDisconnected = activeAccount?.sessionStatus === 'disconnected' || activeAccount?.sessionStatus === 'banned';
  const visibleAssetSuggestions = assetSuggestions.filter((s) => !dismissedAssets.has(s.id));

  return {
    // state
    list, activeId, setActiveId, conv, filter, setFilter, search, setSearch,
    accountFilter, setAccountFilter, excludeGroups, setExcludeGroups,
    composer, setComposer, sending, busy,
    admins, accounts, bots, assets, assetSuggestions: visibleAssetSuggestions,
    quickReplies, followUps,
    typingCustomer, quoteMessage, editingMessage, uploadingMedia,
    hoveredMessageId, setHoveredMessageId,
    showRightPanel, setShowRightPanel,
    confirmAction, setConfirmAction,
    botSuggestion, listError, sendError,
    activeAccount, accountDisconnected, composerBlockedReason,
    t,
    // actions
    clearQuote, clearEdit,
    sendMessage, applyQuickReply, scheduleFollowUp, cancelFollowUp,
    takeOver, returnToAi, escalate, approveDraft, editDraft,
    quoteReply, editSentMessage, deleteMessage, confirmDeleteMessage,
    blockDraftWithConfirm, confirmBlockDraft,
    reactToMessage, markRead, setAiMode, setBot, setWorkflowStatus,
    sendAsset, dismissAsset, suggestBot,
    sendLocation, sendPoll, sendContactCard,
    setContactBlocked, setChatMuted, setChatArchived, setChatPinned, clearChat,
    setMessageStarred, setMessagePinned, forwardMessage, setDisappearing, saveLabels,
    validateNumber, startConversation, searchContacts, assignAdmin, updateNotes, handleMediaFile,
    msgSearch, msgSearchResults, msgSearching, searchMessages,
    hasMoreMessages, loadingOlderMessages, loadOlderMessages,
  };
}

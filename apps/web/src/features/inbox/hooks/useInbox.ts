'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, uploadFile } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import type {
  AdminUser,
  WaAccount,
  ConvSummary,
  ConvDetail,
  Message,
  Filter,
} from '../inbox.types';

type ConfirmAction = { type: 'retract' | 'block'; messageId?: string } | null;

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(600, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch { /* silent */ }
  }
}

export function useInbox(initialConversationId: string | null) {
  const t = useT(dict);

  // ── Core state ────────────────────────────────────────────────────────────
  const [list, setList] = useState<ConvSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(initialConversationId);
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
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

  // ── Conversation list ─────────────────────────────────────────────────────
  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' });
    if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
    try {
      const data = await api<{ items: ConvSummary[] }>(`/conversations?${params}`);
      setList(data.items);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : t('errLoadConversations'));
    }
  }, [debouncedSearch, t]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { loadList(); }, [loadList]);

  // ── Active conversation ───────────────────────────────────────────────────
  const loadConv = useCallback(async (id: string) => {
    try {
      const data = await api<ConvDetail>(`/conversations/${id}`);
      setConv(data);
      api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    } catch {
      setConv(null);
    }
  }, []);

  const loadFollowUps = useCallback(async (convId: string) => {
    try {
      const r = await api<{ id: string; scheduledAt: string; messageTemplate: string | null; status: string }[]>(`/follow-ups?conversationId=${convId}`);
      setFollowUps(Array.isArray(r) ? r : []);
    } catch {
      setFollowUps([]);
    }
  }, []);

  useEffect(() => {
    if (activeId) { loadConv(activeId); loadFollowUps(activeId); }
    else { setConv(null); setFollowUps([]); }
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
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  const loadConvRef = useRef(loadConv);
  loadConvRef.current = loadConv;

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    let listTimer: ReturnType<typeof setTimeout> | null = null;
    let convTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleListReload = () => {
      if (listTimer) clearTimeout(listTimer);
      listTimer = setTimeout(() => loadListRef.current(), 500);
    };
    const scheduleConvReload = () => {
      const curId = activeIdRef.current;
      if (!curId) return;
      if (convTimer) clearTimeout(convTimer);
      convTimer = setTimeout(() => loadConvRef.current(curId), 500);
    };

    const upsert = (conversationId: string, message: Message) => {
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
    };

    const onNew = ({ conversationId, message }: { conversationId: string; message: Message }) => {
      upsert(conversationId, message);
      scheduleListReload();
      if (conversationId === activeIdRef.current) scheduleConvReload();
      if (message.senderType === 'customer') {
        setTypingCustomer((prev) => (prev?.conversationId === conversationId ? null : prev));
      }
      if (
        message.senderType === 'customer' &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (document.hidden || conversationId !== activeIdRef.current)
      ) {
        try {
          new Notification('Customer', {
            body: message.content ? message.content.substring(0, 100) : '[Media message]',
            tag: conversationId,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
          });
          playNotificationSound();
        } catch { /* ignore */ }
      }
    };

    const onDraft = ({ conversationId, message }: { conversationId: string; message: Message }) =>
      upsert(conversationId, message);

    const onDraftRemoved = ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      setConv((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) }
          : prev,
      );

    const onStatus = ({ conversationId, messageId, status }: { conversationId: string; messageId: string; status: string }) =>
      setConv((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, status } : m)) }
          : prev,
      );

    const onMessageUpdated = ({ conversationId, message }: { conversationId: string; message: Message }) =>
      setConv((prev) =>
        prev && prev.id === conversationId
          ? { ...prev, messages: prev.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)) }
          : prev,
      );

    const onConvUpdate = () => { scheduleListReload(); scheduleConvReload(); };

    const onPresence = ({ phone, typing }: { accountId: string; phone: string; typing: boolean }) => {
      setTypingCustomer((prev) => {
        const next = typing
          ? { conversationId: activeIdRef.current ?? '', phone }
          : prev?.phone === phone ? null : prev;
        if (next && prev && next.phone === prev.phone && next.conversationId === prev.conversationId) return prev;
        if (!next && !prev) return prev;
        return next;
      });
    };

    socket.on('message:new', onNew);
    socket.on('message:draft', onDraft);
    socket.on('message:draft-removed', onDraftRemoved);
    socket.on('message:status', onStatus);
    socket.on('message:updated', onMessageUpdated);
    socket.on('conversation:updated', onConvUpdate);
    socket.on('conversation:sla-breach', onConvUpdate);
    socket.on('conversation:sla-cleared', onConvUpdate);
    socket.on('hermes:alert', onConvUpdate);
    socket.on('customer:avatar', onConvUpdate);
    socket.on('wa:presence', onPresence);

    return () => {
      if (listTimer) clearTimeout(listTimer);
      if (convTimer) clearTimeout(convTimer);
      socket.off('message:new', onNew);
      socket.off('message:draft', onDraft);
      socket.off('message:draft-removed', onDraftRemoved);
      socket.off('message:status', onStatus);
      socket.off('message:updated', onMessageUpdated);
      socket.off('conversation:updated', onConvUpdate);
      socket.off('conversation:sla-breach', onConvUpdate);
      socket.off('conversation:sla-cleared', onConvUpdate);
      socket.off('hermes:alert', onConvUpdate);
      socket.off('customer:avatar', onConvUpdate);
      socket.off('wa:presence', onPresence);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shared action wrapper ─────────────────────────────────────────────────
  const act = useCallback(async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (activeIdRef.current) await loadConvRef.current(activeIdRef.current);
      await loadListRef.current();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  // ── Send message ──────────────────────────────────────────────────────────
  const composerBlockedReason = (() => {
    const activeAccount = conv ? accounts.find((a) => a.id === conv.whatsappAccount?.id) : undefined;
    if (!conv) return null;
    if (activeAccount?.sessionStatus === 'banned') return 'composerBlockedBanned' as const;
    if (activeAccount?.sessionStatus === 'disconnected') return 'composerBlockedDisconnected' as const;
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
  const approveDraft = (msgId: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/approve`, { method: 'POST' }));

  const editDraft = (m: Message) => { setComposer(m.content ?? ''); setQuoteMessage(null); setEditingMessage(null); };
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
  const setMessageStarred = (messageId: string, star: boolean) => act(() => api(`/conversations/${activeId}/messages/${messageId}/star`, { method: 'POST', body: JSON.stringify({ star }) }));
  const setDisappearing = (enable: boolean) => act(() => api(`/conversations/${activeId}/disappearing-messages`, { method: 'POST', body: JSON.stringify({ enable, duration: 7 * 24 * 60 * 60 }) }));
  const saveLabels = (labels: string[]) => act(() => api(`/conversations/${activeId}/labels`, { method: 'PATCH', body: JSON.stringify({ labels }) }));

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

  const handleMediaFile = async (file: File) => {
    if (!activeId || uploadingMedia) return;
    setUploadingMedia(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await uploadFile(`/conversations/${activeId}/media/upload`, formData);
      if (activeId) await loadConv(activeId);
      await loadList();
    } finally {
      setUploadingMedia(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const activeAccount = conv ? accounts.find((a) => a.id === conv.whatsappAccount?.id) : undefined;
  const accountDisconnected = activeAccount?.sessionStatus === 'disconnected' || activeAccount?.sessionStatus === 'banned';
  const visibleAssetSuggestions = assetSuggestions.filter((s) => !dismissedAssets.has(s.id));

  return {
    // state
    list, activeId, setActiveId, conv, filter, setFilter, search, setSearch,
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
    setContactBlocked, setChatMuted, setChatArchived, setChatPinned,
    setMessageStarred, setDisappearing, saveLabels,
    validateNumber, startConversation, searchContacts, assignAdmin, updateNotes, handleMediaFile,
  };
}

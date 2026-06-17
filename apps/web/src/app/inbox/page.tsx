'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, uploadFile } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useT } from '@/lib/i18n';
import { dict } from './inbox.i18n';
import {
  ConversationList,
  ChatThread,
  IntelligencePanel,
} from '@/features/inbox/components';


/**
 * Live 3-panel Inbox:
 *   1. conversation queue + filters
 *   2. chat timeline + composer (with AI-draft review controls)
 *   3. customer CRM context, Hermes review, risk flags, knowledge, audit
 *
 * Data comes from the conversations / hermes endpoints and the Socket.IO feed.
 */

interface AdminUser { id: string; name: string }
interface WaAccount { id: string; accountName: string; phoneNumber: string; sessionStatus?: string }

interface Message {
  id: string;
  senderType: 'customer' | 'admin' | 'ai' | 'system' | 'hermes';
  content: string | null;
  messageType: string;
  status: string;
  aiGenerated: boolean;
  createdAt: string;
  mediaUrl?: string | null;
  quotedMessage?: { id: string; content: string | null; senderType: string; messageType: string } | null;
  reactions?: Record<string, string[]> | null;
  editedAt?: string | null;
  deletedAt?: string | null;
  isStarred?: boolean;
}

interface HermesReview {
  id: string;
  decision: string;
  confidenceScore: number;
  riskScore: number;
  riskLevel: string;
  reason: string | null;
  recommendation: string | null;
}

interface ConvSummary {
  id: string;
  aiMode: string;
  takeoverStatus: string;
  status: string;
  slaBreachedAt?: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount?: number;
  isGroup?: boolean;
  groupSubject?: string | null;
  customer: { id: string; name: string | null; phoneNumber: string; leadScore: number; leadStage: string; tags: string[]; avatarUrl?: string | null };
  whatsappAccount: { id: string; accountName: string; phoneNumber: string };
  assignedAdmin?: AdminUser | null;
  messages?: { status: string }[];
}

interface ConvDetail {
  id: string;
  aiMode: string;
  takeoverStatus: string;
  status: string;
  slaBreachedAt?: string | null;
  isArchived?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
  isGroup?: boolean;
  groupSubject?: string | null;
  groupParticipants?: Array<{ jid: string; admin?: string | null }> | null;
  customer: { id: string; name: string | null; phoneNumber: string; leadScore: number; leadStage: string; tags: string[]; notes: string | null; avatarUrl?: string | null };
  whatsappAccount: { id: string; accountName: string; phoneNumber: string; sessionStatus?: string };
  bot: { id: string; botName: string; persona?: { id: string; name: string } | null } | null;
  assignedAdmin?: AdminUser | null;
  labels?: string[];
  messages: Message[];
  hermesReviews: HermesReview[];
}

type Filter = 'all' | 'attention' | 'sla' | 'unassigned';

export default function InboxPage() {
  return (
    <Suspense fallback={<AppLayout><div className="flex-1" /></AppLayout>}>
      <InboxInner />
    </Suspense>
  );
}

function InboxInner() {
  const t = useT(dict);
  const searchParams = useSearchParams();
  const [list, setList] = useState<ConvSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('conversation'));
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
  const [confirmAction, setConfirmAction] = useState<{ type: 'retract' | 'block'; messageId?: string } | null>(null);
  const [bots, setBots] = useState<Array<{ id: string; botName: string; persona?: { name: string } | null }>>([]);
  const [botSuggestion, setBotSuggestion] = useState<{ botId: string; botName: string; personaName: string | null; reason: string } | null>(null);
  const [assets, setAssets] = useState<Array<{ id: string; title: string; kind: string; purpose: string }>>([]);
  const [assetSuggestions, setAssetSuggestions] = useState<Array<{ id: string; title: string; kind: string; purpose: string; reason: string }>>([]);
  const [dismissedAssets, setDismissedAssets] = useState<Set<string>>(new Set());
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;

  // ── Data loading ───────────────────────────────────────────────────
  useEffect(() => {
    api<{ users: AdminUser[] }>('/users')
      .then((d) => setAdmins(d.users))
      .catch(() => setAdmins([]));
  }, []);

  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then((items) => setAccounts(items))
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

  // Per-conversation asset suggestions, refreshed when a new message arrives.
  useEffect(() => {
    if (!activeId) {
      setAssetSuggestions([]);
      return;
    }
    api<Array<{ id: string; title: string; kind: string; purpose: string; reason: string }>>(
      `/assets/suggestions?conversationId=${activeId}`,
    )
      .then(setAssetSuggestions)
      .catch(() => setAssetSuggestions([]));
  }, [activeId, conv?.messages?.length]);

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

  // Refs to always hold the latest callbacks so the socket useEffect never
  // needs to re-run just because loadList/loadConv changed.
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  const loadConvRef = useRef(loadConv);
  loadConvRef.current = loadConv;

  // Debounce the search box into a server-side query.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { loadList(); }, [loadList]);

  // Play notification sound (simple beep using Web Audio API)
  function playNotificationSound() {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Two beeps: high then low
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);

      oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.15);
      oscillator.start(audioContext.currentTime + 0.15);
      oscillator.stop(audioContext.currentTime + 0.25);
    } catch {
      // Fallback: try using an audio element if Web Audio fails
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAAB9AAACABAAZGF0YQIAAAAAAA==');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch {
        // Silent fallback if all audio methods fail
      }
    }
  }

  // Ask once for browser notification permission so inbound messages can alert
  // the agent when the tab is in the background.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  useEffect(() => {
    api<{ id: string; title: string; content: string; shortcut: string | null }[]>('/quick-replies')
      .then((r) => setQuickReplies(Array.isArray(r) ? r : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (activeId) {
      loadConv(activeId);
      loadFollowUps(activeId);
    } else {
      setConv(null);
      setFollowUps([]);
    }
  }, [activeId, loadConv, loadFollowUps]);

  // Reset the composer's quote/edit state when switching conversations.
  useEffect(() => {
    setQuoteMessage(null);
    setEditingMessage(null);
  }, [conv?.id]);

  // ── Live updates ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    // Coalesce bursts of live events (e.g. WhatsApp history sync fires many
    // message:new at once) so we don't flood the API and trip rate limits.
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
      // Clear typing indicator if this customer just sent a message.
      if (message.senderType === 'customer') {
        setTypingCustomer((prev) => (prev?.conversationId === conversationId ? null : prev));
      }
      // Notify when an inbound customer message arrives and the agent isn't
      // already looking at that chat (tab hidden or a different conversation open).
      if (
        message.senderType === 'customer' &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (document.hidden || conversationId !== activeIdRef.current)
      ) {
        try {
          const customerName = active?.customer.name || active?.customer.phoneNumber || 'Customer';
          const preview = message.content ? message.content.substring(0, 100) : '[Media message]';
          new Notification(customerName, {
            body: preview,
            tag: conversationId,
            icon: '/icon.png',
            badge: '/badge.png'
          });
          // Play notification sound
          playNotificationSound();
        } catch {
          /* ignore notification failures */
        }
      }
    };
    const onDraft = ({ conversationId, message }: { conversationId: string; message: Message }) => upsert(conversationId, message);
    const onDraftRemoved = ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      setConv((prev) => (prev && prev.id === conversationId ? { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) } : prev));
    const onStatus = ({ conversationId, messageId, status }: { conversationId: string; messageId: string; status: string }) =>
      setConv((prev) => (prev && prev.id === conversationId ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, status } : m)) } : prev));
    const onMessageUpdated = ({ conversationId, message }: { conversationId: string; message: Message }) =>
      setConv((prev) => (prev && prev.id === conversationId ? { ...prev, messages: prev.messages.map((m) => (m.id === message.id ? { ...m, ...message } : m)) } : prev));
    const onConvUpdate = () => {
      scheduleListReload();
      scheduleConvReload();
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

    // Customer typing indicator from Baileys presence updates.
    // Only show for the currently active conversation.
    const onPresence = ({ phone, typing }: { accountId: string; phone: string; typing: boolean }) => {
      setTypingCustomer((prev) => {
        const next = typing ? { conversationId: activeIdRef.current ?? '', phone } : (prev?.phone === phone ? null : prev);
        // Avoid triggering a re-render if the value hasn't changed.
        if (next && prev && next.phone === prev.phone && next.conversationId === prev.conversationId) return prev;
        if (!next && !prev) return prev;
        return next;
      });
    };
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

  // ── Actions ────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!activeId || !composer.trim() || sending) return;
    if (composerBlockedReason) {
      setSendError(t(composerBlockedReason));
      return;
    }
    const text = composer.trim();
    setSending(true);
    setSendError(null);
    try {
      if (editingMessage) {
        await api(`/conversations/${activeId}/messages/${editingMessage.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ text }),
        });
        setEditingMessage(null);
        setComposer('');
        await loadConv(activeId);
      } else {
        // Optimistic: show the message immediately as pending, then reconcile.
        const tempId = `temp-${Date.now()}`;
        const optimistic: Message = {
          id: tempId,
          senderType: 'admin',
          content: text,
          messageType: 'text',
          status: 'pending',
          aiGenerated: false,
          createdAt: new Date().toISOString(),
        };
        const quotedId = quoteMessage?.id;
        setConv((prev) => (prev && prev.id === activeId ? { ...prev, messages: [...prev.messages, optimistic] } : prev));
        setQuoteMessage(null);
        setComposer('');
        try {
          await api(`/conversations/${activeId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ text, quotedMessageId: quotedId }),
          });
          await loadConv(activeId);
        } catch (err) {
          // Keep the message visible but mark it failed so the agent can retry.
          setConv((prev) => (prev && prev.id === activeId ? { ...prev, messages: prev.messages.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)) } : prev));
          setSendError(err instanceof Error ? err.message : 'Failed to send message');
        }
      }
    } finally {
      setSending(false);
    }
  }

  function fillTokens(content: string) {
    const name = active?.customer.name || '';
    const phone = active?.customer.phoneNumber || '';
    return content.replace(/\{\{\s*name\s*\}\}/gi, name).replace(/\{\{\s*phone\s*\}\}/gi, phone);
  }

  function applyQuickReply(content: string) {
    const filled = fillTokens(content);
    setComposer((prev) => (prev.trim() ? `${prev} ${filled}` : filled));
  }

  async function scheduleFollowUp(scheduledAt: string, message: string) {
    if (!activeId) return;
    await api('/follow-ups', {
      method: 'POST',
      body: JSON.stringify({ conversationId: activeId, scheduledAt, message }),
    });
    await loadFollowUps(activeId);
  }

  async function cancelFollowUp(id: string) {
    await api(`/follow-ups/${id}/cancel`, { method: 'PATCH' });
    if (activeId) await loadFollowUps(activeId);
  }

  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      if (activeId) await loadConv(activeId);
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  const takeOver = () => act(() => api(`/conversations/${activeId}/takeover`, { method: 'POST' }));
  const returnToAi = () => act(() => api(`/conversations/${activeId}/return-to-ai`, { method: 'POST' }));
  const escalate = () => act(() => api(`/conversations/${activeId}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'pending' }) }));
  const approveDraft = (msgId: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/approve`, { method: 'POST' }));
  const editDraft = (m: Message) => {
    setComposer(m.content ?? '');
    setQuoteMessage(null);
    setEditingMessage(null);
  };

  const quoteReply = (m: Message) => {
    setQuoteMessage(m);
    setEditingMessage(null);
  };

  const editSentMessage = (m: Message) => {
    setEditingMessage(m);
    setQuoteMessage(null);
    setComposer(m.content ?? '');
  };

  const deleteMessage = (msgId: string) => {
    setConfirmAction({ type: 'retract', messageId: msgId });
    setHoveredMessageId(null);
  };
  const confirmDeleteMessage = (msgId: string) => {
    setConfirmAction(null);
    act(() => api(`/conversations/${activeId}/messages/${msgId}`, { method: 'DELETE' }));
  };
  const blockDraftWithConfirm = (msgId: string) => {
    setConfirmAction({ type: 'block', messageId: msgId });
    setHoveredMessageId(null);
  };
  const confirmBlockDraft = (msgId: string) => {
    setConfirmAction(null);
    act(() => api(`/conversations/${activeId}/messages/${msgId}/block`, { method: 'POST' }));
  };
  const reactToMessage = (msgId: string, emoji: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }));
  const markRead = () => act(() => api(`/conversations/${activeId}/read`, { method: 'POST' }));
  const setAiMode = (aiMode: string) => act(() => api(`/conversations/${activeId}/ai-mode`, { method: 'PATCH', body: JSON.stringify({ aiMode }) }));
  const setBot = (botId: string) => act(() => api(`/conversations/${activeId}/bot`, { method: 'PATCH', body: JSON.stringify({ botId: botId || null }) }));
  const setWorkflowStatus = (status: string) => act(() => api(`/conversations/${activeId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
  const sendAsset = (assetId: string) => act(() => api(`/assets/${assetId}/send`, { method: 'POST', body: JSON.stringify({ conversationId: activeId }) }));
  const dismissAsset = (assetId: string) => setDismissedAssets((prev) => new Set(prev).add(assetId));
  const suggestBot = async () => {
    if (!activeId) return;
    setBotSuggestion(null);
    try {
      const s = await api<{ botId: string; botName: string; personaName: string | null; reason: string } | null>(`/learning/conversations/${activeId}/suggest-bot`);
      setBotSuggestion(s);
    } catch {
      setBotSuggestion(null);
    }
  };
  // raw = "lat,lng,optional name"
  const sendLocation = (raw: string) => act(async () => {
    const [latRaw, lngRaw, ...nameParts] = raw.split(',').map((part) => part.trim());
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    await api(`/conversations/${activeId}/location`, {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, name: nameParts.join(', ') || undefined }),
    });
  });
  // raw = "question | option 1 | option 2 ..."
  const sendPoll = (raw: string) => act(async () => {
    const [question, ...options] = raw.split('|').map((part) => part.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    await api(`/conversations/${activeId}/poll`, {
      method: 'POST',
      body: JSON.stringify({ question, options, selectableCount: 1 }),
    });
  });
  // raw = "name | phone"
  const sendContactCard = (raw: string) => act(async () => {
    const [name, phone] = raw.split('|').map((part) => part.trim());
    if (!name || !phone) return;
    await api(`/conversations/${activeId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ contacts: [{ name, phone }] }),
    });
  });
  const setContactBlocked = (blocked: boolean) => act(() => api(`/conversations/${activeId}/${blocked ? 'block-contact' : 'unblock-contact'}`, { method: 'POST' }));
  const setChatMuted = (mute: boolean) => act(() => api(`/conversations/${activeId}/mute`, { method: 'POST', body: JSON.stringify({ mute }) }));
  const setChatArchived = (archive: boolean) => act(() => api(`/conversations/${activeId}/archive`, { method: 'POST', body: JSON.stringify({ archive }) }));
  const setChatPinned = (pin: boolean) => act(() => api(`/conversations/${activeId}/pin`, { method: 'POST', body: JSON.stringify({ pin }) }));
  const setMessageStarred = (messageId: string, star: boolean) => act(() => api(`/conversations/${activeId}/messages/${messageId}/star`, { method: 'POST', body: JSON.stringify({ star }) }));
  const setDisappearing = (enable: boolean) => act(() => api(`/conversations/${activeId}/disappearing-messages`, { method: 'POST', body: JSON.stringify({ enable, duration: 7 * 24 * 60 * 60 }) }));
  const saveLabels = (labels: string[]) => act(() => api(`/conversations/${activeId}/labels`, {
    method: 'PATCH',
    body: JSON.stringify({ labels }),
  }));

  const validateNumber = async (accountId: string, phone: string) => {
    try {
      const result = await api<{ phoneNumber: string; exists: boolean }>('/conversations/validate-number', {
        method: 'POST',
        body: JSON.stringify({ accountId, phoneNumber: phone }),
      });
      return t('numberResult', { phone: result.phoneNumber, state: result.exists ? t('numberRegistered') : t('numberNotRegistered') });
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to validate number');
    }
  };

  const startConversation = (accountId: string, phone: string, name: string) => act(async () => {
    if (!accountId || !phone.trim()) return;
    const opened = await api<ConvDetail>('/conversations/start', {
      method: 'POST',
      body: JSON.stringify({ accountId, phoneNumber: phone.trim(), name: name.trim() || undefined }),
    });
    setActiveId(opened.id);
  });

  const assignAdmin = (adminId: string | null) =>
    act(() => api(`/conversations/${activeId}/assign`, { method: 'PATCH', body: JSON.stringify({ adminId }) }));

  async function handleMediaFile(file: File) {
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
  }

  const active = conv;
  const activeAccount = active ? accounts.find((a) => a.id === active.whatsappAccount?.id) : undefined;
  const accountDisconnected = activeAccount?.sessionStatus === 'disconnected' || activeAccount?.sessionStatus === 'banned';
  const composerBlockedReason = !active
    ? null
    : activeAccount?.sessionStatus === 'banned'
      ? 'composerBlockedBanned'
      : accountDisconnected
        ? 'composerBlockedDisconnected'
        : null;

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 gap-2 bg-gray-100 px-2 sm:px-3 dark:bg-gray-950 overflow-hidden">

        {/* -- Panel 1: queue (via ConversationList) -------------------- */}
        <ConversationList
          conversations={list}
          accounts={accounts}
          activeId={activeId}
          onSelect={setActiveId}
          onStartChat={startConversation}
          onValidateNumber={validateNumber}
          error={listError}
          filter={filter}
          onFilterChange={setFilter}
          searchValue={search}
          onSearchChange={setSearch}
        />



        {/* -- Panel 2: timeline + composer (via ChatThread) ---------- */}
        <ChatThread
          conversation={conv}
          loading={busy}
          composerValue={composer}
          quoteMessage={quoteMessage}
          editingMessage={editingMessage}
          onSendMessage={sendMessage}
          onComposerChange={setComposer}
          onReactMessage={async (id, emoji) => reactToMessage(id, emoji)}
          onDeleteMessage={async (id) => deleteMessage(id)}
          onUploadFile={handleMediaFile}
          onSendLocation={sendLocation}
          onSendPoll={sendPoll}
          onSendContacts={sendContactCard}
          quickReplies={quickReplies}
          onApplyQuickReply={applyQuickReply}
          sendError={sendError}
          assets={assets}
          assetSuggestions={assetSuggestions.filter((s) => !dismissedAssets.has(s.id))}
          onSendAsset={sendAsset}
          onDismissAsset={dismissAsset}
          customerTyping={!!typingCustomer && typingCustomer.phone === conv?.customer.phoneNumber}
          conversationActions={{
            onMarkRead: markRead,
            onReturnToAi: returnToAi,
            onEscalate: escalate,
            onToggleMute: setChatMuted,
            onToggleArchive: setChatArchived,
            onTogglePin: setChatPinned,
            onToggleBlock: setContactBlocked,
            onToggleDisappearing: setDisappearing,
          }}
          onBack={() => setActiveId(null)}
          onShowDetails={() => setShowRightPanel(!showRightPanel)}
          onClearQuote={() => setQuoteMessage(null)}
          onClearEdit={() => setEditingMessage(null)}
          hoveredMessageId={hoveredMessageId}
          onHoverMessageEnter={(messageId) => setHoveredMessageId(messageId)}
          onHoverMessageExit={() => setHoveredMessageId(null)}
          onReplyToMessage={quoteReply}
          onEditMessage={editSentMessage}
          onStarMessage={setMessageStarred}
        />


        {/* -- Panel 3: CRM + Hermes (via IntelligencePanel) ---------- */}
        <IntelligencePanel
          conversation={conv}
          draftMessage={conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending') || null}
          bots={bots}
          approvingDraft={busy}
          blockingDraft={busy}
          loadingControls={busy}
          onApproveDraft={async () => {
            const draftMsg = conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending');
            if (draftMsg) approveDraft(draftMsg.id);
          }}
          onBlockDraft={async () => {
            const draftMsg = conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending');
            if (draftMsg) blockDraftWithConfirm(draftMsg.id);
          }}
          onTakeover={async () => takeOver()}
          onSetAiMode={async (mode) => setAiMode(mode)}
          onSetStatus={async (status) => setWorkflowStatus(status)}
          onSetBot={async (botId) => setBot(botId || '')}
          onEditDraft={() => {
            const draftMsg = conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending');
            if (draftMsg) editDraft(draftMsg);
          }}
          onUpdateNotes={async (notes) => {
            if (activeId) {
              await api(`/conversations/${activeId}`, {
                method: 'PATCH',
                body: JSON.stringify({ customerNotes: notes }),
              });
              await loadConv(activeId);
            }
          }}
          onSuggestBot={suggestBot}
          botSuggestion={botSuggestion}
          admins={admins}
          onAssignAdmin={async (adminId) => assignAdmin(adminId)}
          onSaveLabels={saveLabels}
          followUps={followUps}
          onScheduleFollowUp={scheduleFollowUp}
          onCancelFollowUp={cancelFollowUp}
          open={showRightPanel}
          onClose={() => setShowRightPanel(false)}
        />
      </div>

      {/* Destructive-action confirmation (retract message / block AI draft) */}
      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'block' ? t('confirmBlockTitle') : t('confirmRetractTitle')}
        description={confirmAction?.type === 'block' ? t('confirmBlockBody') : t('confirmRetractBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
              {t('confirmCancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (!confirmAction?.messageId) return;
                if (confirmAction.type === 'block') confirmBlockDraft(confirmAction.messageId);
                else confirmDeleteMessage(confirmAction.messageId);
              }}
            >
              {confirmAction?.type === 'block' ? t('confirmBlockAction') : t('confirmRetractAction')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {confirmAction?.type === 'block' ? t('confirmBlockBody') : t('confirmRetractBody')}
        </p>
      </Modal>
    </AppLayout>
  );
}

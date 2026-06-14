'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  ShieldCheck,
  TriangleAlert,
  Hand,
  Pencil,
  CircleCheck,
  ArrowUpRight,
  ArrowLeft,
  FileSearch,
  Send,
  Workflow,
  ScrollText,
  History,
  Clock,
  CircleX,
  RotateCcw,
  Inbox as InboxIcon,
  Paperclip,
  UserRound,
  UserX,
  Image as ImageIcon,
  FileText,
  Video,
  Tag,
  CheckCheck,
  Check,
  Zap,
  CalendarClock,
  UserPlus,
  PhoneCall,
} from 'lucide-react';
import { api, uploadFile } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusLabel, type StatusKind } from '@/components/ui/StatusLabel';
import { WhatsAppMark } from '@/components/WhatsAppMark';
import { cn } from '@/lib/cn';

/**
 * Live 3-panel Inbox:
 *   1. conversation queue + filters
 *   2. chat timeline + composer (with AI-draft review controls)
 *   3. customer CRM context, Hermes review, risk flags, knowledge, audit
 *
 * Data comes from the conversations / hermes endpoints and the Socket.IO feed.
 */

interface AdminUser { id: string; name: string }
interface WaAccount { id: string; accountName: string; phoneNumber: string }

interface Message {
  id: string;
  senderType: 'customer' | 'admin' | 'ai' | 'system' | 'hermes';
  content: string | null;
  messageType: string;
  status: string;
  aiGenerated: boolean;
  createdAt: string;
  quotedMessage?: { id: string; content: string | null; senderType: string; messageType: string } | null;
  reactions?: Record<string, string[]> | null;
  editedAt?: string | null;
  deletedAt?: string | null;
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
  customer: { id: string; name: string | null; phoneNumber: string; leadScore: number; leadStage: string; tags: string[] };
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
  customer: { id: string; name: string | null; phoneNumber: string; leadScore: number; leadStage: string; tags: string[]; notes: string | null };
  whatsappAccount: { id: string; accountName: string; phoneNumber: string };
  bot: { id: string; botName: string } | null;
  assignedAdmin?: AdminUser | null;
  labels?: string[];
  messages: Message[];
  hermesReviews: HermesReview[];
}

type Filter = 'all' | 'attention' | 'sla' | 'unassigned';

const filters: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'sla', label: 'SLA risk' },
  { key: 'unassigned', label: 'Unassigned' },
];

const aiModeLabel: Record<string, string> = {
  ai_on: 'AI ON',
  ai_off: 'AI OFF',
  ai_draft: 'AI Draft',
  ai_supervised: 'AI Supervised',
  ai_paused: 'AI Paused',
};


const aiModeOptions = [
  { value: 'ai_on', label: 'AI on' },
  { value: 'ai_off', label: 'AI off' },
  { value: 'ai_draft', label: 'AI draft' },
  { value: 'ai_supervised', label: 'AI supervised' },
  { value: 'ai_paused', label: 'AI paused' },
];

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'pending', label: 'Pending' },
  { value: 'resolved', label: 'Resolved' },
];

const reactionOptions = [
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '❤️', label: 'Heart' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '🙏', label: 'Thanks' },
];

const riskTone: Record<string, 'success' | 'review' | 'danger'> = {
  low: 'success',
  medium: 'review',
  high: 'review',
  critical: 'danger',
};

function initials(name: string | null, phone: string): string {
  const base = name?.trim() || phone;
  return base.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// WhatsApp-style delivery ticks for outbound (admin/AI) messages.
function StatusTick({ status }: { status: string }) {
  if (status === 'pending') return <Clock className="h-3 w-3" strokeWidth={2} aria-label="pending" />;
  if (status === 'failed') return <TriangleAlert className="h-3 w-3 text-danger-200" strokeWidth={2} aria-label="failed to send" />;
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5 text-sky-300" strokeWidth={2.25} aria-label="read" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-label="delivered" />;
  return <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-label="sent" />;
}

// Per-conversation status label for the queue rows.
function summaryStatus(c: ConvSummary): StatusKind {
  if (c.aiMode === 'ai_paused') return 'sending-blocked';
  if (c.takeoverStatus === 'admin_takeover') return 'human-takeover';
  if (c.takeoverStatus === 'waiting_admin') return 'needs-review';
  if (c.aiMode === 'ai_on' || c.aiMode === 'ai_supervised') return 'ai-generated';
  return 'sent';
}

export default function InboxPage() {
  return (
    <Suspense fallback={<AppLayout><div className="flex-1" /></AppLayout>}>
      <InboxInner />
    </Suspense>
  );
}

function InboxInner() {
  const searchParams = useSearchParams();
  const [list, setList] = useState<ConvSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('conversation'));
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<{ id: string; title: string; content: string; shortcut: string | null }[]>([]);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduleMsg, setScheduleMsg] = useState('');
  const [scheduleErr, setScheduleErr] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<{ id: string; scheduledAt: string; messageTemplate: string | null; status: string }[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [quoteMessage, setQuoteMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const [startAccountId, setStartAccountId] = useState('');
  const [startPhone, setStartPhone] = useState('');
  const [startName, setStartName] = useState('');
  const [startResult, setStartResult] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const reasoningRef = useRef<HTMLDivElement>(null);
  const auditRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ───────────────────────────────────────────────────
  useEffect(() => {
    api<{ users: AdminUser[] }>('/users')
      .then((d) => {
        setAdmins(d.users);
        setAdminError(null);
      })
      .catch((err) => setAdminError(err instanceof Error ? err.message : 'Failed to load team users from API'));
  }, []);

  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then((items) => {
        setAccounts(items);
        if (items[0]) setStartAccountId((current) => current || items[0].id);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : 'Failed to load WhatsApp accounts from API'));
  }, []);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' });
    if (debounced.trim()) params.set('search', debounced.trim());
    try {
      const data = await api<{ items: ConvSummary[] }>(`/conversations?${params}`);
      setList(data.items);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load conversations from API');
    }
  }, [debounced]);

  const loadConv = useCallback(async (id: string) => {
    try {
      const data = await api<ConvDetail>(`/conversations/${id}`);
      setConv(data);
      setDetailError(null);
      api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    } catch (err) {
      setConv(null);
      setDetailError(err instanceof Error ? err.message : 'Failed to load conversation from API');
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
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadList(); }, [loadList]);

  // Ask once for browser notification permission so inbound messages can alert
  // the agent when the tab is in the background.
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // Close the schedule modal on Escape (a11y).
  useEffect(() => {
    if (!showSchedule) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSchedule(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showSchedule]);

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

  useEffect(() => {
    setLabelDraft(conv?.labels?.join(', ') ?? '');
    setQuoteMessage(null);
    setEditingMessage(null);
  }, [conv?.id, conv?.labels]);

  // Auto-scroll the timeline on new messages.
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [conv?.messages.length]);

  // ── Live updates ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    setLiveConnected(socket.connected);
    const onConnect = () => setLiveConnected(true);
    const onDisconnect = () => setLiveConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    // Coalesce bursts of live events (e.g. WhatsApp history sync fires many
    // message:new at once) so we don't flood the API and trip rate limits.
    let listTimer: ReturnType<typeof setTimeout> | null = null;
    let convTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleListReload = () => {
      if (listTimer) clearTimeout(listTimer);
      listTimer = setTimeout(() => loadList(), 500);
    };
    const scheduleConvReload = () => {
      if (!activeId) return;
      if (convTimer) clearTimeout(convTimer);
      convTimer = setTimeout(() => loadConv(activeId), 500);
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
      // Notify when an inbound customer message arrives and the agent isn't
      // already looking at that chat (tab hidden or a different conversation open).
      if (
        message.senderType === 'customer' &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted' &&
        (document.hidden || conversationId !== activeId)
      ) {
        try {
          new Notification('New WhatsApp message', { body: message.content ?? 'New message', tag: conversationId });
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
    const onConvUpdate = () => {
      scheduleListReload();
      scheduleConvReload();
    };

    socket.on('message:new', onNew);
    socket.on('message:draft', onDraft);
    socket.on('message:draft-removed', onDraftRemoved);
    socket.on('message:status', onStatus);
    socket.on('conversation:updated', onConvUpdate);
    socket.on('conversation:sla-breach', onConvUpdate);
    socket.on('conversation:sla-cleared', onConvUpdate);
    socket.on('hermes:alert', onConvUpdate);
    return () => {
      if (listTimer) clearTimeout(listTimer);
      if (convTimer) clearTimeout(convTimer);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onNew);
      socket.off('message:draft', onDraft);
      socket.off('message:draft-removed', onDraftRemoved);
      socket.off('message:status', onStatus);
      socket.off('conversation:updated', onConvUpdate);
      socket.off('conversation:sla-breach', onConvUpdate);
      socket.off('conversation:sla-cleared', onConvUpdate);
      socket.off('hermes:alert', onConvUpdate);
    };
  }, [activeId, loadConv, loadList]);

  // ── Actions ────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!activeId || !composer.trim() || sending) return;
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
    setShowQuickReplies(false);
  }

  async function scheduleFollowUp() {
    if (!activeId || !scheduleAt || !scheduleMsg.trim()) return;
    setScheduleErr(null);
    try {
      await api('/follow-ups', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeId,
          scheduledAt: new Date(scheduleAt).toISOString(),
          message: scheduleMsg.trim(),
        }),
      });
      setScheduleMsg('');
      setScheduleAt('');
      setShowSchedule(false);
      await loadFollowUps(activeId);
    } catch (err) {
      setScheduleErr(err instanceof Error ? err.message : 'Failed to schedule message');
    }
  }

  async function cancelFollowUp(id: string) {
    try {
      await api(`/follow-ups/${id}/cancel`, { method: 'PATCH' });
      if (activeId) await loadFollowUps(activeId);
    } catch {
      /* ignore */
    }
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
  const blockDraft = (msgId: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/block`, { method: 'POST' }));
  const editDraft = (m: Message) => {
    setComposer(m.content ?? '');
    setQuoteMessage(null);
    setEditingMessage(null);
    composerRef.current?.focus();
  };

  const quoteReply = (m: Message) => {
    setQuoteMessage(m);
    setEditingMessage(null);
    composerRef.current?.focus();
  };

  const editSentMessage = (m: Message) => {
    setEditingMessage(m);
    setQuoteMessage(null);
    setComposer(m.content ?? '');
    composerRef.current?.focus();
  };

  const deleteMessage = (msgId: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}`, { method: 'DELETE' }));
  const clearReaction = (msgId: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji: '' }) }));
  const reactToMessage = (msgId: string, emoji: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }));
  const markRead = () => act(() => api(`/conversations/${activeId}/read`, { method: 'POST' }));
  const setAiMode = (aiMode: string) => act(() => api(`/conversations/${activeId}/ai-mode`, { method: 'PATCH', body: JSON.stringify({ aiMode }) }));
  const setWorkflowStatus = (status: string) => act(() => api(`/conversations/${activeId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }));
  const saveLabels = () => act(() => api(`/conversations/${activeId}/labels`, {
    method: 'PATCH',
    body: JSON.stringify({ labels: labelDraft.split(',').map((label) => label.trim()).filter(Boolean) }),
  }));

  const validateNumber = () => act(async () => {
    if (!startAccountId || !startPhone.trim()) return;
    const result = await api<{ phoneNumber: string; exists: boolean }>('/conversations/validate-number', {
      method: 'POST',
      body: JSON.stringify({ accountId: startAccountId, phoneNumber: startPhone.trim() }),
    });
    setStartResult(`${result.phoneNumber} is ${result.exists ? 'registered' : 'not registered'} on WhatsApp`);
  });

  const startConversation = () => act(async () => {
    if (!startAccountId || !startPhone.trim()) return;
    const opened = await api<ConvDetail>('/conversations/start', {
      method: 'POST',
      body: JSON.stringify({ accountId: startAccountId, phoneNumber: startPhone.trim(), name: startName.trim() || undefined }),
    });
    setActiveId(opened.id);
    setStartResult('Conversation opened from API');
    setStartPhone('');
    setStartName('');
  });

  const assignAdmin = (adminId: string | null) =>
    act(() => {
      setShowAssign(false);
      return api(`/conversations/${activeId}/assign`, { method: 'PATCH', body: JSON.stringify({ adminId }) });
    });

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

  // ── Client-side chip filtering ─────────────────────────────────────
  const visible = list.filter((c) => {
    if (filter === 'attention') return c.takeoverStatus === 'waiting_admin' || c.aiMode === 'ai_paused';
    if (filter === 'sla') return !!c.slaBreachedAt;
    if (filter === 'unassigned') return !c.assignedAdmin;
    return true;
  });

  const active = conv;
  const takenOver = active?.takeoverStatus === 'admin_takeover';
  const review = active?.hermesReviews?.[0] ?? null;

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 bg-gray-100 p-3 dark:bg-gray-950">
        {/* ── Panel 1: queue ──────────────────────────────────────── */}
        <section className={cn('w-full shrink-0 flex-col rounded-l border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:flex md:w-72 xl:w-80', activeId ? 'hidden' : 'flex')}>
          <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2 dark:border-gray-800">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === f.key
                    ? 'bg-hermes-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="border-b border-gray-100 p-3 dark:border-gray-800">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200">
              <UserPlus className="h-3.5 w-3.5 text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
              Start WhatsApp chat
            </div>
            <div className="space-y-2">
              <select
                value={startAccountId}
                onChange={(e) => setStartAccountId(e.target.value)}
                className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="">Select account from API</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.accountName} ({account.phoneNumber})</option>
                ))}
              </select>
              <input
                value={startPhone}
                onChange={(e) => setStartPhone(e.target.value)}
                placeholder="Phone number"
                className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                value={startName}
                onChange={(e) => setStartName(e.target.value)}
                placeholder="Name from customer record"
                className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={validateNumber} disabled={busy || !startAccountId || !startPhone.trim()}>
                  <PhoneCall className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Validate
                </Button>
                <Button size="sm" onClick={startConversation} disabled={busy || !startAccountId || !startPhone.trim()}>
                  <WhatsAppMark className="h-4 w-4" />
                  Open
                </Button>
              </div>
              {startResult && <p className="text-xs text-gray-500 dark:text-gray-400">{startResult}</p>}
            </div>
          </div>

          <ul className="scrollbar-thin flex-1 overflow-y-auto">
            {listError ? (
              <li className="px-4 py-10 text-center text-sm text-danger-600">{listError}</li>
            ) : visible.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-400">No conversations returned by API</li>
            )}
            {visible.map((c) => {
              const isActive = c.id === activeId;
              const name = c.customer.name || c.customer.phoneNumber;
              return (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={cn(
                      'flex w-full gap-3 border-b border-gray-100 px-3 py-3 text-left transition-colors dark:border-gray-800',
                      isActive ? 'bg-hermes-50/70 dark:bg-hermes-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                    )}
                  >
                    <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {initials(c.customer.name, c.customer.phoneNumber)}
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-white bg-channel-500 text-white dark:border-gray-900" title="WhatsApp" aria-label="WhatsApp channel"><WhatsAppMark className="h-2.5 w-2.5" /></span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{name}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{relTime(c.lastMessageAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{c.lastMessage ?? 'No messages yet'}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <StatusLabel kind={summaryStatus(c)} />
                        {!!c.unreadCount && c.unreadCount > 0 && (
                          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-hermes-600 px-1 text-[10px] font-semibold text-white">{c.unreadCount}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Panel 2: timeline + composer ───────────────────────────── */}
        <section className={cn('operations-surface relative min-w-0 flex-1 flex-col border-y border-gray-200 dark:border-gray-800', activeId ? 'flex' : 'hidden md:flex')}>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-gray-400">
              <InboxIcon className="mb-2 h-7 w-7 text-gray-300" strokeWidth={1.5} aria-hidden="true" />
              <p className={cn('text-sm', detailError && 'text-danger-600')}>
                {detailError ?? 'Select a conversation to begin.'}
              </p>
            </div>
          ) : (
            <>
              <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={() => setActiveId(null)}
                    className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 md:hidden"
                    title="Back to conversations"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-[13px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {initials(active.customer.name, active.customer.phoneNumber)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {active.customer.name || active.customer.phoneNumber}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Badge tone="channel">
                        <WhatsAppMark className="h-3 w-3" />
                        WhatsApp
                      </Badge>
                      <span>{active.whatsappAccount.accountName}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-400"
                    title={liveConnected ? 'Realtime connected' : 'Realtime reconnecting…'}
                  >
                    <span className={cn('h-2 w-2 rounded-full', liveConnected ? 'bg-channel-500' : 'animate-pulse bg-review-500')} />
                    <span className="hidden sm:inline">{liveConnected ? 'Live' : 'Reconnecting…'}</span>
                  </span>
                  <Badge tone="hermes">
                    <Workflow className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {aiModeLabel[active.aiMode] ?? active.aiMode}
                  </Badge>
                  <Button variant="outline" size="sm" onClick={markRead} disabled={busy}>
                    <CheckCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Mark Read
                  </Button>
                  {takenOver ? (
                    <Button variant="outline" size="sm" onClick={returnToAi} disabled={busy}>
                      <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Return to AI
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={takeOver} disabled={busy}>
                      <Hand className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      Take Over
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={escalate} disabled={busy}>
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Escalate
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowSchedule(true); setScheduleErr(null); }}>
                    <CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Schedule
                  </Button>
                </div>
              </div>

              <div ref={timelineRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-5">
                {active.messages.map((m) => {
                  const isCustomer = m.senderType === 'customer';
                  const isDraft = m.senderType === 'ai' && m.status === 'pending';
                  if (isDraft) {
                    return (
                      <div key={m.id} className="flex justify-end">
                        <div className="w-[68%] rounded-lg border border-hermes-200 bg-hermes-50 p-3 dark:border-hermes-800 dark:bg-hermes-900/30">
                          <div className="mb-2 flex items-center gap-2">
                            <StatusLabel kind="ai-generated" />
                            <StatusLabel kind="needs-review" />
                          </div>
                          <p className="text-[13px] leading-relaxed text-gray-800 dark:text-gray-100">{m.content}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => approveDraft(m.id)} disabled={busy}>
                              <CircleCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              Approve &amp; Send
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => editDraft(m)}>
                              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              Edit Draft
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => blockDraft(m.id)} disabled={busy} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
                              <CircleX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              Block Send
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}>
                      <div
                        className={cn(
                          'max-w-[68%] rounded-lg px-3 py-2 text-[13px] leading-relaxed shadow-card',
                          isCustomer
                            ? 'rounded-tl-sm bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                            : 'rounded-tr-sm bg-hermes-600 text-white',
                        )}
                      >
                        {m.deletedAt && (
                          <span className="mb-1 block text-[10px] font-medium text-danger-100">Message revoked</span>
                        )}
                        {m.quotedMessage && (
                          <div className={cn('mb-1 rounded border-l-2 px-2 py-1 text-[11px]', isCustomer ? 'border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-700/60' : 'border-hermes-200 bg-hermes-700/40 text-hermes-100')}>
                            Reply to {m.quotedMessage.senderType}: {m.quotedMessage.content ?? m.quotedMessage.messageType}
                          </div>
                        )}
                        {m.aiGenerated && !isCustomer && (
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-hermes-100">
                            <Workflow className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            AI generated
                          </span>
                        )}
                        <MediaContent message={m} />
                        {m.editedAt && <span className={cn('mt-1 block text-[10px]', isCustomer ? 'text-gray-400' : 'text-hermes-100')}>Edited</span>}
                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                          <span className={cn('mt-1 block text-[10px]', isCustomer ? 'text-gray-400' : 'text-hermes-100')}>
                            Reactions: {Object.keys(m.reactions).join(' ')}
                          </span>
                        )}
                        <div className={cn('mt-1 flex items-center justify-between gap-2 text-[10px] tabular-nums', isCustomer ? 'text-gray-400' : 'text-hermes-100')}>
                          <div className="flex items-center gap-2">
                            {m.id.startsWith('temp-') ? (
                              <span>{m.status === 'failed' ? 'Not sent' : 'Sending…'}</span>
                            ) : (
                            <>
                            <button type="button" onClick={() => quoteReply(m)} className="hover:underline">Reply</button>
                            {!isCustomer && !m.deletedAt && <button type="button" onClick={() => editSentMessage(m)} className="hover:underline">Edit</button>}
                            {!m.deletedAt && <button type="button" onClick={() => deleteMessage(m.id)} className="hover:underline">Revoke</button>}
                            {!m.deletedAt && (
                              <span className="inline-flex items-center gap-1" aria-label="React to message">
                                {reactionOptions.map((reaction) => (
                                  <button
                                    key={reaction.emoji}
                                    type="button"
                                    onClick={() => reactToMessage(m.id, reaction.emoji)}
                                    className="rounded px-1 hover:bg-white/20"
                                    aria-label={`React with ${reaction.label}`}
                                    title={`React with ${reaction.label}`}
                                  >
                                    {reaction.emoji}
                                  </button>
                                ))}
                              </span>
                            )}
                            {m.reactions && Object.keys(m.reactions).length > 0 && <button type="button" onClick={() => clearReaction(m.id)} className="hover:underline">Clear reaction</button>}
                            </>
                            )}
                          </div>
                          <span className="flex items-center gap-1">
                            {clockTime(m.createdAt)}
                            {!isCustomer && <StatusTick status={m.status} />}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                {sendError && (
                  <div className="mb-2 flex items-center justify-between rounded border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700 dark:border-danger-800 dark:bg-danger-900/30 dark:text-danger-300">
                    <span>{sendError}</span>
                    <button type="button" onClick={() => setSendError(null)} className="font-semibold">Dismiss</button>
                  </div>
                )}
                {(quoteMessage || editingMessage) && (
                  <div className="mb-2 flex items-center justify-between rounded border border-hermes-200 bg-hermes-50 px-3 py-2 text-xs text-hermes-700 dark:border-hermes-800 dark:bg-hermes-900/30 dark:text-hermes-300">
                    <span>
                      {editingMessage ? 'Editing sent message' : `Replying to ${quoteMessage?.senderType}`}: {(editingMessage ?? quoteMessage)?.content ?? (editingMessage ?? quoteMessage)?.messageType}
                    </span>
                    <button type="button" onClick={() => { setQuoteMessage(null); setEditingMessage(null); setComposer(''); }} className="font-semibold">Cancel</button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      title="Quick replies"
                      onClick={() => setShowQuickReplies((v) => !v)}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    >
                      <Zap className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    {showQuickReplies && (
                      <div className="absolute bottom-11 left-0 z-20 max-h-72 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
                        {quickReplies.length === 0 ? (
                          <p className="px-3 py-4 text-center text-xs text-gray-400">No quick replies. Add them under Templates.</p>
                        ) : (
                          quickReplies.map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              onClick={() => applyQuickReply(q.content)}
                              className="block w-full rounded px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              <span className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-800 dark:text-gray-100">
                                {q.shortcut && <span className="rounded bg-hermes-50 px-1 text-[10px] text-hermes-700 dark:bg-hermes-900/40 dark:text-hermes-300">/{q.shortcut}</span>}
                                {q.title}
                              </span>
                              <span className="mt-0.5 block truncate text-[11px] text-gray-500 dark:text-gray-400">{q.content}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    title="Attach media"
                    disabled={uploadingMedia}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                  >
                    {uploadingMedia
                      ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-hermes-500" />
                      : <Paperclip className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    }
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleMediaFile(f);
                      e.target.value = '';
                    }}
                  />
                  <textarea
                    ref={composerRef}
                    rows={1}
                    value={composer}
                    onChange={(e) => {
                      const v = e.target.value;
                      // Expand "/shortcut " into the quick reply content as you type.
                      const m = v.match(/^\/(\S+)\s$/);
                      if (m) {
                        const qr = quickReplies.find((q) => q.shortcut?.toLowerCase() === m[1].toLowerCase());
                        if (qr) { setComposer(fillTokens(qr.content)); return; }
                      }
                      setComposer(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder={editingMessage ? 'Edit sent message through Baileys' : quoteMessage ? 'Reply with quoted message context' : 'Write a reply, or edit the AI draft above'}
                    className="scrollbar-thin max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <Button size="md" onClick={sendMessage} disabled={sending || !composer.trim()}>
                    <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {editingMessage ? 'Save Edit' : 'Send'}
                  </Button>
                </div>
              </div>

              {showSchedule && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSchedule(false)}>
                  <div role="dialog" aria-modal="true" aria-labelledby="schedule-title" className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-700 dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
                    <h3 id="schedule-title" className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                      <CalendarClock className="h-4 w-4 text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
                      Schedule a message
                    </h3>
                    <label htmlFor="schedule-at" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Send at</label>
                    <input
                      id="schedule-at"
                      type="datetime-local"
                      autoFocus
                      value={scheduleAt}
                      onChange={(e) => setScheduleAt(e.target.value)}
                      className="mb-3 w-full rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[13px] text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                    <label htmlFor="schedule-msg" className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Message</label>
                    <textarea
                      id="schedule-msg"
                      rows={3}
                      value={scheduleMsg}
                      onChange={(e) => setScheduleMsg(e.target.value)}
                      placeholder="Message to send automatically at the scheduled time"
                      className="mb-2 w-full resize-none rounded border border-gray-200 bg-gray-50 px-2 py-1.5 text-[13px] text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {scheduleErr && <p className="mb-2 text-xs text-danger-600">{scheduleErr}</p>}
                    {followUps.filter((f) => f.status === 'scheduled').length > 0 && (
                      <div className="mb-3 space-y-1 border-t border-gray-100 pt-2 dark:border-gray-800">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Scheduled</p>
                        {followUps.filter((f) => f.status === 'scheduled').map((f) => (
                          <div key={f.id} className="flex items-center justify-between gap-2 text-[12px] text-gray-600 dark:text-gray-300">
                            <span className="min-w-0 flex-1 truncate">{new Date(f.scheduledAt).toLocaleString()} — {f.messageTemplate}</span>
                            <button type="button" onClick={() => cancelFollowUp(f.id)} className="shrink-0 text-danger-600 hover:underline">Cancel</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowSchedule(false)}>Close</Button>
                      <Button size="sm" onClick={scheduleFollowUp} disabled={!scheduleAt || !scheduleMsg.trim()}>
                        <CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                        Schedule
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── Panel 3: CRM + Hermes review + audit ───────────────────── */}
        {active && (
          <aside className="hidden w-80 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex">
            <div className="scrollbar-thin flex-1 overflow-y-auto">
              {/* Customer */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => reasoningRef.current?.scrollIntoView({ block: 'nearest' })}
                  >
                    <FileSearch className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    View Reasoning
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => auditRef.current?.scrollIntoView({ block: 'nearest' })}
                  >
                    <ScrollText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    View Audit Trail
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {initials(active.customer.name, active.customer.phoneNumber)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{active.customer.name || 'Unnamed'}</p>
                    <p className="truncate text-xs text-gray-400">{active.customer.phoneNumber}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                    <p className="text-gray-400">Stage</p>
                    <p className="font-medium capitalize text-gray-800 dark:text-gray-100">{active.customer.leadStage.replace('_', ' ')}</p>
                  </div>
                  <div className="rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                    <p className="text-gray-400">Lead score</p>
                    <p className="font-medium tabular-nums text-gray-800 dark:text-gray-100">{active.customer.leadScore} / 100</p>
                  </div>
                </div>
                {active.customer.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {active.customer.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
                  </div>
                )}
              </div>


              {/* Baileys controls */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <Tag className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  WhatsApp native controls
                </h3>
                <div className="space-y-2 text-xs">
                  <label className="block text-gray-500">
                    AI mode
                    <select value={active.aiMode} onChange={(e) => setAiMode(e.target.value)} className="mt-1 h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      {aiModeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-gray-500">
                    Workflow status
                    <select value={active.status} onChange={(e) => setWorkflowStatus(e.target.value)} className="mt-1 h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-gray-500">
                    Labels from API
                    <div className="mt-1 flex gap-2">
                      <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} placeholder="priority, renewal, billing" className="h-8 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <Button size="sm" variant="outline" onClick={saveLabels} disabled={busy}>Save</Button>
                    </div>
                  </label>
                </div>
              </div>

              {/* Assigned admin */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                    <UserRound className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                    Assigned to
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAssign((v) => !v)}
                    className="text-[11px] font-medium text-hermes-600 hover:text-hermes-700"
                  >
                    {showAssign ? 'Cancel' : 'Change'}
                  </button>
                </div>
                {adminError && <p className="mb-2 text-xs text-danger-600">{adminError}</p>}
                {showAssign ? (
                  <div className="space-y-1">
                    <button
                      onClick={() => assignAdmin(null)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10"
                    >
                      <UserX className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                      Unassign
                    </button>
                    {admins.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => assignAdmin(a.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200',
                          active.assignedAdmin?.id === a.id
                            ? 'bg-hermes-50 font-medium text-hermes-700 dark:bg-hermes-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800',
                        )}
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                          {(a.name || '?')[0].toUpperCase()}
                        </span>
                        {a.name || a.id}
                      </button>
                    ))}
                  </div>
                ) : active.assignedAdmin ? (
                  <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-hermes-100 text-[11px] font-semibold text-hermes-700 dark:bg-hermes-900/40 dark:text-hermes-300">
                      {(active.assignedAdmin.name || '?')[0].toUpperCase()}
                    </span>
                    {active.assignedAdmin.name}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">Unassigned</p>
                )}
              </div>

              {/* Hermes review */}
              <div ref={reasoningRef} className="border-b border-gray-100 p-4 dark:border-gray-800">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                    <ShieldCheck className="h-4 w-4 text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
                    Hermes AI review
                  </h3>
                  {review && (
                    <Badge tone={riskTone[review.riskLevel] ?? 'neutral'}>{review.decision.replace('_', ' ')}</Badge>
                  )}
                </div>
                {review ? (
                  <>
                    <dl className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-400">Review score</dt>
                        <dd className="font-medium tabular-nums text-gray-800 dark:text-gray-100">{review.confidenceScore}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-400">Risk</dt>
                        <dd className="font-medium tabular-nums text-gray-800 dark:text-gray-100">{review.riskScore}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-400">Risk level</dt>
                        <dd className="font-medium capitalize text-gray-800 dark:text-gray-100">{review.riskLevel}</dd>
                      </div>
                    </dl>
                    {review.reason && (
                      <div className="mt-2.5 rounded-md bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        <div className="mb-1 flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200">
                          <FileSearch className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          Hermes reasoning
                        </div>
                        {review.reason}
                      </div>
                    )}
                    {review.recommendation && (
                      <p className="mt-1.5 text-xs text-gray-500">Recommendation: {review.recommendation}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400">No Hermes review for this conversation yet.</p>
                )}
              </div>

              {/* Risk flags */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">Risk flags</h3>
                <div className="flex flex-wrap gap-1.5">
                  {active.slaBreachedAt && (
                    <Badge tone="review">
                      <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      SLA breached
                    </Badge>
                  )}
                  {active.aiMode === 'ai_paused' && (
                    <Badge tone="danger">
                      <CircleX className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      AI paused
                    </Badge>
                  )}
                  {review && (review.riskLevel === 'high' || review.riskLevel === 'critical') && (
                    <Badge tone="danger">
                      <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {review.riskLevel} risk
                    </Badge>
                  )}
                  {!active.slaBreachedAt && active.aiMode !== 'ai_paused' && !(review && (review.riskLevel === 'high' || review.riskLevel === 'critical')) && (
                    <span className="text-xs text-gray-400">No active flags.</span>
                  )}
                </div>
              </div>

              {/* Answering bot */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <Workflow className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  Automation mode
                </h3>
                {active.bot ? (
                  <div className="flex items-center justify-between rounded-md border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-700">
                    <span className="truncate text-gray-700 dark:text-gray-200">{active.bot.botName}</span>
                    <Badge tone="success">Active</Badge>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No automation bot assigned.</p>
                )}
              </div>

              {/* Audit timeline (derived from message facts) */}
              <div ref={auditRef} className="p-4">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <ScrollText className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  View Audit Trail
                </h3>
                <ol className="space-y-3 text-xs">
                  {buildAudit(active).map((e, i) => {
                    const Icon = e.icon;
                    return (
                      <li key={i} className="flex gap-2.5">
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', e.tone)} strokeWidth={1.75} aria-hidden="true" />
                        <div className="flex-1">
                          <p className="text-gray-700 dark:text-gray-200">{e.label}</p>
                          {e.time && <p className="text-gray-400">{clockTime(e.time)}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>

            <div className="border-t border-gray-100 p-3 dark:border-gray-800">
              <Button variant="ghost" size="sm" className="w-full justify-start" onClick={escalate} disabled={busy}>
                <FileSearch className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Escalate to a supervisor
              </Button>
            </div>
          </aside>
        )}
      </div>
    </AppLayout>
  );
}

// Render message content: text, or a media placeholder for non-text types.
function MediaContent({ message: m }: { message: Message }) {
  if (m.messageType === 'image') {
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <ImageIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {m.content ?? 'Image'}
      </span>
    );
  }
  if (m.messageType === 'video') {
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <Video className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {m.content ?? 'Video'}
      </span>
    );
  }
  if (m.messageType === 'document' || m.messageType === 'audio') {
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <FileText className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {m.content ?? m.messageType}
      </span>
    );
  }
  return <p>{m.content ?? <span className="italic opacity-70">[{m.messageType}]</span>}</p>;
}

// Build a small, truthful audit trail from what the conversation actually shows.
function buildAudit(conv: ConvDetail) {
  const out: { label: string; time: string | null; icon: typeof Workflow; tone: string }[] = [];
  const firstAi = conv.messages.find((m) => m.aiGenerated);
  if (firstAi) out.push({ label: 'AI generated a reply', time: firstAi.createdAt, icon: Workflow, tone: 'text-hermes-600' });
  if (conv.hermesReviews[0]) out.push({ label: `Hermes ${conv.hermesReviews[0].decision.replace('_', ' ')}`, time: null, icon: ShieldCheck, tone: 'text-review-600' });
  if (conv.takeoverStatus === 'admin_takeover') out.push({ label: 'Human took over', time: null, icon: Hand, tone: 'text-gray-500' });
  if (conv.assignedAdmin) out.push({ label: `Assigned to ${conv.assignedAdmin.name}`, time: null, icon: Hand, tone: 'text-gray-500' });
  if (out.length === 0) out.push({ label: 'No supervised actions yet', time: null, icon: History, tone: 'text-gray-400' });
  return out;
}

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
  FileSearch,
  Send,
  Workflow,
  Phone,
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
} from 'lucide-react';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusLabel, type StatusKind } from '@/components/ui/StatusLabel';
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

interface Message {
  id: string;
  senderType: 'customer' | 'admin' | 'ai' | 'system' | 'hermes';
  content: string | null;
  messageType: string;
  status: string;
  aiGenerated: boolean;
  createdAt: string;
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
  const [showAssign, setShowAssign] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data loading ───────────────────────────────────────────────────
  useEffect(() => {
    api<{ users: AdminUser[] }>('/users').then((d) => setAdmins(d.users)).catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' });
    if (debounced.trim()) params.set('search', debounced.trim());
    const data = await api<{ items: ConvSummary[] }>(`/conversations?${params}`).catch(() => ({ items: [] }));
    setList(data.items);
  }, [debounced]);

  const loadConv = useCallback(async (id: string) => {
    const data = await api<ConvDetail>(`/conversations/${id}`).catch(() => null);
    setConv(data);
    api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (activeId) loadConv(activeId);
    else setConv(null);
  }, [activeId, loadConv]);

  // Auto-scroll the timeline on new messages.
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [conv?.messages.length]);

  // ── Live updates ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    const upsert = (conversationId: string, message: Message) => {
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        if (prev.messages.some((m) => m.id === message.id)) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
    };
    const onNew = ({ conversationId, message }: { conversationId: string; message: Message }) => {
      upsert(conversationId, message);
      loadList();
    };
    const onDraft = ({ conversationId, message }: { conversationId: string; message: Message }) => upsert(conversationId, message);
    const onDraftRemoved = ({ conversationId, messageId }: { conversationId: string; messageId: string }) =>
      setConv((prev) => (prev && prev.id === conversationId ? { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) } : prev));
    const onStatus = ({ conversationId, messageId, status }: { conversationId: string; messageId: string; status: string }) =>
      setConv((prev) => (prev && prev.id === conversationId ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, status } : m)) } : prev));
    const onConvUpdate = () => {
      loadList();
      if (activeId) loadConv(activeId);
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
    setSending(true);
    try {
      await api(`/conversations/${activeId}/messages`, { method: 'POST', body: JSON.stringify({ text: composer.trim() }) });
      setComposer('');
      await loadConv(activeId);
    } finally {
      setSending(false);
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
    timelineRef.current?.querySelector('textarea')?.focus();
  };

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
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'}/conversations/${activeId}/media/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error('Upload failed');
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
      <div className="flex h-full min-h-0 flex-1">
        {/* ── Panel 1: queue ──────────────────────────────────────── */}
        <section className="flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:w-80">
          <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations"
                className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 pl-8 pr-3 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-gray-100 px-2 py-2 dark:border-gray-800">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={cn(
                  'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === f.key
                    ? 'bg-hermes-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <ul className="scrollbar-thin flex-1 overflow-y-auto">
            {visible.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-400">No conversations</li>
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
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-channel-500 dark:border-gray-900" title="WhatsApp" aria-label="WhatsApp channel" />
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
        <section className="flex min-w-0 flex-1 flex-col bg-gray-50 dark:bg-gray-950">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-gray-400">
              <InboxIcon className="mb-2 h-7 w-7 text-gray-300" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-sm">Select a conversation to begin.</p>
            </div>
          ) : (
            <>
              <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-[13px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {initials(active.customer.name, active.customer.phoneNumber)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {active.customer.name || active.customer.phoneNumber}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Badge tone="channel">
                        <Phone className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                        WhatsApp
                      </Badge>
                      <span>{active.whatsappAccount.accountName}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="hermes">
                    <Workflow className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {aiModeLabel[active.aiMode] ?? active.aiMode}
                  </Badge>
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
                              Block
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
                          'max-w-[68%] rounded-lg border px-3 py-2 text-[13px] leading-relaxed shadow-card',
                          isCustomer
                            ? 'border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
                            : 'border-hermes-700 bg-hermes-700 text-white',
                        )}
                      >
                        {m.aiGenerated && !isCustomer && (
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-hermes-100">
                            <Workflow className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            AI generated
                          </span>
                        )}
                        <MediaContent message={m} />
                        <span className={cn('mt-1 block text-right text-[10px] tabular-nums', isCustomer ? 'text-gray-400' : 'text-hermes-100')}>
                          {clockTime(m.createdAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="shrink-0 border-t border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex items-end gap-2">
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
                    rows={1}
                    value={composer}
                    onChange={(e) => setComposer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Write a reply, or edit the AI draft above"
                    className="scrollbar-thin max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <Button size="md" onClick={sendMessage} disabled={sending || !composer.trim()}>
                    <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    Send
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── Panel 3: CRM + Hermes review + audit ───────────────────── */}
        {active && (
          <aside className="hidden w-80 shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 lg:flex">
            <div className="scrollbar-thin flex-1 overflow-y-auto">
              {/* Customer */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
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
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
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
                        <dt className="text-gray-400">Review signal</dt>
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
                      <p className="mt-2.5 rounded-md bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {review.reason}
                      </p>
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
                  <p className="text-xs text-gray-400">No automation profile assigned.</p>
                )}
              </div>

              {/* Audit timeline (derived from message facts) */}
              <div className="p-4">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <History className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  Audit timeline
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

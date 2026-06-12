'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api, uploadFile, resolveMediaUrl, getUserId } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Sidebar } from '@/components/Sidebar';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  name: string | null;
  phoneNumber: string;
  leadScore: number;
  leadStage: string;
  tags: string[];
  notes: string | null;
  avatarUrl?: string | null;
}

interface QuotedMessage {
  id: string;
  content: string | null;
  senderType: string;
  messageType: string;
}

interface Message {
  id: string;
  senderType: 'customer' | 'admin' | 'ai' | 'system' | 'hermes';
  content: string | null;
  mediaUrl: string | null;
  messageType: string;
  status: string;
  aiGenerated: boolean;
  createdAt: string;
  quotedMessageId?: string | null;
  quotedMessage?: QuotedMessage | null;
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

interface AdminUser {
  id: string;
  name: string;
}

interface QuickReply {
  id: string;
  title: string;
  content: string;
  shortcut: string | null;
}

interface ConvSummary {
  id: string;
  aiMode: string;
  takeoverStatus: string;
  status: string;
  slaBreachedAt?: string | null;
  labels?: string[];
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount?: number;
  customer: { id: string; name: string | null; phoneNumber: string; leadScore: number; leadStage: string; tags: string[]; avatarUrl?: string | null };
  whatsappAccount: { id: string; accountName: string; phoneNumber: string };
  assignedAdmin?: AdminUser | null;
  messages: { content: string | null; senderType: string; createdAt: string; status: string }[];
}

interface ConvDetail {
  id: string;
  aiMode: string;
  takeoverStatus: string;
  status: string;
  slaBreachedAt?: string | null;
  labels?: string[];
  csatScore?: number | null;
  customer: Customer & { status: string | null };
  whatsappAccount: { id: string; accountName: string; phoneNumber: string };
  bot: { id: string; botName: string } | null;
  assignedAdmin?: AdminUser | null;
  messages: Message[];
  hermesReviews: HermesReview[];
  hasMoreMessages?: boolean;
  oldestCursor?: string | null;
}

type FilterTab = 'all' | 'ai_on' | 'ai_off' | 'ai_supervised' | 'needs_attention';

interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus?: string;
}

interface FollowUp {
  id: string;
  conversationId: string;
  scheduledAt: string;
  message: string;
  status: 'pending' | 'sent' | 'cancelled';
  sentAt: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function aiModeBadge(mode: string) {
  const map: Record<string, { label: string; cls: string }> = {
    ai_on: { label: 'AI ON', cls: 'bg-green-700 text-green-100' },
    ai_off: { label: 'AI OFF', cls: 'bg-gray-300 dark:bg-gray-600 text-gray-900 dark:text-gray-100' },
    ai_draft: { label: 'Draft', cls: 'bg-yellow-700 text-yellow-100' },
    ai_supervised: { label: 'Supervised', cls: 'bg-blue-700 text-blue-100' },
    ai_paused: { label: 'Paused', cls: 'bg-red-700 text-red-100' },
  };
  const { label, cls } = map[mode] ?? { label: mode, cls: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: 'Open', cls: 'bg-emerald-900 text-emerald-200' },
    pending: { label: 'Pending', cls: 'bg-yellow-900 text-yellow-200' },
    resolved: { label: 'Resolved', cls: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100' };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>
  );
}

/** Short display label for who sent a (quoted) message. */
function senderLabel(senderType: string, customerName?: string | null) {
  if (senderType === 'customer') return customerName || 'Customer';
  if (senderType === 'ai') return 'AI';
  return 'Anda';
}

function decisionBadge(decision: string) {
  const map: Record<string, string> = {
    approve: 'bg-green-700',
    draft: 'bg-yellow-700',
    block: 'bg-red-700',
    pause_ai: 'bg-orange-700',
    takeover_required: 'bg-purple-700',
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[decision] ?? 'bg-gray-200 dark:bg-gray-700'}`}>
      {decision.replace('_', ' ')}
    </span>
  );
}

/** Short notification beep via Web Audio (no asset bundling needed). */
function playBeep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
    osc.onended = () => ctx.close();
  } catch {
    // audio is best-effort
  }
}

/** Beep + browser notification for a new inbound message. */
function notifyInbound(title: string, body: string) {
  playBeep();
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'hermes-inbound' });
    }
  } catch {
    // notifications are best-effort
  }
}

/** WhatsApp-style delivery ticks for an outgoing message. */
/** Round contact avatar with a coloured initials fallback. */
function Avatar({ name, phone, url, size = 40 }: { name?: string | null; phone?: string; url?: string | null; size?: number }) {
  const label = (name || phone || '?').trim();
  const initials = label.replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '#';
  const resolved = resolveMediaUrl(url) ?? (url && url.startsWith('http') ? url : null);
  const palette = ['bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-teal-500'];
  const hue = palette[(label.charCodeAt(0) || 0) % palette.length];
  return resolved ? (
    <img src={resolved} alt={label} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${hue}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

const REACTION_CHOICES = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function StatusTicks({ status }: { status: string }) {
  if (status === 'read') return <span className="text-sky-400" title="Dibaca">✓✓</span>;
  if (status === 'delivered') return <span className="opacity-60" title="Terkirim ke device">✓✓</span>;
  if (status === 'sent') return <span className="opacity-60" title="Terkirim">✓</span>;
  if (status === 'failed') return <span className="text-red-400" title="Gagal">!</span>;
  return <span className="opacity-40" title="Menunggu">🕓</span>;
}

function fmtTime(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString('id', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('id', { day: '2-digit', month: 'short' });
}

const leadColors: Record<string, string> = {
  cold: 'text-blue-400',
  warm: 'text-yellow-400',
  hot: 'text-orange-400',
  very_hot: 'text-red-400',
};

// ── Toast ──────────────────────────────────────────────────────────────────────

function Toast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-xs rounded-lg bg-yellow-700 p-3 text-sm shadow-lg">
      <div className="flex items-start gap-2">
        <span className="flex-1">{msg}</span>
        <button onClick={onDismiss} className="text-yellow-200 hover:text-white">✕</button>
      </div>
    </div>
  );
}

// ── Left Panel ─────────────────────────────────────────────────────────────────

function LeftPanel({
  conversations,
  selectedId,
  onSelect,
  onFilterChange,
  onSearchChange,
  filter,
  search,
  accounts,
  accountId,
  onAccountChange,
  statusFilter,
  onStatusFilterChange,
  labelFilter,
  onLabelFilterChange,
  onNewChat,
  onPin,
  onArchive,
  onMute,
  onMarkUnread,
  onDeleteWaChat,
}: {
  conversations: ConvSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFilterChange: (f: FilterTab) => void;
  onSearchChange: (s: string) => void;
  filter: FilterTab;
  search: string;
  accounts: WaAccount[];
  accountId: string;
  onAccountChange: (id: string) => void;
  statusFilter: string;
  onStatusFilterChange: (s: string) => void;
  labelFilter: string;
  onLabelFilterChange: (s: string) => void;
  onNewChat: () => void;
  onPin: (id: string, pin: boolean) => void;
  onArchive: (id: string, archive: boolean) => void;
  onMute: (id: string, mute: boolean) => void;
  onMarkUnread: (id: string) => void;
  onDeleteWaChat: (id: string) => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'ai_on', label: 'AI ON' },
    { key: 'ai_off', label: 'AI OFF' },
    { key: 'ai_supervised', label: 'Supervised' },
    { key: 'needs_attention', label: '⚠ Perlu Perhatian' },
  ];

  return (
    <aside className="flex w-80 flex-col border-r border-gray-200 dark:border-black/40 bg-white dark:bg-wa-panel">
      {/* Header */}
      <div className="border-b border-gray-200 dark:border-black/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-wa-accent">Percakapan</h2>
          {/* New chat — WhatsApp desktop style */}
          <button
            onClick={onNewChat}
            title="Chat baru"
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-wa-accent text-white transition-colors hover:bg-wa-accent/90"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        {/* Account switcher — filter the list by WhatsApp account */}
        <select
          value={accountId}
          onChange={(e) => onAccountChange(e.target.value)}
          className="mb-2 w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1.5 text-sm outline-none"
          title="Pilih akun WhatsApp"
        >
          <option value="">Semua Akun ({accounts.length})</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.accountName} · {a.phoneNumber}
            </option>
          ))}
        </select>
        {/* Workflow status filter (open/pending/resolved) */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="mb-2 w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1.5 text-sm outline-none"
          title="Filter status percakapan"
        >
          <option value="">Semua Status</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
        </select>
        <input
          type="text"
          placeholder="Filter label (mis. refund)"
          value={labelFilter}
          onChange={(e) => onLabelFilterChange(e.target.value)}
          className="mb-2 w-full rounded bg-black/5 dark:bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-gray-500"
        />
        <input
          type="text"
          placeholder="Cari nama / nomor..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-gray-500"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 dark:border-black/30 px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onFilterChange(t.key)}
            className={`shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
              filter === t.key ? 'bg-wa-accent text-black' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="p-4 text-xs text-gray-500">Tidak ada percakapan</p>
        )}
        {conversations.map((c) => {
          const lastMsg = c.messages[0];
          const needsAttention =
            c.takeoverStatus === 'waiting_admin' || c.aiMode === 'ai_paused' || !!c.slaBreachedAt;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtxMenu({ id: c.id, x: e.clientX, y: e.clientY });
              }}
              className={`w-full border-b border-gray-100 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:border-black/20 dark:hover:bg-black/20 ${
                selectedId === c.id ? 'bg-wa-accent/10 dark:bg-black/30' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <Avatar name={c.customer.name} phone={c.customer.phoneNumber} url={c.customer.avatarUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {c.customer.name ?? c.customer.phoneNumber}
                    </span>
                    {needsAttention && (
                      <span className="shrink-0 text-xs text-orange-400">●</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                    {lastMsg?.content ?? 'Belum ada pesan'}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    {statusBadge(c.status)}
                    {c.slaBreachedAt && (
                      <span className="rounded bg-red-800 px-1.5 py-0.5 text-[10px] font-medium text-red-100" title="Belum dibalas melewati batas SLA">
                        ⏰ SLA
                      </span>
                    )}
                    {c.assignedAdmin && (
                      <span className="truncate text-[10px] text-gray-500" title="Ditugaskan ke">
                        👤 {c.assignedAdmin.name}
                      </span>
                    )}
                  </div>
                  {c.labels && c.labels.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {c.labels.map((l) => (
                        <span key={l} className="rounded bg-indigo-900 px-1.5 py-0.5 text-[10px] text-indigo-200">
                          {l}
                        </span>
                      ))}
                    </div>
                  )}
                  {!accountId && (
                    <p className="mt-0.5 truncate text-[10px] text-wa-accent/70">
                      via {c.whatsappAccount.accountName}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-gray-500">{fmtTime(c.lastMessageAt)}</span>
                  {c.unreadCount && c.unreadCount > 0 ? (
                    <span className="min-w-[18px] rounded-full bg-wa-accent px-1.5 text-center text-[11px] font-semibold text-black">
                      {c.unreadCount > 99 ? '99+' : c.unreadCount}
                    </span>
                  ) : null}
                  {aiModeBadge(c.aiMode)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg py-1 min-w-[180px]"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onMouseLeave={() => setCtxMenu(null)}
        >
          {[
            { icon: '📌', label: 'Pin Chat', action: () => onPin(ctxMenu.id, true) },
            { icon: '📦', label: 'Archive', action: () => onArchive(ctxMenu.id, true) },
            { icon: '🔇', label: 'Mute', action: () => onMute(ctxMenu.id, true) },
            { icon: '🔵', label: 'Tandai Belum Dibaca', action: () => onMarkUnread(ctxMenu.id) },
            { icon: '🗑️', label: 'Hapus Chat WA', action: () => onDeleteWaChat(ctxMenu.id) },
          ].map(({ icon, label, action }) => (
            <button
              key={label}
              onClick={() => { action(); setCtxMenu(null); }}
              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
}

// ── New Chat Modal (WhatsApp-desktop "new chat") ───────────────────────────────

function NewChatModal({
  accounts,
  defaultAccountId,
  onClose,
  onStart,
}: {
  accounts: WaAccount[];
  defaultAccountId: string;
  onClose: () => void;
  onStart: (accountId: string, phone: string, name: string) => Promise<void>;
}) {
  const [accId, setAccId] = useState(defaultAccountId || accounts[0]?.id || '');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleStart() {
    if (!accId || !phone.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onStart(accId, phone.trim(), name.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal membuka chat');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-xl border border-gray-200 bg-white p-5 shadow-pop dark:border-gray-700 dark:bg-gray-800">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Chat Baru</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Kirim dari akun</label>
            <select
              value={accId}
              onChange={(e) => setAccId(e.target.value)}
              className="w-full rounded-lg bg-gray-100 px-2 py-2 text-sm text-gray-900 outline-none dark:bg-gray-900 dark:text-gray-100"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName} · {a.phoneNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Nomor WhatsApp tujuan</label>
            <input
              autoFocus
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
              placeholder="08123456789 / 628123456789"
              className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-500 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Nama (opsional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
              placeholder="Nama customer"
              className="w-full rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-500 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>
          {err && <p className="rounded-lg bg-pastel-red px-3 py-2 text-xs text-pastel-redInk">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleStart}
              disabled={!accId || !phone.trim() || busy}
              className="flex-1 rounded-lg bg-wa-accent py-2 text-sm font-semibold text-white transition-colors hover:bg-wa-accent/90 disabled:opacity-50"
            >
              {busy ? 'Membuka…' : 'Buka Chat'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded-lg bg-gray-200 py-2 text-sm font-medium text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Center Panel ───────────────────────────────────────────────────────────────

function MediaModal({
  onClose,
  onSend,
  onUpload,
}: {
  onClose: () => void;
  onSend: (mediaType: string, url: string, caption: string) => void;
  onUpload: (file: File, caption: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<'upload' | 'url'>('upload');
  const [url, setUrl] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [caption, setCaption] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleUpload() {
    if (!file || busy) return;
    setBusy(true);
    try {
      await onUpload(file, caption);
      onClose();
    } catch {
      // error toast is surfaced by the caller; keep the modal open to retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
      <div className="w-96 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Kirim Media</h3>

        {/* Tabs */}
        <div className="mb-3 flex gap-1 rounded bg-gray-100 dark:bg-gray-900 p-1 text-xs">
          {(['upload', 'url'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded px-2 py-1 font-medium ${
                tab === t ? 'bg-emerald-600 text-white' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {t === 'upload' ? 'Upload dari device' : 'Dari URL'}
            </button>
          ))}
        </div>

        {tab === 'upload' ? (
          <div className="space-y-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
              }}
              className={`rounded border-2 border-dashed p-6 text-center text-xs ${
                dragOver ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {file ? (
                <div className="text-gray-800 dark:text-gray-200">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
                  <button onClick={() => setFile(null)} className="mt-1 text-red-400 hover:text-red-300">
                    Hapus
                  </button>
                </div>
              ) : (
                <p className="text-gray-500">Tarik file ke sini, atau</p>
              )}
              <label className="mt-2 inline-block cursor-pointer rounded bg-gray-200 dark:bg-gray-700 px-3 py-1 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600">
                Pilih file
                <input
                  type="file"
                  className="hidden"
                  accept="image/*,video/*,audio/*,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (opsional)"
              className="w-full rounded bg-gray-100 dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-500 dark:placeholder:text-gray-600"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleUpload}
                disabled={!file || busy}
                className="flex-1 rounded bg-emerald-600 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-500"
              >
                {busy ? 'Mengirim...' : 'Kirim'}
              </button>
              <button onClick={onClose} className="flex-1 rounded bg-gray-200 dark:bg-gray-700 py-1.5 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600">
                Batal
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600 dark:text-gray-400">Tipe Media</label>
              <select
                value={mediaType}
                onChange={(e) => setMediaType(e.target.value)}
                className="w-full rounded bg-gray-100 dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none"
              >
                <option value="image">Gambar</option>
                <option value="document">Dokumen</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
            </div>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded bg-gray-100 dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-500 dark:placeholder:text-gray-600"
            />
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (opsional)"
              className="w-full rounded bg-gray-100 dark:bg-gray-900 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 outline-none placeholder:text-gray-500 dark:placeholder:text-gray-600"
            />
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { if (url.trim()) { onSend(mediaType, url.trim(), caption); onClose(); } }}
                disabled={!url.trim()}
                className="flex-1 rounded bg-emerald-600 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-500"
              >
                Kirim
              </button>
              <button onClick={onClose} className="flex-1 rounded bg-gray-200 dark:bg-gray-700 py-1.5 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600">
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageMedia({ msg }: { msg: Message }) {
  const src = resolveMediaUrl(msg.mediaUrl);
  const typeLabel: Record<string, string> = {
    image: '📷 Gambar', video: '🎬 Video', audio: '🎵 Audio', document: '📄 Dokumen',
  };

  // Media message whose file isn't available (download failed / legacy rows).
  if (!src && typeLabel[msg.messageType]) {
    return (
      <div>
        <p className="text-xs italic text-gray-600 dark:text-gray-400">
          {typeLabel[msg.messageType]} (file tidak tersedia)
        </p>
        {msg.content && <p className="mt-1 whitespace-pre-wrap">{msg.content}</p>}
      </div>
    );
  }
  if (msg.messageType === 'image' && src) {
    return (
      <div>
        <img src={src} alt={msg.content ?? 'image'} className="max-w-full rounded" />
        {msg.content && <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{msg.content}</p>}
      </div>
    );
  }
  if (msg.messageType === 'document' && src) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg">📄</span>
        <a href={src} target="_blank" rel="noreferrer" className="text-xs text-blue-300 underline">
          {msg.content ?? 'Dokumen'}
        </a>
      </div>
    );
  }
  if (msg.messageType === 'audio' && src) {
    return <audio controls src={src} className="w-full" />;
  }
  if (msg.messageType === 'video' && src) {
    return (
      <div>
        <video controls src={src} className="max-w-full rounded" />
        {msg.content && <p className="mt-1 text-xs text-gray-700 dark:text-gray-300">{msg.content}</p>}
      </div>
    );
  }
  return <p className="whitespace-pre-wrap">{msg.content}</p>;
}

// Hover action cluster on a message: react / reply / edit / delete / forward.
function MessageActions({
  msg,
  side,
  canEdit,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onForward,
}: {
  msg: Message;
  side: 'left' | 'right';
  canEdit?: boolean;
  onReply: () => void;
  onReact: (emoji: string) => void;
  onEdit?: () => void;
  onDelete: () => void;
  onForward?: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  // Editable only for our own text messages (WhatsApp won't edit media).
  const editable = canEdit && (msg.messageType === 'text' || !msg.messageType);
  return (
    <div className={`relative hidden shrink-0 items-center gap-0.5 self-center group-hover:flex ${side === 'left' ? 'order-first' : ''}`}>
      <button onClick={() => setShowPicker((v) => !v)} title="Reaksi" className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:bg-black/30">😀</button>
      <button onClick={onReply} title="Balas" className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:bg-black/30">↩</button>
      {editable && (
        <button onClick={onEdit} title="Edit" className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:bg-black/30">✏️</button>
      )}
      <button onClick={onDelete} title="Hapus untuk semua" className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:bg-black/30">🗑️</button>
      {onForward && (
        <button onClick={onForward} title="Forward" className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs hover:bg-black/10 dark:bg-black/30">↪️</button>
      )}
      {showPicker && (
        <div className="absolute bottom-full z-10 mb-1 flex gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-pop dark:border-gray-700 dark:bg-gray-800">
          {REACTION_CHOICES.map((e) => (
            <button
              key={e}
              onClick={() => { onReact(e); setShowPicker(false); }}
              className="rounded-full px-1 text-base transition-transform hover:scale-125"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CenterPanel({
  conv,
  onSend,
  onSendMedia,
  onUploadMedia,
  onTakeover,
  onReturnToAi,
  onToggleAi,
  onApproveDraft,
  onBlockDraft,
  onSuggest,
  suggesting,
  sending,
  typing,
  quickReplies,
  onLoadOlder,
  accountStatus,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onSendPoll,
  onSendLocation,
  onSendContact,
  onForwardMessage,
}: {
  conv: ConvDetail | null;
  onSend: (text: string, quotedMessageId?: string) => void;
  onSendMedia: (mediaType: string, url: string, caption: string) => void;
  onUploadMedia: (file: File, caption: string) => Promise<void>;
  onTakeover: () => void;
  onReturnToAi: () => void;
  onToggleAi: () => void;
  onApproveDraft: (msgId: string) => void;
  onBlockDraft: (msgId: string) => void;
  onSuggest: () => Promise<string | null>;
  suggesting: boolean;
  sending: boolean;
  typing: boolean;
  quickReplies: QuickReply[];
  onLoadOlder: () => Promise<void>;
  accountStatus?: string;
  onReact: (msgId: string, emoji: string) => void;
  onEditMessage: (msg: Message) => void;
  onDeleteMessage: (msgId: string) => void;
  onSendPoll: (q: string, opts: string[], n: number) => void;
  onSendLocation: (lat: number, lng: number, name: string) => void;
  onSendContact: (contacts: { name: string; phone: string }[]) => void;
  onForwardMessage: (msgId: string, toPhone: string) => void;
}) {
  const [text, setText] = useState('');
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [showPollModalLocal, setShowPollModalLocal] = useState(false);
  const [showLocationModalLocal, setShowLocationModalLocal] = useState(false);
  const [showContactModalLocal, setShowContactModalLocal] = useState(false);
  const [forwardMsgIdLocal, setForwardMsgIdLocal] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<(QuotedMessage & { createdAt: string })[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // When set, the next messages render is an older-page prepend → restore the
  // prior scroll position instead of jumping to the bottom.
  const olderRestore = useRef<number | null>(null);

  // Quick-reply picker: typing "/foo" filters templates by shortcut or title.
  const slashQuery = text.startsWith('/') ? text.slice(1).toLowerCase() : null;
  const qrMatches =
    slashQuery !== null
      ? quickReplies
          .filter(
            (q) =>
              (q.shortcut ?? '').toLowerCase().includes(slashQuery) ||
              q.title.toLowerCase().includes(slashQuery),
          )
          .slice(0, 6)
      : [];
  const showQuickReplies = slashQuery !== null && qrMatches.length > 0;

  async function handleSuggest() {
    const suggestion = await onSuggest();
    if (suggestion) setText(suggestion);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (olderRestore.current !== null && el) {
      // Older messages were prepended — keep the viewport anchored.
      el.scrollTop = el.scrollHeight - olderRestore.current;
      olderRestore.current = null;
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [conv?.messages]);

  async function handleScroll() {
    const el = scrollRef.current;
    if (!el || loadingOlder || !conv?.hasMoreMessages) return;
    if (el.scrollTop < 80) {
      setLoadingOlder(true);
      olderRestore.current = el.scrollHeight;
      try {
        await onLoadOlder();
      } finally {
        setLoadingOlder(false);
      }
    }
  }

  // Reset chat-local state when switching conversations.
  useEffect(() => {
    setReplyTo(null);
    setSearchOpen(false);
    setSearchQ('');
    setSearchResults([]);
    setHighlightId(null);
  }, [conv?.id]);

  // In-conversation search, debounced against the server.
  useEffect(() => {
    if (!conv?.id || !searchQ.trim()) {
      setSearchResults([]);
      return;
    }
    const convId = conv.id;
    const t = setTimeout(async () => {
      try {
        const r = await api<{ items: (QuotedMessage & { createdAt: string })[] }>(
          `/conversations/${convId}/messages/search?q=${encodeURIComponent(searchQ.trim())}`,
        );
        setSearchResults(r.items);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [conv?.id, searchQ]);

  /** Scroll to a message bubble (if loaded) and flash-highlight it. */
  function jumpToMessage(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(id);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 1800);
    }
  }

  function handleSend() {
    if (!text.trim() || sending) return;
    onSend(text.trim(), replyTo?.id);
    setText('');
    setReplyTo(null);
  }

  if (!conv) {
    return (
      <section className="flex flex-1 items-center justify-center bg-[#efeae2] dark:bg-wa-bg">
        <p className="text-sm text-gray-500">Pilih percakapan</p>
      </section>
    );
  }

  const isAdmin = conv.takeoverStatus === 'admin_takeover';
  const canSend = conv.aiMode === 'ai_off' || isAdmin;

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-black/40 bg-white dark:bg-wa-panel px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={conv.customer.name} phone={conv.customer.phoneNumber} url={conv.customer.avatarUrl} size={40} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {conv.customer.name ?? conv.customer.phoneNumber}
              </span>
              {aiModeBadge(conv.aiMode)}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {typing ? (
                <span className="text-wa-accent">sedang mengetik…</span>
              ) : (
                conv.customer.phoneNumber
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setSearchOpen((v) => !v)}
            title="Cari dalam percakapan"
            className={`rounded px-2.5 py-1 text-xs font-medium ring-1 ${
              searchOpen
                ? 'bg-wa-accent text-black ring-wa-accent'
                : 'text-gray-700 dark:text-gray-300 ring-gray-300 dark:ring-gray-600 hover:ring-gray-400'
            }`}
          >
            🔍
          </button>
          {isAdmin ? (
            <button
              onClick={onReturnToAi}
              className="rounded bg-green-700 px-3 py-1 text-xs font-medium text-green-100 hover:bg-green-600"
            >
              Kembalikan ke AI
            </button>
          ) : (
            <button
              onClick={onTakeover}
              className="rounded bg-orange-700 px-3 py-1 text-xs font-medium text-orange-100 hover:bg-orange-600"
            >
              Takeover
            </button>
          )}
          <button
            onClick={onToggleAi}
            className="rounded bg-white dark:bg-wa-panel px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600 hover:ring-gray-400"
          >
            {conv.aiMode === 'ai_on' ? 'Matikan AI' : 'Nyalakan AI'}
          </button>
        </div>
      </header>

      {/* Connection warning — the #1 reason messages "don't appear" */}
      {accountStatus && accountStatus !== 'connected' && (
        <div className="border-b border-yellow-800 bg-yellow-900/60 px-4 py-2 text-xs text-yellow-100">
          ⚠ Akun WhatsApp <strong>{conv.whatsappAccount.accountName}</strong> tidak terhubung
          (status: {accountStatus}). Pesan tidak bisa dikirim/diterima —{' '}
          <a href="/accounts" className="underline">buka halaman Accounts</a>
          {accountStatus === 'qr_required' ? ' untuk scan QR.' : ' untuk restart sesi.'}
        </div>
      )}

      {/* In-conversation search */}
      {searchOpen && (
        <div className="border-b border-gray-200 dark:border-black/40 bg-white dark:bg-wa-panel px-4 py-2">
          <input
            type="text"
            autoFocus
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Cari teks dalam chat ini..."
            className="w-full rounded bg-black/5 dark:bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-gray-500"
          />
          {searchQ.trim() && (
            <div className="mt-1 max-h-48 overflow-y-auto rounded bg-black/5 dark:bg-black/20">
              {searchResults.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-500">Tidak ditemukan</p>
              )}
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => jumpToMessage(r.id)}
                  className="block w-full border-b border-gray-200 dark:border-black/20 px-3 py-1.5 text-left text-xs hover:bg-black/5 dark:hover:bg-black/30"
                >
                  <span className="mr-2 text-gray-500">
                    {senderLabel(r.senderType, conv.customer.name)} · {fmtTime(r.createdAt)}
                  </span>
                  <span className="text-gray-800 dark:text-gray-200">{(r.content ?? '').slice(0, 90)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="wa-chat-surface scrollbar-thin flex-1 space-y-2 overflow-y-auto p-4">
        {loadingOlder && (
          <p className="py-1 text-center text-xs text-gray-500">Memuat pesan lama…</p>
        )}
        {conv.messages.map((m) => {
          const isCustomer = m.senderType === 'customer';
          const isDraft = m.senderType === 'ai' && m.status === 'pending';
          const isSystem = m.senderType === 'system' || m.senderType === 'hermes';

          if (isSystem) {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="rounded bg-black/5 dark:bg-black/30 px-3 py-1 text-xs text-gray-600 dark:text-gray-400">
                  {m.content}
                </span>
              </div>
            );
          }

          // Resolve the quoted message: prefer the API include, fall back to
          // a lookup in the loaded timeline.
          const quoted =
            m.quotedMessage ??
            (m.quotedMessageId ? conv.messages.find((x) => x.id === m.quotedMessageId) ?? null : null);

          return (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              className={`group flex items-center gap-1 ${isCustomer ? 'justify-start' : 'justify-end'}`}
            >
              {/* Hover actions (left of our own bubbles) */}
              {!isCustomer && !isDraft && !m.deletedAt && (
                <MessageActions
                  msg={m}
                  side="left"
                  canEdit
                  onReply={() => setReplyTo(m)}
                  onReact={(e) => onReact(m.id, e)}
                  onEdit={() => onEditMessage(m)}
                  onDelete={() => onDeleteMessage(m.id)}
                  onForward={() => setForwardMsgIdLocal(m.id)}
                />
              )}
              <div
                className={`max-w-[70%] rounded-xl px-3 py-2 text-sm shadow-card transition-shadow ${
                  isCustomer
                    ? 'rounded-tl-sm border border-gray-200 bg-white text-gray-900 dark:border-transparent dark:bg-[#1f2c34] dark:text-gray-100'
                    : isDraft
                    ? 'rounded-tr-sm border border-amber-300 bg-pastel-yellow text-pastel-yellowInk dark:border-yellow-600 dark:bg-yellow-900/60 dark:text-yellow-100'
                    : 'rounded-tr-sm bg-[#d9fdd3] text-gray-900 dark:bg-[#005c4b] dark:text-gray-100'
                } ${highlightId === m.id ? 'ring-2 ring-wa-accent' : ''}`}
              >
                {isDraft && (
                  <div className="mb-1 flex items-center gap-1 text-xs text-yellow-400">
                    <span>Draft AI</span>
                  </div>
                )}
                {/* Quoted message block (WhatsApp-style reply preview) */}
                {quoted && (
                  <button
                    onClick={() => jumpToMessage(quoted.id)}
                    className="mb-1 block w-full rounded border-l-2 border-wa-accent bg-black/5 dark:bg-black/20 px-2 py-1 text-left"
                  >
                    <span className="block text-[10px] font-medium text-wa-accent">
                      {senderLabel(quoted.senderType, conv.customer.name)}
                    </span>
                    <span className="block truncate text-xs text-gray-600 dark:text-gray-400">
                      {quoted.content || `[${quoted.messageType}]`}
                    </span>
                  </button>
                )}
                {m.deletedAt ? (
                  <p className="flex items-center gap-1 text-sm italic opacity-60">🚫 Pesan ini dihapus</p>
                ) : (
                  <MessageMedia msg={m} />
                )}
                <div className="mt-1 flex items-center justify-end gap-1">
                  {m.editedAt && !m.deletedAt && (
                    <span className="text-[10px] italic opacity-50">diedit</span>
                  )}
                  <span className="text-xs opacity-50">{fmtTime(m.createdAt)}</span>
                  {m.aiGenerated && !isCustomer && (
                    <span className="text-xs opacity-50">🤖</span>
                  )}
                  {/* Delivery ticks only on our outgoing (non-draft) messages. */}
                  {!isCustomer && !isDraft && (
                    <span className="text-xs"><StatusTicks status={m.status} /></span>
                  )}
                </div>
                {/* Reactions (WhatsApp-style chips below the content) */}
                {m.reactions && Object.keys(m.reactions).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(m.reactions).map(([emoji, who]) => (
                      <span
                        key={emoji}
                        className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs dark:bg-black/30"
                        title={(who as string[]).join(', ')}
                      >
                        {emoji}{(who as string[]).length > 1 ? ` ${(who as string[]).length}` : ''}
                      </span>
                    ))}
                  </div>
                )}
                {/* Approve (send) / Block (discard) for any pending AI draft —
                    applies to both ai_draft and ai_supervised modes. */}
                {isDraft && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => onApproveDraft(m.id)}
                      className="rounded bg-green-700 px-2 py-0.5 text-xs font-medium hover:bg-green-600"
                    >
                      Approve & Kirim
                    </button>
                    <button
                      onClick={() => onBlockDraft(m.id)}
                      className="rounded bg-red-700 px-2 py-0.5 text-xs font-medium hover:bg-red-600"
                    >
                      Block
                    </button>
                  </div>
                )}
              </div>
              {/* Hover actions (right of customer bubbles) */}
              {isCustomer && !m.deletedAt && (
                <MessageActions
                  msg={m}
                  side="right"
                  onReply={() => setReplyTo(m)}
                  onReact={(e) => onReact(m.id, e)}
                  onDelete={() => onDeleteMessage(m.id)}
                  onForward={() => setForwardMsgIdLocal(m.id)}
                />
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Media Modal */}
      {showMediaModal && (
        <MediaModal
          onClose={() => setShowMediaModal(false)}
          onSend={onSendMedia}
          onUpload={onUploadMedia}
        />
      )}
      {showPollModalLocal && (
        <PollModal
          onClose={() => setShowPollModalLocal(false)}
          onSend={onSendPoll}
        />
      )}
      {showLocationModalLocal && (
        <LocationModal
          onClose={() => setShowLocationModalLocal(false)}
          onSend={onSendLocation}
        />
      )}
      {showContactModalLocal && (
        <ContactModal
          onClose={() => setShowContactModalLocal(false)}
          onSend={onSendContact}
        />
      )}
      {forwardMsgIdLocal && (
        <ForwardModal
          onClose={() => setForwardMsgIdLocal(null)}
          onForward={(phone) => { onForwardMessage(forwardMsgIdLocal, phone); setForwardMsgIdLocal(null); }}
        />
      )}

      {/* Input */}
      {canSend && (
        <div className="relative border-t border-gray-200 dark:border-black/40 bg-white dark:bg-wa-panel px-4 py-3">
          {/* Quick-reply picker (triggered by typing "/") */}
          {showQuickReplies && (
            <div className="absolute bottom-full left-4 right-4 mb-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
              <p className="border-b border-gray-200 dark:border-black/30 px-3 py-1 text-[10px] uppercase tracking-wide text-gray-500">
                Template — pilih untuk menyisipkan
              </p>
              {qrMatches.map((q) => (
                <button
                  key={q.id}
                  onClick={() => setText(q.content)}
                  className="block w-full border-b border-gray-200 dark:border-black/20 px-3 py-2 text-left hover:bg-black/5 dark:hover:bg-black/30"
                >
                  <div className="flex items-center gap-2">
                    {q.shortcut && (
                      <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-[10px] text-emerald-200">
                        /{q.shortcut}
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{q.title}</span>
                  </div>
                  <p className="truncate text-xs text-gray-600 dark:text-gray-400">{q.content}</p>
                </button>
              ))}
            </div>
          )}
          {/* Quoted reply preview */}
          {replyTo && (
            <div className="mb-2 flex items-start gap-2 rounded border-l-2 border-wa-accent bg-black/5 dark:bg-black/20 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium text-wa-accent">
                  Membalas {senderLabel(replyTo.senderType, conv.customer.name)}
                </p>
                <p className="truncate text-xs text-gray-600 dark:text-gray-400">
                  {replyTo.content || `[${replyTo.messageType}]`}
                </p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                title="Batal membalas"
                className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
          )}
          {isAdmin && (
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                title="Minta AI menyarankan balasan"
                className="rounded bg-blue-700/70 px-2 py-1 text-xs font-medium text-blue-100 hover:bg-blue-600 disabled:opacity-50"
              >
                {suggesting ? '⏳ Menyiapkan...' : '💡 Saran AI'}
              </button>
              <span className="text-[10px] text-gray-500">
                Saran bisa diedit sebelum dikirim
              </span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setShowMediaModal(true)}
              title="Kirim media"
              className="rounded bg-black/5 dark:bg-black/30 px-2 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              📎
            </button>
            <button
              onClick={() => setShowPollModalLocal(true)}
              title="Kirim Poll"
              className="rounded bg-black/5 dark:bg-black/30 px-2 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              📊
            </button>
            <button
              onClick={() => setShowLocationModalLocal(true)}
              title="Kirim Lokasi"
              className="rounded bg-black/5 dark:bg-black/30 px-2 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              📍
            </button>
            <button
              onClick={() => setShowContactModalLocal(true)}
              title="Kirim Kontak"
              className="rounded bg-black/5 dark:bg-black/30 px-2 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              👤
            </button>
            <textarea
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Tulis pesan..."
              className="flex-1 resize-none rounded bg-black/5 dark:bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-gray-500"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="rounded bg-wa-accent px-4 font-medium text-black disabled:opacity-50"
            >
              {sending ? '...' : 'Kirim'}
            </button>
          </div>
        </div>
      )}
      {!canSend && (
        <div className="border-t border-gray-200 dark:border-black/40 bg-white dark:bg-wa-panel px-4 py-3 text-center text-xs text-gray-500">
          {conv.aiMode === 'ai_on'
            ? 'AI sedang aktif — Takeover untuk kirim manual'
            : conv.aiMode === 'ai_supervised'
            ? 'Mode supervised — AI membuat draft, review sebelum kirim'
            : 'Mode draft — admin review dan kirim manual'}
        </div>
      )}
    </section>
  );
}

// ── Right Panel ────────────────────────────────────────────────────────────────

function RightPanel({
  conv,
  admins,
  onAiModeChange,
  onAddNote,
  onStatusChange,
  onAssign,
  onSetLabels,
}: {
  conv: ConvDetail | null;
  admins: AdminUser[];
  onAiModeChange: (mode: string) => void;
  onAddNote: (note: string) => void;
  onStatusChange: (status: string) => void;
  onAssign: (adminId: string | null) => void;
  onSetLabels: (labels: string[]) => void;
}) {
  const [note, setNote] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [fuMessage, setFuMessage] = useState('');
  const [fuDateTime, setFuDateTime] = useState('');
  const [fuLoading, setFuLoading] = useState(false);

  const loadFollowUps = useCallback(async (convId: string) => {
    try {
      const data = await api<FollowUp[]>(`/follow-ups?conversationId=${convId}`);
      setFollowUps(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (conv?.id) loadFollowUps(conv.id);
    else setFollowUps([]);
  }, [conv?.id, loadFollowUps]);

  async function handleScheduleFollowUp() {
    if (!conv || !fuMessage.trim() || !fuDateTime) return;
    setFuLoading(true);
    try {
      await api('/follow-ups', {
        method: 'POST',
        body: JSON.stringify({
          conversationId: conv.id,
          scheduledAt: new Date(fuDateTime).toISOString(),
          message: fuMessage.trim(),
        }),
      });
      setFuMessage('');
      setFuDateTime('');
      setShowFollowUpForm(false);
      loadFollowUps(conv.id);
    } catch {
      // ignore
    } finally {
      setFuLoading(false);
    }
  }

  async function handleCancelFollowUp(id: string) {
    try {
      await api(`/follow-ups/${id}/cancel`, { method: 'PATCH' });
      setFollowUps((prev) => prev.map((f) => f.id === id ? { ...f, status: 'cancelled' } : f));
    } catch {
      // ignore
    }
  }

  if (!conv) return <aside className="w-72 border-l border-gray-200 dark:border-black/40 bg-white dark:bg-wa-panel" />;

  const { customer, hermesReviews } = conv;
  const lastReview = hermesReviews[0] ?? null;

  const aiModes = [
    { value: 'ai_on', label: 'AI ON' },
    { value: 'ai_off', label: 'AI OFF' },
    { value: 'ai_draft', label: 'Draft' },
    { value: 'ai_supervised', label: 'Supervised' },
    { value: 'ai_paused', label: 'Paused' },
  ];

  return (
    <aside className="scrollbar-thin flex w-72 flex-col gap-4 overflow-y-auto border-l border-gray-200 bg-white p-4 dark:border-black/40 dark:bg-wa-panel">
      {/* Customer Info */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          Info Customer
        </h3>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{customer.name ?? '—'}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">{customer.phoneNumber}</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${leadColors[customer.leadStage] ?? 'text-gray-600 dark:text-gray-400'}`}>
              {customer.leadStage.replace('_', ' ').toUpperCase()}
            </span>
            <span className="text-xs text-gray-500">Score: {customer.leadScore}</span>
          </div>
          {customer.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {customer.tags.map((tag) => (
                <span key={tag} className="rounded bg-black/5 dark:bg-black/30 px-1.5 py-0.5 text-xs text-gray-700 dark:text-gray-300">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Status & Assignment */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          Status & Penugasan
        </h3>
        <div className="space-y-2">
          <select
            value={conv.status}
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1.5 text-sm outline-none"
            title="Status percakapan"
          >
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="resolved">Resolved</option>
          </select>
          {admins.length > 0 ? (
            <select
              value={conv.assignedAdmin?.id ?? ''}
              onChange={(e) => onAssign(e.target.value || null)}
              className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1.5 text-sm outline-none"
              title="Tugaskan ke admin"
            >
              <option value="">— Tidak ditugaskan —</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : (
            // Plain admins can't list users → offer self-assign only.
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-gray-600 dark:text-gray-400">
                {conv.assignedAdmin ? `👤 ${conv.assignedAdmin.name}` : 'Belum ditugaskan'}
              </span>
              {conv.assignedAdmin?.id === getUserId() ? (
                <button
                  onClick={() => onAssign(null)}
                  className="shrink-0 rounded bg-gray-200 dark:bg-gray-700 px-2 py-0.5 text-xs text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Lepas
                </button>
              ) : (
                <button
                  onClick={() => { const me = getUserId(); if (me) onAssign(me); }}
                  className="shrink-0 rounded bg-emerald-700 px-2 py-0.5 text-xs text-emerald-100 hover:bg-emerald-600"
                >
                  Ambil untuk saya
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Labels */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          Label
        </h3>
        <div className="mb-2 flex flex-wrap gap-1">
          {(conv.labels ?? []).length === 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-600">Belum ada label.</span>
          )}
          {(conv.labels ?? []).map((l) => (
            <span key={l} className="flex items-center gap-1 rounded bg-indigo-900 px-1.5 py-0.5 text-xs text-indigo-200">
              {l}
              <button
                onClick={() => onSetLabels((conv.labels ?? []).filter((x) => x !== l))}
                className="text-indigo-300 hover:text-white"
                title="Hapus label"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newLabel.trim()) {
              const next = Array.from(new Set([...(conv.labels ?? []), newLabel.trim()]));
              onSetLabels(next);
              setNewLabel('');
            }
          }}
          placeholder="Tambah label + Enter"
          className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1 text-xs outline-none placeholder:text-gray-500 dark:placeholder:text-gray-600"
        />
      </div>

      {/* CSAT result */}
      {typeof conv.csatScore === 'number' && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
            Rating Customer (CSAT)
          </h3>
          <p className="text-lg">
            {'★'.repeat(conv.csatScore)}<span className="text-gray-500 dark:text-gray-600">{'★'.repeat(5 - conv.csatScore)}</span>
            <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{conv.csatScore}/5</span>
          </p>
        </div>
      )}

      {/* AI Mode Selector */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          Mode AI
        </h3>
        <select
          value={conv.aiMode}
          onChange={(e) => onAiModeChange(e.target.value)}
          className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1.5 text-sm outline-none"
        >
          {aiModes.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
          Catatan Internal
        </h3>
        {customer.notes && (
          <p className="mb-2 rounded bg-black/5 dark:bg-black/20 p-2 text-xs text-gray-700 dark:text-gray-300">{customer.notes}</p>
        )}
        <div className="flex gap-1">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tambah catatan..."
            className="flex-1 rounded bg-black/5 dark:bg-black/30 px-2 py-1 text-xs outline-none placeholder:text-gray-500 dark:placeholder:text-gray-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && note.trim()) {
                onAddNote(note.trim());
                setNote('');
              }
            }}
          />
          <button
            onClick={() => {
              if (note.trim()) {
                onAddNote(note.trim());
                setNote('');
              }
            }}
            className="rounded bg-wa-accent px-2 py-1 text-xs font-medium text-black"
          >
            +
          </button>
        </div>
      </div>

      {/* Hermes Last Review */}
      {lastReview && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">
            Hermes Review Terakhir
          </h3>
          <div className="space-y-1.5 rounded bg-black/5 dark:bg-black/20 p-2 text-xs">
            <div className="flex items-center gap-2">
              {decisionBadge(lastReview.decision)}
              <span className="text-gray-600 dark:text-gray-400">
                {lastReview.riskLevel.toUpperCase()} risk
              </span>
            </div>
            <div className="flex gap-3 text-gray-600 dark:text-gray-400">
              <span>Confidence: <span className="text-gray-800 dark:text-gray-200">{lastReview.confidenceScore}</span></span>
              <span>Risk: <span className="text-gray-800 dark:text-gray-200">{lastReview.riskScore}</span></span>
            </div>
            {lastReview.reason && (
              <p className="text-gray-600 dark:text-gray-400">{lastReview.reason}</p>
            )}
            {lastReview.recommendation && (
              <p className="italic text-gray-500">{lastReview.recommendation}</p>
            )}
          </div>
        </div>
      )}

      {/* Bot info */}
      {conv.bot && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Bot</h3>
          <p className="text-xs text-gray-700 dark:text-gray-300">{conv.bot.botName}</p>
        </div>
      )}

      {/* Follow-ups */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400">Follow-ups</h3>
          <button
            onClick={() => setShowFollowUpForm((v) => !v)}
            className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium text-emerald-100 hover:bg-emerald-600"
          >
            {showFollowUpForm ? 'Batal' : '+ Jadwalkan'}
          </button>
        </div>

        {showFollowUpForm && (
          <div className="mb-3 space-y-2 rounded bg-black/5 dark:bg-black/20 p-2">
            <textarea
              rows={2}
              value={fuMessage}
              onChange={(e) => setFuMessage(e.target.value)}
              placeholder="Pesan follow-up..."
              className="w-full resize-none rounded bg-black/5 dark:bg-black/30 px-2 py-1 text-xs outline-none placeholder:text-gray-500 dark:placeholder:text-gray-600"
            />
            <input
              type="datetime-local"
              value={fuDateTime}
              onChange={(e) => setFuDateTime(e.target.value)}
              className="w-full rounded bg-black/5 dark:bg-black/30 px-2 py-1 text-xs text-gray-800 dark:text-gray-200 outline-none"
            />
            <button
              onClick={handleScheduleFollowUp}
              disabled={fuLoading || !fuMessage.trim() || !fuDateTime}
              className="w-full rounded bg-emerald-700 py-1 text-xs font-medium text-emerald-100 disabled:opacity-50 hover:bg-emerald-600"
            >
              {fuLoading ? 'Menjadwalkan...' : 'Jadwalkan'}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {followUps.length === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-600">Belum ada follow-up.</p>
          )}
          {followUps.map((fu) => (
            <div key={fu.id} className="rounded bg-black/5 dark:bg-black/20 p-2 text-xs">
              <div className="mb-1 flex items-center justify-between gap-1">
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${
                    fu.status === 'pending'
                      ? 'bg-yellow-800 text-yellow-200'
                      : fu.status === 'sent'
                      ? 'bg-green-800 text-green-200'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {fu.status}
                </span>
                {fu.status === 'pending' && (
                  <button
                    onClick={() => handleCancelFollowUp(fu.id)}
                    className="text-gray-500 hover:text-red-400"
                    title="Batalkan"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="mb-1 text-gray-700 dark:text-gray-300">{fu.message}</p>
              <p className="text-gray-500">
                {new Date(fu.scheduledAt).toLocaleString('id', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ── Extra Modals ───────────────────────────────────────────────────────────────

function PollModal({ onClose, onSend }: { onClose: () => void; onSend: (q: string, opts: string[], n: number) => void }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [selectable, setSelectable] = useState(1);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="font-semibold text-lg mb-4">Buat Poll</h3>
        <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="Pertanyaan" className="w-full border dark:border-gray-600 rounded px-3 py-2 mb-3 bg-transparent text-sm" />
        {options.map((opt, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={opt} onChange={e => { const o = [...options]; o[i] = e.target.value; setOptions(o); }} placeholder={`Opsi ${i+1}`} className="flex-1 border dark:border-gray-600 rounded px-3 py-2 bg-transparent text-sm" />
            {options.length > 2 && <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 px-2">✕</button>}
          </div>
        ))}
        {options.length < 12 && <button onClick={() => setOptions([...options, ''])} className="text-blue-500 text-sm mb-3">+ Tambah opsi</button>}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm">Pilihan maks:</label>
          <select value={selectable} onChange={e => setSelectable(Number(e.target.value))} className="border dark:border-gray-600 rounded px-2 py-1 bg-transparent text-sm">
            {Array.from({ length: options.length }, (_, i) => i+1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">Batal</button>
          <button onClick={() => { if (question.trim() && options.filter(Boolean).length >= 2) { onSend(question.trim(), options.filter(Boolean), selectable); onClose(); } }} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Kirim Poll</button>
        </div>
      </div>
    </div>
  );
}

function LocationModal({ onClose, onSend }: { onClose: () => void; onSend: (lat: number, lng: number, name: string) => void }) {
  const [lat, setLat] = useState('-6.2088');
  const [lng, setLng] = useState('106.8456');
  const [name, setName] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm shadow-xl">
        <h3 className="font-semibold text-lg mb-4">Kirim Lokasi</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div><label className="text-xs text-gray-500">Latitude</label><input value={lat} onChange={e => setLat(e.target.value)} className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-transparent text-sm mt-1" /></div>
          <div><label className="text-xs text-gray-500">Longitude</label><input value={lng} onChange={e => setLng(e.target.value)} className="w-full border dark:border-gray-600 rounded px-3 py-2 bg-transparent text-sm mt-1" /></div>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama lokasi (opsional)" className="w-full border dark:border-gray-600 rounded px-3 py-2 mb-4 bg-transparent text-sm" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">Batal</button>
          <button onClick={() => { const la = parseFloat(lat); const lo = parseFloat(lng); if (!isNaN(la) && !isNaN(lo)) { onSend(la, lo, name.trim()); onClose(); } }} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Kirim</button>
        </div>
      </div>
    </div>
  );
}

function ContactModal({ onClose, onSend }: { onClose: () => void; onSend: (contacts: { name: string; phone: string }[]) => void }) {
  const [contacts, setContacts] = useState([{ name: '', phone: '' }]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md shadow-xl">
        <h3 className="font-semibold text-lg mb-4">Kirim Kontak</h3>
        {contacts.map((c, i) => (
          <div key={i} className="flex gap-2 mb-3">
            <input value={c.name} onChange={e => { const cs = [...contacts]; cs[i] = { ...cs[i], name: e.target.value }; setContacts(cs); }} placeholder="Nama" className="flex-1 border dark:border-gray-600 rounded px-3 py-2 bg-transparent text-sm" />
            <input value={c.phone} onChange={e => { const cs = [...contacts]; cs[i] = { ...cs[i], phone: e.target.value }; setContacts(cs); }} placeholder="62812..." className="flex-1 border dark:border-gray-600 rounded px-3 py-2 bg-transparent text-sm" />
            {contacts.length > 1 && <button onClick={() => setContacts(contacts.filter((_, j) => j !== i))} className="text-red-400 px-2">✕</button>}
          </div>
        ))}
        <button onClick={() => setContacts([...contacts, { name: '', phone: '' }])} className="text-blue-500 text-sm mb-4">+ Tambah kontak</button>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">Batal</button>
          <button onClick={() => { const valid = contacts.filter(c => c.name.trim() && c.phone.trim()); if (valid.length) { onSend(valid); onClose(); } }} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Kirim</button>
        </div>
      </div>
    </div>
  );
}

function ForwardModal({ onClose, onForward }: { onClose: () => void; onForward: (phone: string) => void }) {
  const [phone, setPhone] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-sm shadow-xl">
        <h3 className="font-semibold text-lg mb-4">Forward Pesan</h3>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Nomor tujuan (628...)" className="w-full border dark:border-gray-600 rounded px-3 py-2 mb-4 bg-transparent text-sm" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">Batal</button>
          <button onClick={() => { if (phone.trim()) { onForward(phone.trim()); onClose(); } }} className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700">Forward</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [accounts, setAccounts] = useState<WaAccount[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [accountId, setAccountId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [labelFilter, setLabelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [typing, setTyping] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [forwardMsgId, setForwardMsgId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const convRef = useRef<ConvDetail | null>(null);
  convRef.current = conv;

  // load WhatsApp accounts once for the switcher
  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then(setAccounts)
      .catch(() => setAccounts([]));
    // Admin list for the assignment dropdown. Owner/supervisor only — plain
    // admins get a 403 and fall back to the self-assign button.
    api<{ users: (AdminUser & { role: string })[] }>('/users?limit=100')
      .then((r) => setAdmins(r.users.filter((u) => u.role !== 'viewer')))
      .catch(() => setAdmins([]));
    // Ask for browser notification permission (best-effort).
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // load conversation list
  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter === 'needs_attention') params.set('needsAttention', 'true');
      else if (filter !== 'all') params.set('aiMode', filter);
      if (statusFilter) params.set('status', statusFilter);
      if (labelFilter.trim()) params.set('label', labelFilter.trim());
      if (search) params.set('search', search);
      if (accountId) params.set('accountId', accountId);
      params.set('limit', '100');
      const data = await api<{ items: ConvSummary[] }>(`/conversations?${params}`);
      setConversations(data.items);
    } catch {
      // silently fail on list
    }
  }, [filter, statusFilter, labelFilter, search, accountId]);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 30_000);
    return () => clearInterval(t);
  }, [loadList]);

  // Quick replies available for the open conversation's account (+ global).
  useEffect(() => {
    const accId = conv?.whatsappAccount.id;
    const path = accId ? `/quick-replies?accountId=${accId}` : '/quick-replies';
    api<QuickReply[]>(path)
      .then(setQuickReplies)
      .catch(() => setQuickReplies([]));
  }, [conv?.whatsappAccount.id]);

  // Load an older page of messages (infinite scroll, prepended to the top).
  const handleLoadOlder = useCallback(async () => {
    const current = convRef.current;
    if (!current || !current.hasMoreMessages || !current.oldestCursor) return;
    try {
      const r = await api<{ messages: Message[]; hasMore: boolean; oldestCursor: string | null }>(
        `/conversations/${current.id}/messages?before=${encodeURIComponent(current.oldestCursor)}`,
      );
      setConv((prev) => {
        if (!prev || prev.id !== current.id) return prev;
        const seen = new Set(prev.messages.map((m) => m.id));
        const older = r.messages.filter((m) => !seen.has(m.id));
        return {
          ...prev,
          messages: [...older, ...prev.messages],
          hasMoreMessages: r.hasMore,
          oldestCursor: r.oldestCursor,
        };
      });
    } catch {
      // ignore — the scroll handler will allow a retry
    }
  }, []);

  // load selected conversation detail
  const loadConv = useCallback(async (id: string) => {
    try {
      const data = await api<ConvDetail>(`/conversations/${id}`);
      setConv(data);
    } catch {
      setConv(null);
    }
  }, []);

  useEffect(() => {
    setTyping(false);
    if (selectedId) {
      loadConv(selectedId);
      // Send blue ticks for the customer's messages now that an admin is here.
      api(`/conversations/${selectedId}/read`, { method: 'POST' }).catch(() => {});
    } else {
      setConv(null);
    }
  }, [selectedId, loadConv]);

  // socket
  useEffect(() => {
    const socket = getSocket();

    socket.on('message:new', ({ conversationId, message }: { conversationId: string; message: Message }) => {
      const isOpen = convRef.current?.id === conversationId;
      // update detail if active
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        return prev.messages.some((m) => m.id === message.id)
          ? prev
          : { ...prev, messages: [...prev.messages, message] };
      });
      if (message.senderType === 'customer') {
        if (isOpen) {
          // Admin is looking → keep it read, don't notify.
          api(`/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
        } else {
          notifyInbound('Pesan baru', message.content?.slice(0, 80) ?? '[media]');
        }
      }
      // refresh list (also refreshes unread badges)
      loadList();
    });

    socket.on('message:draft', ({ conversationId, message }: { conversationId: string; message: Message }) => {
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        return prev.messages.some((m) => m.id === message.id)
          ? prev
          : { ...prev, messages: [...prev.messages, message] };
      });
    });

    socket.on('message:draft-removed', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        return { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) };
      });
    });

    // Delivery/read receipt for one of our sent messages → update checkmark.
    socket.on('message:status', ({ conversationId, messageId, status }: { conversationId: string; messageId: string; status: string }) => {
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        return { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, status } : m)) };
      });
    });

    // WhatsApp-native message updates: reaction / edit / delete-for-everyone.
    socket.on('message:reaction', ({ conversationId, messageId, reactions }: { conversationId: string; messageId: string; reactions: Record<string, string[]> | null }) => {
      setConv((prev) => prev && prev.id === conversationId
        ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, reactions } : m)) } : prev);
    });
    socket.on('message:edited', ({ conversationId, messageId, content }: { conversationId: string; messageId: string; content: string }) => {
      setConv((prev) => prev && prev.id === conversationId
        ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, content, editedAt: new Date().toISOString() } : m)) } : prev);
    });
    socket.on('message:deleted', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => {
      setConv((prev) => prev && prev.id === conversationId
        ? { ...prev, messages: prev.messages.map((m) => (m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m)) } : prev);
    });
    // Customer profile picture arrived → refresh the open chat's avatar + list.
    socket.on('customer:avatar', ({ customerId, avatarUrl }: { customerId: string; avatarUrl: string }) => {
      setConv((prev) => prev && prev.customer.id === customerId
        ? { ...prev, customer: { ...prev.customer, avatarUrl } } : prev);
      loadList();
    });

    // Customer typing/recording indicator for the open conversation.
    socket.on('wa:presence', ({ accountId, phone, typing: isTyping }: { accountId: string; phone: string; typing: boolean }) => {
      const c = convRef.current;
      if (!c || c.whatsappAccount.id !== accountId || c.customer.phoneNumber !== phone) return;
      setTyping(isTyping);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (isTyping) {
        // Auto-clear if no further presence arrives (WhatsApp stops sending).
        typingTimer.current = setTimeout(() => setTyping(false), 6000);
      }
    });

    // Status / assignment / labels / CSAT changed (possibly by another admin
    // or the SLA/CSAT automation) → live-sync only the provided fields.
    socket.on('conversation:updated', (payload: { conversationId: string; status?: string; assignedAdmin?: AdminUser | null; labels?: string[]; csatScore?: number }) => {
      setConv((prev) => {
        if (!prev || prev.id !== payload.conversationId) return prev;
        const next = { ...prev };
        if (payload.status !== undefined) next.status = payload.status;
        if (payload.assignedAdmin !== undefined) next.assignedAdmin = payload.assignedAdmin;
        if (payload.labels !== undefined) next.labels = payload.labels;
        if (payload.csatScore !== undefined) next.csatScore = payload.csatScore;
        return next;
      });
      loadList();
    });

    // SLA monitor flagged / cleared a stale chat → update badge + list live.
    socket.on('conversation:sla-breach', ({ conversationId }: { conversationId: string }) => {
      setConv((prev) =>
        prev && prev.id === conversationId ? { ...prev, slaBreachedAt: new Date().toISOString() } : prev,
      );
      loadList();
    });
    socket.on('conversation:sla-cleared', ({ conversationId }: { conversationId: string }) => {
      setConv((prev) => (prev && prev.id === conversationId ? { ...prev, slaBreachedAt: null } : prev));
      loadList();
    });

    socket.on('hermes:alert', ({ decision, reason }: { decision: string; reason: string }) => {
      setToast(`Hermes Alert: ${decision} — ${reason ?? ''}`);
    });

    return () => {
      socket.off('message:new');
      socket.off('message:status');
      socket.off('message:reaction');
      socket.off('message:edited');
      socket.off('message:deleted');
      socket.off('customer:avatar');
      socket.off('wa:presence');
      socket.off('message:draft');
      socket.off('message:draft-removed');
      socket.off('conversation:updated');
      socket.off('conversation:sla-breach');
      socket.off('conversation:sla-cleared');
      socket.off('hermes:alert');
    };
  }, [loadList]);

  async function handleSendMedia(mediaType: string, url: string, caption: string) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/media`, {
        method: 'POST',
        body: JSON.stringify({ mediaType, url, caption }),
      });
      if (selectedId) await loadConv(selectedId);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal mengirim media');
    }
  }

  // Upload a file from the admin's device (multipart) and send it.
  async function handleUploadMedia(file: File, caption: string) {
    if (!selectedId) return;
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    try {
      await uploadFile(`/conversations/${selectedId}/media/upload`, form);
      await loadConv(selectedId);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal upload media');
      throw e; // let the modal keep itself open on failure
    }
  }

  // React to / edit / delete a message (WhatsApp-native actions).
  async function handleReact(msgId: string, emoji: string) {
    if (!selectedId) return;
    const current = convRef.current?.messages.find((m) => m.id === msgId);
    // Toggle off if we already reacted with the same emoji.
    const already = current?.reactions?.[emoji]?.includes('me');
    try {
      await api(`/conversations/${selectedId}/messages/${msgId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji: already ? '' : emoji }),
      });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal memberi reaksi');
    }
  }

  async function handleEditMessage(msg: Message) {
    if (!selectedId) return;
    const next = window.prompt('Edit pesan:', msg.content ?? '');
    if (next === null || next.trim() === (msg.content ?? '')) return;
    try {
      await api(`/conversations/${selectedId}/messages/${msg.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ text: next.trim() }),
      });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal mengedit pesan');
    }
  }

  async function handleDeleteMessage(msgId: string) {
    if (!selectedId || !window.confirm('Hapus pesan ini untuk semua orang?')) return;
    try {
      await api(`/conversations/${selectedId}/messages/${msgId}`, { method: 'DELETE' });
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal menghapus pesan');
    }
  }

  async function handleSend(text: string, quotedMessageId?: string) {
    if (!selectedId) return;
    setSending(true);
    try {
      await api(`/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text, ...(quotedMessageId ? { quotedMessageId } : {}) }),
      });
      await loadConv(selectedId);
    } catch (e) {
      if (selectedId) await loadConv(selectedId);
      setToast(e instanceof Error ? e.message : 'Gagal mengirim');
    } finally {
      setSending(false);
    }
  }

  // Conversation workflow status (open/pending/resolved).
  async function handleStatusChange(status: string) {
    if (!conv) return;
    try {
      await api(`/conversations/${conv.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setConv((prev) => (prev ? { ...prev, status } : prev));
      loadList();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal mengubah status');
    }
  }

  // Replace the conversation's custom labels.
  async function handleSetLabels(labels: string[]) {
    if (!conv) return;
    // Optimistic update so chips appear instantly.
    setConv((prev) => (prev ? { ...prev, labels } : prev));
    try {
      await api(`/conversations/${conv.id}/labels`, {
        method: 'PATCH',
        body: JSON.stringify({ labels }),
      });
      loadList();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal menyimpan label');
      loadConv(conv.id); // revert to server truth
    }
  }

  // Assign / unassign the conversation to an admin.
  async function handleAssign(adminId: string | null) {
    if (!conv) return;
    try {
      const updated = await api<{ assignedAdmin: AdminUser | null }>(`/conversations/${conv.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({ adminId }),
      });
      setConv((prev) => (prev ? { ...prev, assignedAdmin: updated.assignedAdmin } : prev));
      loadList();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal menugaskan');
    }
  }

  async function handleTakeover() {
    if (!selectedId) return;
    await api(`/conversations/${selectedId}/takeover`, { method: 'POST' });
    loadConv(selectedId);
  }

  async function handleReturnToAi() {
    if (!selectedId) return;
    await api(`/conversations/${selectedId}/return-to-ai`, { method: 'POST' });
    loadConv(selectedId);
  }

  async function handleToggleAi() {
    if (!conv) return;
    const next = conv.aiMode === 'ai_on' ? 'ai_off' : 'ai_on';
    await api(`/conversations/${conv.id}/ai-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ aiMode: next }),
    });
    loadConv(conv.id);
  }

  async function handleAiModeChange(mode: string) {
    if (!conv) return;
    await api(`/conversations/${conv.id}/ai-mode`, {
      method: 'PATCH',
      body: JSON.stringify({ aiMode: mode }),
    });
    setConv((prev) => prev ? { ...prev, aiMode: mode } : prev);
    loadList();
  }

  async function handleAddNote(note: string) {
    if (!conv) return;
    try {
      await api(`/customers/${conv.customer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: note }),
      });
      setConv((prev) =>
        prev ? { ...prev, customer: { ...prev.customer, notes: note } } : prev,
      );
    } catch {
      setToast('Gagal menyimpan catatan');
    }
  }

  // Approve a supervised draft → actually sends it to the customer.
  async function handleApproveDraft(msgId: string) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/messages/${msgId}/approve`, { method: 'POST' });
      await loadConv(selectedId);
      loadList();
      setToast('Draft terkirim ke customer.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal mengirim draft');
    }
  }

  // Block a supervised draft → discards it, never sent.
  async function handleBlockDraft(msgId: string) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/messages/${msgId}/block`, { method: 'POST' });
      await loadConv(selectedId);
      setToast('Draft dibatalkan.');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal membatalkan draft');
    }
  }

  // Ask the AI for a suggested reply (used during takeover). Returns the text
  // so the input box can be pre-filled for the admin to edit before sending.
  async function handleSuggest(): Promise<string | null> {
    if (!selectedId) return null;
    setSuggesting(true);
    try {
      const res = await api<{ text: string }>(`/ai/generate-draft`, {
        method: 'POST',
        body: JSON.stringify({ conversationId: selectedId }),
      });
      return res.text;
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal membuat saran AI');
      return null;
    } finally {
      setSuggesting(false);
    }
  }

  // Open (or create) a chat with any number — WhatsApp desktop "new chat".
  async function handleStartChat(accId: string, phone: string, name: string) {
    const res = await api<{ id: string }>(`/conversations/start`, {
      method: 'POST',
      body: JSON.stringify({ accountId: accId, phoneNumber: phone, ...(name ? { name } : {}) }),
    });
    setSelectedId(res.id);
    loadList();
  }

  // Poll
  async function handleSendPoll(question: string, options: string[], selectableCount: number) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/poll`, {
        method: 'POST',
        body: JSON.stringify({ question, options, selectableCount }),
      });
      await loadConv(selectedId);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal kirim poll'); }
  }

  // Location
  async function handleSendLocation(latitude: number, longitude: number, name: string) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/location`, {
        method: 'POST',
        body: JSON.stringify({ latitude, longitude, name }),
      });
      await loadConv(selectedId);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal kirim lokasi'); }
  }

  // Contact
  async function handleSendContact(contacts: { name: string; phone: string }[]) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/contact`, {
        method: 'POST',
        body: JSON.stringify({ contacts }),
      });
      await loadConv(selectedId);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal kirim kontak'); }
  }

  // Forward
  async function handleForwardMessage(msgId: string, toPhone: string) {
    if (!selectedId) return;
    try {
      await api(`/conversations/${selectedId}/messages/${msgId}/forward`, {
        method: 'POST',
        body: JSON.stringify({ toPhone }),
      });
      setToast('Pesan berhasil diteruskan');
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal forward pesan'); }
  }

  // Archive
  async function handleArchive(id: string, archive: boolean) {
    try {
      await api(`/conversations/${id}/${archive ? 'archive' : 'unarchive'}`, { method: 'POST' });
      loadList();
      if (selectedId === id) loadConv(id);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal'); }
  }

  // Pin
  async function handlePin(id: string, pin: boolean) {
    try {
      await api(`/conversations/${id}/${pin ? 'pin' : 'unpin'}`, { method: 'POST' });
      loadList();
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal'); }
  }

  // Mute
  async function handleMute(id: string, mute: boolean) {
    try {
      await api(`/conversations/${id}/${mute ? 'mute' : 'unmute'}`, { method: 'POST' });
      loadList();
      if (selectedId === id) loadConv(id);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal'); }
  }

  // Mark unread
  async function handleMarkUnread(id: string) {
    try {
      await api(`/conversations/${id}/unread`, { method: 'POST' });
      loadList();
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal'); }
  }

  // Delete WA chat
  async function handleDeleteWaChat(id: string) {
    if (!window.confirm('Hapus chat dari WhatsApp? Data di dashboard tetap tersimpan.')) return;
    try {
      await api(`/conversations/${id}/wa-chat`, { method: 'DELETE' });
      loadList();
      if (selectedId === id) setSelectedId(null);
    } catch (e) { setToast(e instanceof Error ? e.message : 'Gagal'); }
  }

  // Validate number
  async function handleValidateNumber(phone: string): Promise<boolean> {
    if (!accountId) return false;
    try {
      const res = await api<{ exists: boolean }>('/conversations/validate-number', {
        method: 'POST',
        body: JSON.stringify({ accountId, phoneNumber: phone }),
      });
      return res.exists;
    } catch { return false; }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Sidebar />
      <div className="flex flex-1 overflow-hidden">
      <LeftPanel
        conversations={conversations}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
        filter={filter}
        search={search}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
        accounts={accounts}
        accountId={accountId}
        onAccountChange={setAccountId}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        labelFilter={labelFilter}
        onLabelFilterChange={setLabelFilter}
        onNewChat={() => setShowNewChat(true)}
        onPin={handlePin}
        onArchive={handleArchive}
        onMute={handleMute}
        onMarkUnread={handleMarkUnread}
        onDeleteWaChat={handleDeleteWaChat}
      />
      <CenterPanel
        conv={conv}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onUploadMedia={handleUploadMedia}
        onTakeover={handleTakeover}
        onReturnToAi={handleReturnToAi}
        onToggleAi={handleToggleAi}
        onApproveDraft={handleApproveDraft}
        onBlockDraft={handleBlockDraft}
        onSuggest={handleSuggest}
        suggesting={suggesting}
        sending={sending}
        typing={typing}
        quickReplies={quickReplies}
        onLoadOlder={handleLoadOlder}
        accountStatus={conv ? accounts.find((a) => a.id === conv.whatsappAccount.id)?.sessionStatus : undefined}
        onReact={handleReact}
        onEditMessage={handleEditMessage}
        onDeleteMessage={handleDeleteMessage}
        onSendPoll={handleSendPoll}
        onSendLocation={handleSendLocation}
        onSendContact={handleSendContact}
        onForwardMessage={handleForwardMessage}
      />
      <RightPanel
        conv={conv}
        admins={admins}
        onAiModeChange={handleAiModeChange}
        onAddNote={handleAddNote}
        onStatusChange={handleStatusChange}
        onAssign={handleAssign}
        onSetLabels={handleSetLabels}
      />
      {showNewChat && (
        <NewChatModal
          accounts={accounts}
          defaultAccountId={accountId}
          onClose={() => setShowNewChat(false)}
          onStart={handleStartChat}
        />
      )}
      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}
      </div>
    </div>
  );
}

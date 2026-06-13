'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
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
  lastMessage: string | null;
  lastMessageAt: string | null;
  customer: { id: string; name: string | null; phoneNumber: string; leadScore: number; leadStage: string; tags: string[] };
  whatsappAccount: { id: string; accountName: string; phoneNumber: string };
  messages: { content: string | null; senderType: string; createdAt: string; status: string }[];
}

interface ConvDetail {
  id: string;
  aiMode: string;
  takeoverStatus: string;
  customer: Customer & { status: string | null };
  whatsappAccount: { id: string; accountName: string; phoneNumber: string };
  bot: { id: string; botName: string } | null;
  messages: Message[];
  hermesReviews: HermesReview[];
}

type FilterTab = 'all' | 'ai_on' | 'ai_off' | 'ai_supervised' | 'needs_attention';

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
    ai_off: { label: 'AI OFF', cls: 'bg-gray-600 text-gray-100' },
    ai_draft: { label: 'Draft', cls: 'bg-yellow-700 text-yellow-100' },
    ai_supervised: { label: 'Supervised', cls: 'bg-blue-700 text-blue-100' },
    ai_paused: { label: 'Paused', cls: 'bg-red-700 text-red-100' },
  };
  const { label, cls } = map[mode] ?? { label: mode, cls: 'bg-gray-700 text-gray-100' };
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
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
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${map[decision] ?? 'bg-gray-700'}`}>
      {decision.replace('_', ' ')}
    </span>
  );
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
}: {
  conversations: ConvSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFilterChange: (f: FilterTab) => void;
  onSearchChange: (s: string) => void;
  filter: FilterTab;
  search: string;
}) {
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Semua' },
    { key: 'ai_on', label: 'AI ON' },
    { key: 'ai_off', label: 'AI OFF' },
    { key: 'ai_supervised', label: 'Supervised' },
    { key: 'needs_attention', label: '⚠ Perlu Perhatian' },
  ];

  return (
    <aside className="flex w-80 flex-col border-r border-black/40 bg-wa-panel">
      {/* Header */}
      <div className="border-b border-black/30 p-3">
        <h2 className="mb-2 text-sm font-semibold text-wa-accent">Percakapan</h2>
        <input
          type="text"
          placeholder="Cari nama / nomor..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded bg-black/30 px-3 py-1.5 text-sm outline-none placeholder:text-gray-500"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-black/30 px-2 py-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onFilterChange(t.key)}
            className={`shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors ${
              filter === t.key ? 'bg-wa-accent text-black' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <p className="p-4 text-xs text-gray-500">Tidak ada percakapan</p>
        )}
        {conversations.map((c) => {
          const lastMsg = c.messages[0];
          const needsAttention =
            c.takeoverStatus === 'waiting_admin' || c.aiMode === 'ai_paused';
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`w-full border-b border-black/20 px-3 py-3 text-left transition-colors hover:bg-black/20 ${
                selectedId === c.id ? 'bg-black/30' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {c.customer.name ?? c.customer.phoneNumber}
                    </span>
                    {needsAttention && (
                      <span className="shrink-0 text-xs text-orange-400">●</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-gray-400">
                    {lastMsg?.content ?? 'Belum ada pesan'}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs text-gray-500">{fmtTime(c.lastMessageAt)}</span>
                  {aiModeBadge(c.aiMode)}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

// ── Center Panel ───────────────────────────────────────────────────────────────

function MediaModal({
  onClose,
  onSend,
}: {
  onClose: () => void;
  onSend: (mediaType: string, url: string, caption: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [mediaType, setMediaType] = useState('image');
  const [caption, setCaption] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-96 rounded-lg border border-gray-700 bg-gray-800 p-5">
        <h3 className="mb-4 text-sm font-semibold text-gray-100">Kirim Media</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-400">Tipe Media</label>
            <select
              value={mediaType}
              onChange={(e) => setMediaType(e.target.value)}
              className="w-full rounded bg-gray-900 px-2 py-1.5 text-sm text-gray-100 outline-none"
            >
              <option value="image">Gambar</option>
              <option value="document">Dokumen</option>
              <option value="audio">Audio</option>
              <option value="video">Video</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded bg-gray-900 px-2 py-1.5 text-sm text-gray-100 outline-none placeholder:text-gray-600"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">Caption (opsional)</label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Keterangan..."
              className="w-full rounded bg-gray-900 px-2 py-1.5 text-sm text-gray-100 outline-none placeholder:text-gray-600"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { if (url.trim()) { onSend(mediaType, url.trim(), caption); onClose(); } }}
              disabled={!url.trim()}
              className="flex-1 rounded bg-emerald-600 py-1.5 text-sm font-medium text-white disabled:opacity-50 hover:bg-emerald-500"
            >
              Kirim
            </button>
            <button
              onClick={onClose}
              className="flex-1 rounded bg-gray-700 py-1.5 text-sm font-medium text-gray-100 hover:bg-gray-600"
            >
              Batal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageMedia({ msg }: { msg: Message }) {
  if (msg.messageType === 'image' && msg.mediaUrl) {
    return (
      <div>
        <img src={msg.mediaUrl} alt={msg.content ?? 'image'} className="max-w-full rounded" />
        {msg.content && <p className="mt-1 text-xs text-gray-300">{msg.content}</p>}
      </div>
    );
  }
  if (msg.messageType === 'document' && msg.mediaUrl) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg">📄</span>
        <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-300 underline">
          {msg.content ?? 'Dokumen'}
        </a>
      </div>
    );
  }
  if (msg.messageType === 'audio' && msg.mediaUrl) {
    return <audio controls src={msg.mediaUrl} className="w-full" />;
  }
  if (msg.messageType === 'video' && msg.mediaUrl) {
    return (
      <div>
        <video controls src={msg.mediaUrl} className="max-w-full rounded" />
        {msg.content && <p className="mt-1 text-xs text-gray-300">{msg.content}</p>}
      </div>
    );
  }
  return <p className="whitespace-pre-wrap">{msg.content}</p>;
}

function CenterPanel({
  conv,
  onSend,
  onSendMedia,
  onTakeover,
  onReturnToAi,
  onToggleAi,
  onApproveDraft,
  onBlockDraft,
  sending,
}: {
  conv: ConvDetail | null;
  onSend: (text: string) => void;
  onSendMedia: (mediaType: string, url: string, caption: string) => void;
  onTakeover: () => void;
  onReturnToAi: () => void;
  onToggleAi: () => void;
  onApproveDraft: (msgId: string) => void;
  onBlockDraft: (msgId: string) => void;
  sending: boolean;
}) {
  const [text, setText] = useState('');
  const [showMediaModal, setShowMediaModal] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages]);

  function handleSend() {
    if (!text.trim() || sending) return;
    onSend(text.trim());
    setText('');
  }

  if (!conv) {
    return (
      <section className="flex flex-1 items-center justify-center bg-wa-bg">
        <p className="text-sm text-gray-500">Pilih percakapan</p>
      </section>
    );
  }

  const isAdmin = conv.takeoverStatus === 'admin_takeover';
  const canSend = conv.aiMode === 'ai_off' || isAdmin;
  const isSupervisedPending = conv.aiMode === 'ai_supervised';

  return (
    <section className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-black/40 bg-wa-panel px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {conv.customer.name ?? conv.customer.phoneNumber}
              </span>
              {aiModeBadge(conv.aiMode)}
            </div>
            <p className="text-xs text-gray-400">{conv.customer.phoneNumber}</p>
          </div>
        </div>
        <div className="flex gap-2">
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
            className="rounded bg-wa-panel px-3 py-1 text-xs font-medium text-gray-300 ring-1 ring-gray-600 hover:ring-gray-400"
          >
            {conv.aiMode === 'ai_on' ? 'Matikan AI' : 'Nyalakan AI'}
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {conv.messages.map((m) => {
          const isCustomer = m.senderType === 'customer';
          const isDraft = m.senderType === 'ai' && m.status === 'pending';
          const isSystem = m.senderType === 'system' || m.senderType === 'hermes';

          if (isSystem) {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="rounded bg-black/30 px-3 py-1 text-xs text-gray-400">
                  {m.content}
                </span>
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                  isCustomer
                    ? 'bg-[#1f2c34] text-gray-100'
                    : isDraft
                    ? 'bg-yellow-900/60 text-yellow-100 ring-1 ring-yellow-600'
                    : 'bg-[#005c4b] text-gray-100'
                }`}
              >
                {isDraft && (
                  <div className="mb-1 flex items-center gap-1 text-xs text-yellow-400">
                    <span>Draft AI</span>
                  </div>
                )}
                <MessageMedia msg={m} />
                <div className="mt-1 flex items-center justify-end gap-1">
                  <span className="text-xs opacity-50">{fmtTime(m.createdAt)}</span>
                  {m.aiGenerated && !isCustomer && (
                    <span className="text-xs opacity-50">🤖</span>
                  )}
                </div>
                {/* Approve / Block buttons for supervised draft */}
                {isDraft && isSupervisedPending && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => onApproveDraft(m.id)}
                      className="rounded bg-green-700 px-2 py-0.5 text-xs font-medium hover:bg-green-600"
                    >
                      Approve
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
        />
      )}

      {/* Input */}
      {canSend && (
        <div className="border-t border-black/40 bg-wa-panel px-4 py-3">
          <div className="flex gap-2">
            <button
              onClick={() => setShowMediaModal(true)}
              title="Kirim media"
              className="rounded bg-black/30 px-2 py-2 text-gray-400 hover:text-gray-200"
            >
              📎
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
              className="flex-1 resize-none rounded bg-black/30 px-3 py-2 text-sm outline-none placeholder:text-gray-500"
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
        <div className="border-t border-black/40 bg-wa-panel px-4 py-3 text-center text-xs text-gray-500">
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
  onAiModeChange,
  onAddNote,
}: {
  conv: ConvDetail | null;
  onAiModeChange: (mode: string) => void;
  onAddNote: (note: string) => void;
}) {
  const [note, setNote] = useState('');
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

  if (!conv) return <aside className="w-72 border-l border-black/40 bg-wa-panel" />;

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
    <aside className="flex w-72 flex-col gap-4 overflow-y-auto border-l border-black/40 bg-wa-panel p-4">
      {/* Customer Info */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Info Customer
        </h3>
        <div className="space-y-1 text-sm">
          <p className="font-medium">{customer.name ?? '—'}</p>
          <p className="text-xs text-gray-400">{customer.phoneNumber}</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${leadColors[customer.leadStage] ?? 'text-gray-400'}`}>
              {customer.leadStage.replace('_', ' ').toUpperCase()}
            </span>
            <span className="text-xs text-gray-500">Score: {customer.leadScore}</span>
          </div>
          {customer.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {customer.tags.map((tag) => (
                <span key={tag} className="rounded bg-black/30 px-1.5 py-0.5 text-xs text-gray-300">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Mode Selector */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Mode AI
        </h3>
        <select
          value={conv.aiMode}
          onChange={(e) => onAiModeChange(e.target.value)}
          className="w-full rounded bg-black/30 px-2 py-1.5 text-sm outline-none"
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
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Catatan Internal
        </h3>
        {customer.notes && (
          <p className="mb-2 rounded bg-black/20 p-2 text-xs text-gray-300">{customer.notes}</p>
        )}
        <div className="flex gap-1">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tambah catatan..."
            className="flex-1 rounded bg-black/30 px-2 py-1 text-xs outline-none placeholder:text-gray-600"
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Hermes Review Terakhir
          </h3>
          <div className="space-y-1.5 rounded bg-black/20 p-2 text-xs">
            <div className="flex items-center gap-2">
              {decisionBadge(lastReview.decision)}
              <span className="text-gray-400">
                {lastReview.riskLevel.toUpperCase()} risk
              </span>
            </div>
            <div className="flex gap-3 text-gray-400">
              <span>Confidence: <span className="text-gray-200">{lastReview.confidenceScore}</span></span>
              <span>Risk: <span className="text-gray-200">{lastReview.riskScore}</span></span>
            </div>
            {lastReview.reason && (
              <p className="text-gray-400">{lastReview.reason}</p>
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
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Bot</h3>
          <p className="text-xs text-gray-300">{conv.bot.botName}</p>
        </div>
      )}

      {/* Follow-ups */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Follow-ups</h3>
          <button
            onClick={() => setShowFollowUpForm((v) => !v)}
            className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium text-emerald-100 hover:bg-emerald-600"
          >
            {showFollowUpForm ? 'Batal' : '+ Jadwalkan'}
          </button>
        </div>

        {showFollowUpForm && (
          <div className="mb-3 space-y-2 rounded bg-black/20 p-2">
            <textarea
              rows={2}
              value={fuMessage}
              onChange={(e) => setFuMessage(e.target.value)}
              placeholder="Pesan follow-up..."
              className="w-full resize-none rounded bg-black/30 px-2 py-1 text-xs outline-none placeholder:text-gray-600"
            />
            <input
              type="datetime-local"
              value={fuDateTime}
              onChange={(e) => setFuDateTime(e.target.value)}
              className="w-full rounded bg-black/30 px-2 py-1 text-xs text-gray-200 outline-none"
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
            <p className="text-xs text-gray-600">Belum ada follow-up.</p>
          )}
          {followUps.map((fu) => (
            <div key={fu.id} className="rounded bg-black/20 p-2 text-xs">
              <div className="mb-1 flex items-center justify-between gap-1">
                <span
                  className={`rounded px-1.5 py-0.5 font-medium ${
                    fu.status === 'pending'
                      ? 'bg-yellow-800 text-yellow-200'
                      : fu.status === 'sent'
                      ? 'bg-green-800 text-green-200'
                      : 'bg-gray-700 text-gray-400'
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
              <p className="mb-1 text-gray-300">{fu.message}</p>
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

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conv, setConv] = useState<ConvDetail | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // load conversation list
  const loadList = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filter === 'needs_attention') params.set('needsAttention', 'true');
      else if (filter !== 'all') params.set('aiMode', filter);
      if (search) params.set('search', search);
      params.set('limit', '100');
      const data = await api<{ items: ConvSummary[] }>(`/conversations?${params}`);
      setConversations(data.items);
    } catch {
      // silently fail on list
    }
  }, [filter, search]);

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 30_000);
    return () => clearInterval(t);
  }, [loadList]);

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
    if (selectedId) loadConv(selectedId);
    else setConv(null);
  }, [selectedId, loadConv]);

  // socket
  useEffect(() => {
    const socket = getSocket();

    socket.on('message:new', ({ conversationId, message }: { conversationId: string; message: Message }) => {
      // update detail if active
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
      // refresh list
      loadList();
    });

    socket.on('message:draft', ({ conversationId, message }: { conversationId: string; message: Message }) => {
      setConv((prev) => {
        if (!prev || prev.id !== conversationId) return prev;
        return { ...prev, messages: [...prev.messages, message] };
      });
    });

    socket.on('hermes:alert', ({ decision, reason }: { decision: string; reason: string }) => {
      setToast(`Hermes Alert: ${decision} — ${reason ?? ''}`);
    });

    return () => {
      socket.off('message:new');
      socket.off('message:draft');
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

  async function handleSend(text: string) {
    if (!selectedId) return;
    setSending(true);
    try {
      await api(`/conversations/${selectedId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      await loadConv(selectedId);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Gagal mengirim');
    } finally {
      setSending(false);
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

  // Stub: approve/block draft — in real flow you'd call hermes endpoint
  async function handleApproveDraft(msgId: string) {
    setToast(`Draft approved (msg ${msgId.slice(0, 8)})`);
  }

  async function handleBlockDraft(msgId: string) {
    setToast(`Draft blocked (msg ${msgId.slice(0, 8)})`);
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-900 text-gray-100">
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
      />
      <CenterPanel
        conv={conv}
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onTakeover={handleTakeover}
        onReturnToAi={handleReturnToAi}
        onToggleAi={handleToggleAi}
        onApproveDraft={handleApproveDraft}
        onBlockDraft={handleBlockDraft}
        sending={sending}
      />
      <RightPanel
        conv={conv}
        onAiModeChange={handleAiModeChange}
        onAddNote={handleAddNote}
      />
      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}
      </div>
    </div>
  );
}

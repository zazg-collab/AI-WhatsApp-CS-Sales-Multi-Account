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
  UsersRound,
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
  Ban,
  Contact,
  Keyboard,
  MapPin,
  Archive,
  Pin,
  Star,
  VolumeX,
  Vote,
} from 'lucide-react';
import { api, uploadFile, resolveMediaUrl } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusLabel, type StatusKind } from '@/components/ui/StatusLabel';
import { WhatsAppMark } from '@/components/WhatsAppMark';
import { cn } from '@/lib/cn';
import { contactDisplayName, formatPhone } from '@/lib/contact';
import { useT, type Dict } from '@/lib/i18n';

const dict: Dict = {
  // Filters
  filterAll: { id: 'Semua', en: 'All' },
  filterAttention: { id: 'Perlu tindakan', en: 'Needs action' },
  filterSla: { id: 'SLA berisiko', en: 'SLA at risk' },
  filterUnassigned: { id: 'Belum ditugaskan', en: 'Unassigned' },
  // AI mode select options
  aiModeOptionOn: { id: 'AI on', en: 'AI on' },
  aiModeOptionOff: { id: 'AI off', en: 'AI off' },
  aiModeOptionDraft: { id: 'AI draft', en: 'AI draft' },
  aiModeOptionSupervised: { id: 'AI supervised', en: 'AI supervised' },
  aiModeOptionPaused: { id: 'AI paused', en: 'AI paused' },
  // Workflow status options
  statusOpen: { id: 'Terbuka', en: 'Open' },
  statusPending: { id: 'Tertunda', en: 'Pending' },
  statusResolved: { id: 'Selesai', en: 'Resolved' },
  // Reaction labels
  reactionThumbsUp: { id: 'Thumbs up', en: 'Thumbs up' },
  reactionHeart: { id: 'Heart', en: 'Heart' },
  reactionLaugh: { id: 'Laugh', en: 'Laugh' },
  reactionSurprised: { id: 'Surprised', en: 'Surprised' },
  reactionSad: { id: 'Sad', en: 'Sad' },
  reactionThanks: { id: 'Thanks', en: 'Thanks' },
  reactWith: { id: 'React with {label}', en: 'React with {label}' },
  // Error fallbacks
  errLoadUsers: { id: 'Failed to load team users from API', en: 'Failed to load team users from API' },
  errLoadAccounts: { id: 'Failed to load WhatsApp accounts from API', en: 'Failed to load WhatsApp accounts from API' },
  errLoadConversations: { id: 'Failed to load conversations from API', en: 'Failed to load conversations from API' },
  errLoadConversation: { id: 'Failed to load conversation from API', en: 'Failed to load conversation from API' },
  // Number validation / start results
  numberRegistered: { id: 'terdaftar', en: 'registered' },
  numberNotRegistered: { id: 'tidak terdaftar', en: 'not registered' },
  numberResult: { id: '{phone} {state} di WhatsApp', en: '{phone} is {state} on WhatsApp' },
  conversationOpened: { id: 'Percakapan berhasil dibuka', en: 'Conversation opened successfully' },
  // Search
  searchPlaceholder: { id: 'Cari percakapan', en: 'Search conversations' },
  // Start chat panel
  startChat: { id: 'Mulai chat WhatsApp', en: 'Start WhatsApp chat' },
  pickSenderAccountLabel: { id: 'Pilih akun WhatsApp pengirim', en: 'Pick sender WhatsApp account' },
  pickSenderAccount: { id: 'Pilih akun pengirim', en: 'Pick sender account' },
  phonePlaceholder: { id: 'Nomor telepon', en: 'Phone number' },
  phoneAriaLabel: { id: 'Nomor telepon tujuan', en: 'Destination phone number' },
  namePlaceholder: { id: 'Nama (opsional)', en: 'Name (optional)' },
  nameAriaLabel: { id: 'Nama pelanggan (opsional)', en: 'Customer name (optional)' },
  checkNumber: { id: 'Cek nomor', en: 'Check number' },
  openChat: { id: 'Buka chat', en: 'Open chat' },
  // Queue list
  noConversationsFilter: { id: 'Tidak ada percakapan pada filter ini.', en: 'No conversations in this filter.' },
  noMessagesYet: { id: 'Belum ada pesan', en: 'No messages yet' },
  // Timeline header
  pickConversation: { id: 'Pilih percakapan untuk mulai membalas.', en: 'Select a conversation to start replying.' },
  markRead: { id: 'Tandai dibaca', en: 'Mark as read' },
  returnToAi: { id: 'Kembalikan ke AI', en: 'Return to AI' },
  takeover: { id: 'Ambil alih', en: 'Take over' },
  escalate: { id: 'Eskalasi', en: 'Escalate' },
  // Draft controls
  approveAndSend: { id: 'Setujui & kirim', en: 'Approve & send' },
  editDraft: { id: 'Edit draft', en: 'Edit draft' },
  blockSend: { id: 'Blokir kirim', en: 'Block send' },
  // Message bubble
  messageRetracted: { id: 'Pesan ditarik', en: 'Message retracted' },
  replyTo: { id: 'Balasan ke {sender}: {body}', en: 'Reply to {sender}: {body}' },
  aiGeneratedLabel: { id: 'Dibuat AI', en: 'AI-generated' },
  edited: { id: 'Diedit', en: 'Edited' },
  reactionsLabel: { id: 'Reaksi: {reactions}', en: 'Reactions: {reactions}' },
  reply: { id: 'Balas', en: 'Reply' },
  edit: { id: 'Edit', en: 'Edit' },
  retract: { id: 'Tarik', en: 'Retract' },
  reactToMessageLabel: { id: 'React to message', en: 'React to message' },
  clearReactionAction: { id: 'Hapus reaksi', en: 'Clear reaction' },
  // Composer
  editingSent: { id: 'Mengedit pesan terkirim', en: 'Editing sent message' },
  replyingTo: { id: 'Membalas {sender}', en: 'Replying to {sender}' },
  quotePreview: { id: '{prefix}: {body}', en: '{prefix}: {body}' },
  cancel: { id: 'Batal', en: 'Cancel' },
  attachMedia: { id: 'Attach media', en: 'Attach media' },
  composerEditPlaceholder: { id: 'Edit pesan terkirim', en: 'Edit sent message' },
  composerQuotePlaceholder: { id: 'Balas dengan kutipan pesan', en: 'Reply with quoted message' },
  composerPlaceholder: { id: 'Tulis balasan, atau edit draft AI di atas', en: 'Write a reply, or edit the AI draft above' },
  composerAriaLabel: { id: 'Tulis balasan', en: 'Write a reply' },
  save: { id: 'Simpan', en: 'Save' },
  send: { id: 'Kirim', en: 'Send' },
  // CRM panel
  viewReasoning: { id: 'Lihat alasan', en: 'View reasoning' },
  auditTrail: { id: 'Jejak audit', en: 'Audit trail' },
  noName: { id: 'Tanpa nama', en: 'No name' },
  hiddenContact: { id: 'Kontak WhatsApp', en: 'WhatsApp contact' },
  hiddenNumber: { id: 'Nomor tersembunyi (privasi WA)', en: 'Hidden number (WA privacy)' },
  leadStage: { id: 'Stage lead', en: 'Lead stage' },
  leadScore: { id: 'Skor lead', en: 'Lead score' },
  // WhatsApp controls
  whatsappControls: { id: 'Kontrol WhatsApp', en: 'WhatsApp controls' },
  aiModeField: { id: 'Mode AI', en: 'AI mode' },
  workflowStatusField: { id: 'Status alur', en: 'Workflow status' },
  labelField: { id: 'Label', en: 'Label' },
  labelPlaceholder: { id: 'prioritas, renewal, tagihan', en: 'priority, renewal, invoice' },
  // Assigned admin
  assignedTo: { id: 'Ditugaskan ke', en: 'Assigned to' },
  change: { id: 'Ubah', en: 'Change' },
  unassign: { id: 'Lepas tugas', en: 'Unassign' },
  notAssigned: { id: 'Belum ditugaskan', en: 'Not assigned' },
  // Hermes review
  hermesReview: { id: 'Review Hermes AI', en: 'Hermes AI review' },
  confidenceScore: { id: 'Skor keyakinan', en: 'Confidence score' },
  riskScore: { id: 'Skor risiko', en: 'Risk score' },
  riskLevel: { id: 'Level risiko', en: 'Risk level' },
  hermesReason: { id: 'Alasan Hermes', en: 'Hermes reasoning' },
  recommendation: { id: 'Rekomendasi: {text}', en: 'Recommendation: {text}' },
  noHermesReview: { id: 'Belum ada review Hermes untuk percakapan ini.', en: 'No Hermes review for this conversation yet.' },
  // Risk flags
  riskFlags: { id: 'Tanda risiko', en: 'Risk flags' },
  slaMissed: { id: 'SLA terlewat', en: 'SLA missed' },
  aiPausedFlag: { id: 'AI dijeda', en: 'AI paused' },
  riskLevelFlag: { id: 'Risiko {level}', en: '{level} risk' },
  noActiveRisk: { id: 'Tidak ada tanda risiko aktif.', en: 'No active risk flags.' },
  // Automation
  automationMode: { id: 'Mode otomasi', en: 'Automation mode' },
  active: { id: 'Aktif', en: 'Active' },
  noBotAssigned: { id: 'Belum ada bot otomasi yang ditugaskan.', en: 'No automation bot assigned yet.' },
  // Audit panel
  escalateToSupervisor: { id: 'Eskalasi ke supervisor', en: 'Escalate to supervisor' },
  // MediaContent
  mediaImage: { id: 'Image', en: 'Image' },
  mediaVideo: { id: 'Video', en: 'Video' },
  // buildAudit
  auditAiReply: { id: 'AI membuat balasan', en: 'AI generated a reply' },
  auditHermes: { id: 'Hermes {decision}', en: 'Hermes {decision}' },
  auditTakeover: { id: 'Admin mengambil alih', en: 'Admin took over' },
  auditAssigned: { id: 'Ditugaskan ke {name}', en: 'Assigned to {name}' },
  auditNoActions: { id: 'Belum ada tindakan tersupervisi', en: 'No supervised actions yet' },
};

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
  isArchived?: boolean;
  isPinned?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
  isGroup?: boolean;
  groupSubject?: string | null;
  groupParticipants?: Array<{ jid: string; admin?: string | null }> | null;
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
  { key: 'all', label: 'filterAll' },
  { key: 'attention', label: 'filterAttention' },
  { key: 'sla', label: 'filterSla' },
  { key: 'unassigned', label: 'filterUnassigned' },
];

const aiModeLabel: Record<string, string> = {
  ai_on: 'AI ON',
  ai_off: 'AI OFF',
  ai_draft: 'AI Draft',
  ai_supervised: 'AI Supervised',
  ai_paused: 'AI Paused',
};


const aiModeOptions = [
  { value: 'ai_on', label: 'aiModeOptionOn' },
  { value: 'ai_off', label: 'aiModeOptionOff' },
  { value: 'ai_draft', label: 'aiModeOptionDraft' },
  { value: 'ai_supervised', label: 'aiModeOptionSupervised' },
  { value: 'ai_paused', label: 'aiModeOptionPaused' },
];

const statusOptions = [
  { value: 'open', label: 'statusOpen' },
  { value: 'pending', label: 'statusPending' },
  { value: 'resolved', label: 'statusResolved' },
];

const reactionOptions = [
  { emoji: '👍', label: 'reactionThumbsUp' },
  { emoji: '❤️', label: 'reactionHeart' },
  { emoji: '😂', label: 'reactionLaugh' },
  { emoji: '😮', label: 'reactionSurprised' },
  { emoji: '😢', label: 'reactionSad' },
  { emoji: '🙏', label: 'reactionThanks' },
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
  const t = useT(dict);
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
  const [typingCustomer, setTypingCustomer] = useState<{ conversationId: string; phone: string } | null>(null);
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
  const [locationDraft, setLocationDraft] = useState('');
  const [pollDraft, setPollDraft] = useState('');
  const [contactDraft, setContactDraft] = useState('');
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const activeIdRef = useRef<string | null>(activeId);
  activeIdRef.current = activeId;
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
      .catch((err) => setAdminError(err instanceof Error ? err.message : t('errLoadUsers')));
  }, [t]);

  useEffect(() => {
    api<WaAccount[]>('/wa/accounts')
      .then((items) => {
        setAccounts(items);
        if (items[0]) setStartAccountId((current) => current || items[0].id);
      })
      .catch((err) => setListError(err instanceof Error ? err.message : t('errLoadAccounts')));
  }, [t]);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50' });
    if (debounced.trim()) params.set('search', debounced.trim());
    try {
      const data = await api<{ items: ConvSummary[] }>(`/conversations?${params}`);
      setList(data.items);
      setListError(null);
    } catch (err) {
      setListError(err instanceof Error ? err.message : t('errLoadConversations'));
    }
  }, [debounced, t]);

  const loadConv = useCallback(async (id: string) => {
    try {
      const data = await api<ConvDetail>(`/conversations/${id}`);
      setConv(data);
      setDetailError(null);
      api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    } catch (err) {
      setConv(null);
      setDetailError(err instanceof Error ? err.message : t('errLoadConversation'));
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

  // Refs to always hold the latest callbacks so the socket useEffect never
  // needs to re-run just because loadList/loadConv changed.
  const loadListRef = useRef(loadList);
  loadListRef.current = loadList;
  const loadConvRef = useRef(loadConv);
  loadConvRef.current = loadConv;

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
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

  // Close menus on Escape (a11y).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowSchedule(false);
        setShowMoreMenu(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  const labelsKey = conv?.labels?.join(',') ?? '';
  useEffect(() => {
    setLabelDraft(labelsKey.split(',').join(', ') || '');
    setQuoteMessage(null);
    setEditingMessage(null);
  }, [conv?.id, labelsKey]);

  // Auto-scroll the timeline on new messages.
  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [conv?.messages.length]);

  // ── Live updates ───────────────────────────────────────────────────
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onConnect = () => setLiveConnected(true);
    const onDisconnect = () => setLiveConnected(false);
    setLiveConnected(socket.connected);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
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
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onNew);
      socket.off('message:draft', onDraft);
      socket.off('message:draft-removed', onDraftRemoved);
      socket.off('message:status', onStatus);
      socket.off('message:updated', onMessageUpdated);
      socket.off('conversation:updated', onConvUpdate);
      socket.off('conversation:sla-breach', onConvUpdate);
      socket.off('conversation:sla-cleared', onConvUpdate);
      socket.off('hermes:alert', onConvUpdate);
      socket.off('wa:presence', onPresence);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const sendLocation = () => act(async () => {
    const [latRaw, lngRaw, ...nameParts] = locationDraft.split(',').map((part) => part.trim());
    const latitude = Number(latRaw);
    const longitude = Number(lngRaw);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    await api(`/conversations/${activeId}/location`, {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, name: nameParts.join(', ') || undefined }),
    });
    setLocationDraft('');
  });
  const sendPoll = () => act(async () => {
    const [question, ...options] = pollDraft.split('|').map((part) => part.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    await api(`/conversations/${activeId}/poll`, {
      method: 'POST',
      body: JSON.stringify({ question, options, selectableCount: 1 }),
    });
    setPollDraft('');
  });
  const sendContactCard = () => act(async () => {
    const [name, phone] = contactDraft.split('|').map((part) => part.trim());
    if (!name || !phone) return;
    await api(`/conversations/${activeId}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ contacts: [{ name, phone }] }),
    });
    setContactDraft('');
  });
  const setContactBlocked = (blocked: boolean) => act(() => api(`/conversations/${activeId}/${blocked ? 'block-contact' : 'unblock-contact'}`, { method: 'POST' }));
  const setChatMuted = (mute: boolean) => act(() => api(`/conversations/${activeId}/mute`, { method: 'POST', body: JSON.stringify({ mute }) }));
  const setChatArchived = (archive: boolean) => act(() => api(`/conversations/${activeId}/archive`, { method: 'POST', body: JSON.stringify({ archive }) }));
  const setChatPinned = (pin: boolean) => act(() => api(`/conversations/${activeId}/pin`, { method: 'POST', body: JSON.stringify({ pin }) }));
  const setMessageStarred = (messageId: string, star: boolean) => act(() => api(`/conversations/${activeId}/messages/${messageId}/star`, { method: 'POST', body: JSON.stringify({ star }) }));
  const setDisappearing = (enable: boolean) => act(() => api(`/conversations/${activeId}/disappearing-messages`, { method: 'POST', body: JSON.stringify({ enable, duration: 7 * 24 * 60 * 60 }) }));
  const sendTypingPresence = (typing: boolean) => act(() => api(`/conversations/${activeId}/typing`, { method: 'POST', body: JSON.stringify({ typing }) }));
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
    setStartResult(t('numberResult', { phone: result.phoneNumber, state: result.exists ? t('numberRegistered') : t('numberNotRegistered') }));
  });

  const startConversation = () => act(async () => {
    if (!startAccountId || !startPhone.trim()) return;
    const opened = await api<ConvDetail>('/conversations/start', {
      method: 'POST',
      body: JSON.stringify({ accountId: startAccountId, phoneNumber: startPhone.trim(), name: startName.trim() || undefined }),
    });
    setActiveId(opened.id);
    setStartResult(t('conversationOpened'));
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
      <div className="flex h-full min-h-0 flex-1 gap-2 bg-gray-100 px-2 sm:px-3 dark:bg-gray-950 overflow-hidden">
        {/* ── Panel 1: queue ──────────────────────────────────────── */}
        <section className={cn('shrink-0 flex-col rounded-l border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900', 'w-full sm:w-56 md:w-60 lg:w-64 xl:w-72', activeId ? 'hidden sm:flex' : 'flex')}>
          <div className="flex h-14 items-center gap-2 border-b border-gray-100 px-3 dark:border-gray-800">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
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
                  'shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  filter === f.key
                    ? 'bg-hermes-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
                )}
              >
                {t(f.label)}
              </button>
            ))}
          </div>

          <div className="border-b border-gray-100 p-3 dark:border-gray-800">
            <div className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-gray-700 dark:text-gray-200">
              <UserPlus className="h-3.5 w-3.5 text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
              {t('startChat')}
            </div>
            <div className="space-y-2">
              <select
                value={startAccountId}
                onChange={(e) => setStartAccountId(e.target.value)}
                aria-label={t('pickSenderAccountLabel')}
                className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
              >
                <option value="">{t('pickSenderAccount')}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.accountName} ({account.phoneNumber})</option>
                ))}
              </select>
              <input
                value={startPhone}
                onChange={(e) => setStartPhone(e.target.value)}
                placeholder={t('phonePlaceholder')}
                aria-label={t('phoneAriaLabel')}
                className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <input
                value={startName}
                onChange={(e) => setStartName(e.target.value)}
                placeholder={t('namePlaceholder')}
                aria-label={t('nameAriaLabel')}
                className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={validateNumber} disabled={busy || !startAccountId || !startPhone.trim()}>
                  <PhoneCall className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  {t('checkNumber')}
                </Button>
                <Button size="sm" onClick={startConversation} disabled={busy || !startAccountId || !startPhone.trim()}>
                  <WhatsAppMark className="h-4 w-4" />
                  {t('openChat')}
                </Button>
              </div>
              {startResult && <p className="text-xs text-gray-500 dark:text-gray-400">{startResult}</p>}
            </div>
          </div>

          <ul className="scrollbar-thin flex-1 overflow-y-auto">
            {listError ? (
              <li className="px-4 py-10 text-center text-sm text-danger-600">{listError}</li>
            ) : visible.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-400">{t('noConversationsFilter')}</li>
            )}
            {visible.map((c) => {
              const isActive = c.id === activeId;
              const name = c.isGroup ? c.groupSubject || c.customer.name || c.customer.phoneNumber : contactDisplayName(c.customer.name, c.customer.phoneNumber, t('hiddenContact'));
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
                      {c.isGroup ? <UsersRound className="h-4 w-4" /> : initials(c.customer.name, c.customer.phoneNumber)}
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-white bg-channel-500 text-white dark:border-gray-900" title="WhatsApp" aria-label="WhatsApp channel"><WhatsAppMark className="h-2.5 w-2.5" /></span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">{name}</span>
                        <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{relTime(c.lastMessageAt)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{c.lastMessage ?? t('noMessagesYet')}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <StatusLabel kind={summaryStatus(c)} />
                        {c.isGroup && <Badge tone="neutral">Group</Badge>}
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
        <section className={cn('operations-surface relative min-w-[320px] flex-1 flex-col border-y border-gray-200 dark:border-gray-800 rounded', activeId ? 'flex' : 'hidden sm:flex')}>
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-gray-400">
              <InboxIcon className="mb-2 h-7 w-7 text-gray-300" strokeWidth={1.5} aria-hidden="true" />
              <p className={cn('text-sm', detailError && 'text-danger-600')}>
                {detailError ?? t('pickConversation')}
              </p>
            </div>
          ) : (
            <>
              <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-4 dark:border-gray-800 dark:bg-gray-900">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    onClick={() => { setActiveId(null); setShowRightPanel(false); }}
                    className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 md:hidden"
                    title="Back to conversations"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                  </button>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {active.isGroup ? <UsersRound className="h-4 w-4" /> : initials(active.customer.name, active.customer.phoneNumber)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {active.isGroup ? active.groupSubject || active.customer.name || active.customer.phoneNumber : contactDisplayName(active.customer.name, active.customer.phoneNumber, t('hiddenContact'))}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Badge tone="channel">
                        <WhatsAppMark className="h-3 w-3" />
                        WhatsApp
                      </Badge>
                      {active.isGroup && (
                        <Badge tone="neutral">
                          <UsersRound className="h-3 w-3" />
                          {active.groupParticipants?.length ? `${active.groupParticipants.length} members` : 'Group'}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className="flex items-center gap-1 text-[11px] font-medium text-gray-400"
                    title={liveConnected ? 'Realtime connected' : 'Realtime reconnecting…'}
                  >
                    <span className={cn('h-2 w-2 rounded-full', liveConnected ? 'bg-channel-500' : 'animate-pulse bg-review-500')} />
                  </span>
                  <Badge tone="hermes" className="hidden md:flex">
                    <Workflow className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    {aiModeLabel[active.aiMode] ?? active.aiMode}
                  </Badge>
                  {takenOver ? (
                    <Button size="sm" onClick={returnToAi} disabled={busy} className="hidden sm:inline-flex">
                      <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      <span className="hidden lg:inline">{t('returnToAi')}</span>
                    </Button>
                  ) : (
                    <Button size="sm" onClick={takeOver} disabled={busy} className="hidden sm:inline-flex">
                      <Hand className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                      <span className="hidden lg:inline">{t('takeover')}</span>
                    </Button>
                  )}
                  <div className="relative">
                    <Button variant="ghost" size="sm" onClick={() => setShowMoreMenu(!showMoreMenu)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM14 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0z" /></svg>
                    </Button>
                    {showMoreMenu && (
                      <div className="absolute right-0 top-10 z-50 w-44 rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                        <button
                          type="button"
                          onClick={() => { setShowRightPanel(true); setShowMoreMenu(false); }}
                          className="flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800 xl:hidden"
                        >
                          <FileSearch className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                          Tampilkan Detail
                        </button>
                        <button
                          type="button"
                          onClick={() => { markRead(); setShowMoreMenu(false); }}
                          disabled={busy}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <CheckCheck className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                          {t('markRead')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { escalate(); setShowMoreMenu(false); }}
                          disabled={busy}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <ArrowUpRight className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                          {t('escalate')}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowSchedule(true); setShowMoreMenu(false); setScheduleErr(null); }}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <CalendarClock className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                          Schedule
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div ref={timelineRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-5">
                {active.messages.map((m) => {
                  const isCustomer = m.senderType === 'customer';
                  const isDraft = m.senderType === 'ai' && m.status === 'pending';
                  const isHovered = hoveredMessageId === m.id;
                  if (isDraft) {
                    return (
                      <div key={m.id} className="flex justify-end">
                        <div className="w-[75%] sm:w-[65%] rounded-lg border border-hermes-200 bg-hermes-50 p-3 dark:border-hermes-800 dark:bg-hermes-900/30">
                          <div className="mb-2 flex items-center gap-2">
                            <StatusLabel kind="ai-generated" />
                            <StatusLabel kind="needs-review" />
                          </div>
                          <p className="text-[13px] leading-relaxed text-gray-800 dark:text-gray-100">{m.content}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Button size="sm" onClick={() => approveDraft(m.id)} disabled={busy}>
                              <CircleCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              {t('approveAndSend')}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => editDraft(m)}>
                              <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              {t('editDraft')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => blockDraft(m.id)} disabled={busy} className="text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-700/10">
                              <CircleX className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                              {t('blockSend')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={m.id} className={cn('group flex', isCustomer ? 'justify-start' : 'justify-end')}>
                      <div
                        onMouseEnter={() => setHoveredMessageId(m.id)}
                        onMouseLeave={() => setHoveredMessageId(null)}
                        onClick={() => setHoveredMessageId((cur) => (cur === m.id ? null : m.id))}
                        className={cn(
                          'relative max-w-[75%] sm:max-w-[65%] rounded-lg px-3 py-2 text-[13px] leading-relaxed shadow-card',
                          isCustomer
                            ? 'rounded-tl-sm bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-100'
                            : 'rounded-tr-sm bg-hermes-600 text-white',
                        )}
                      >
                        {m.deletedAt && (
                          <span className="mb-1 block text-[10px] font-medium text-danger-100">{t('messageRetracted')}</span>
                        )}
                        {m.quotedMessage && (
                          <div className={cn('mb-1 rounded border-l-2 px-2 py-1 text-[11px]', isCustomer ? 'border-gray-300 bg-gray-50 text-gray-500 dark:bg-gray-700/60' : 'border-hermes-200 bg-hermes-700/40 text-hermes-100')}>
                            {t('replyTo', { sender: m.quotedMessage.senderType, body: m.quotedMessage.content ?? m.quotedMessage.messageType })}
                          </div>
                        )}
                        {m.aiGenerated && !isCustomer && (
                          <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-hermes-100">
                            <Workflow className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
                            {t('aiGeneratedLabel')}
                          </span>
                        )}
                        <MediaContent message={m} />
                        {m.editedAt && <span className={cn('mt-1 block text-[10px]', isCustomer ? 'text-gray-400' : 'text-hermes-100')}>{t('edited')}</span>}
                        {m.reactions && Object.keys(m.reactions).length > 0 && (
                          <span className={cn('mt-1 block text-[10px]', isCustomer ? 'text-gray-400' : 'text-hermes-100')}>
                            {t('reactionsLabel', { reactions: Object.keys(m.reactions).join(' ') })}
                          </span>
                        )}
                        <div className={cn('mt-1 flex items-center justify-between gap-2 text-[10px] tabular-nums', isCustomer ? 'text-gray-400' : 'text-hermes-100')}>
                          <span className="flex items-center gap-1">
                            {clockTime(m.createdAt)}
                            {!isCustomer && <StatusTick status={m.status} />}
                          </span>
                        </div>
                        {isHovered && (
                          <div className={cn('absolute top-0 -translate-y-8 whitespace-nowrap rounded-lg border bg-white px-2 py-1 text-[11px] shadow-lg dark:border-gray-700 dark:bg-gray-800', isCustomer ? 'left-0' : 'right-0')}>
                            <div className="flex items-center gap-1.5">
                              {!m.deletedAt && (
                                <>
                                  <button type="button" onClick={() => quoteReply(m)} className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white" title={t('reply')}>
                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" /></svg>
                                  </button>
                                  <button type="button" onClick={() => setMessageStarred(m.id, !m.isStarred)} className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white" title={m.isStarred ? 'Unstar' : 'Star'}>
                                    <Star className={cn('h-3.5 w-3.5', m.isStarred && 'fill-current')} strokeWidth={1.75} aria-hidden="true" />
                                  </button>
                                  {!isCustomer && (
                                    <button type="button" onClick={() => editSentMessage(m)} className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white" title={t('edit')}>
                                      <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                                    </button>
                                  )}
                                  <button type="button" onClick={() => deleteMessage(m.id)} className="text-gray-600 hover:text-danger-600 dark:text-gray-300 dark:hover:text-danger-400" title={t('retract')}>
                                    <CircleX className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                                  </button>
                                  <span className="text-gray-300 dark:text-gray-600">|</span>
                                  {reactionOptions.map((reaction) => (
                                    <button
                                      key={reaction.emoji}
                                      type="button"
                                      onClick={() => reactToMessage(m.id, reaction.emoji)}
                                      className="text-base hover:scale-125"
                                      title={t('reactWith', { label: t(reaction.label) })}
                                    >
                                      {reaction.emoji}
                                    </button>
                                  ))}
                                  {m.reactions && Object.keys(m.reactions).length > 0 && (
                                    <button type="button" onClick={() => clearReaction(m.id)} className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white text-[10px]" title={t('clearReactionAction')}>
                                      ✕
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Customer typing indicator */}
              {typingCustomer && conv && typingCustomer.phone === conv.customer.phoneNumber && (
                <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-400">
                  <span className="flex gap-0.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                  </span>
                  {conv.customer.name ?? conv.customer.phoneNumber} sedang mengetik…
                </div>
              )}

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
                      {t('quotePreview', {
                        prefix: editingMessage ? t('editingSent') : t('replyingTo', { sender: quoteMessage?.senderType ?? '' }),
                        body: (editingMessage ?? quoteMessage)?.content ?? (editingMessage ?? quoteMessage)?.messageType ?? '',
                      })}
                    </span>
                    <button type="button" onClick={() => { setQuoteMessage(null); setEditingMessage(null); setComposer(''); }} className="font-semibold">{t('cancel')}</button>
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
                    title={t('attachMedia')}
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
                    placeholder={editingMessage ? t('composerEditPlaceholder') : quoteMessage ? t('composerQuotePlaceholder') : t('composerPlaceholder')}
                    aria-label={t('composerAriaLabel')}
                    className="scrollbar-thin max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-hermes-400 focus:bg-white focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                  <Button size="md" onClick={sendMessage} disabled={sending || !composer.trim()}>
                    <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {editingMessage ? t('save') : t('send')}
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
          <>
            {/* Desktop (xl+): Side panel — below xl there isn't room for 3 columns + nav */}
            <aside className={cn('shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900', 'xl:w-72 2xl:w-80', 'hidden xl:flex')}>
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
                    {t('viewReasoning')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start"
                    onClick={() => auditRef.current?.scrollIntoView({ block: 'nearest' })}
                  >
                    <ScrollText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    {t('auditTrail')}
                  </Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                    {initials(active.customer.name, active.customer.phoneNumber)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{active.customer.name || t('noName')}</p>
                    <p className="truncate text-xs text-gray-400">{formatPhone(active.customer.phoneNumber, t('hiddenNumber'))}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                    <p className="text-gray-400">{t('leadStage')}</p>
                    <p className="font-medium capitalize text-gray-800 dark:text-gray-100">{active.customer.leadStage.replace('_', ' ')}</p>
                  </div>
                  <div className="rounded-md bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                    <p className="text-gray-400">{t('leadScore')}</p>
                    <p className="font-medium tabular-nums text-gray-800 dark:text-gray-100">{active.customer.leadScore} / 100</p>
                  </div>
                </div>
                {active.customer.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {active.customer.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
                  </div>
                )}
              </div>


              {/* Mode & Status */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Mode & Status</h3>
                <div className="space-y-3 text-xs">
                  <label className="block">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('aiModeField')}</span>
                    <select value={active.aiMode} onChange={(e) => setAiMode(e.target.value)} className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      {aiModeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('workflowStatusField')}</span>
                    <select value={active.status} onChange={(e) => setWorkflowStatus(e.target.value)} className="h-8 w-full rounded border border-gray-200 bg-gray-50 px-2 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                      {statusOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('labelField')}</span>
                    <div className="flex gap-2">
                      <input value={labelDraft} onChange={(e) => setLabelDraft(e.target.value)} placeholder={t('labelPlaceholder')} className="h-8 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <Button size="sm" variant="outline" onClick={saveLabels} disabled={busy}>{t('save')}</Button>
                    </div>
                  </label>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => sendTypingPresence(true)} disabled={busy} title="Show typing indicator" className="justify-center text-[11px] h-9 sm:h-8">
                    <Keyboard className="h-4 sm:h-3.5 w-4 sm:w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span className="hidden sm:inline">Typing</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setChatPinned(!active.isPinned)} disabled={busy} className={cn('justify-center text-[11px] h-9 sm:h-8', active.isPinned && 'bg-amber-50 border-amber-300 text-amber-700')} title={active.isPinned ? 'Unpin chat' : 'Pin chat'}>
                    <Pin className={cn('h-4 sm:h-3.5 w-4 sm:w-3.5', active.isPinned && 'fill-current')} strokeWidth={1.75} aria-hidden="true" />
                    <span className="hidden sm:inline">{active.isPinned ? 'Pinned' : 'Pin'}</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setChatArchived(!active.isArchived)} disabled={busy} title={active.isArchived ? 'Restore from archive' : 'Archive chat'} className="justify-center text-[11px] h-9 sm:h-8 col-span-2 sm:col-span-1">
                    <Archive className="h-4 sm:h-3.5 w-4 sm:w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span className="hidden sm:inline">{active.isArchived ? 'Archived' : 'Archive'}</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setChatMuted(true)} disabled={busy} title="Mute notifications" className="justify-center text-[11px] h-9 sm:h-8">
                    <VolumeX className="h-4 sm:h-3.5 w-4 sm:w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span className="hidden sm:inline">Mute</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setContactBlocked(true)} disabled={busy} className="justify-center text-[11px] text-danger-600 h-9 sm:h-8" title="Block contact">
                    <Ban className="h-4 sm:h-3.5 w-4 sm:w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span className="hidden sm:inline">Block</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDisappearing(true)} disabled={busy} title="Enable 7-day disappearing messages" className="justify-center text-[11px] h-9 sm:h-8">
                    <Clock className="h-4 sm:h-3.5 w-4 sm:w-3.5" strokeWidth={1.75} aria-hidden="true" />
                    <span className="hidden sm:inline">7d</span>
                  </Button>
                </div>
              </div>

              {/* Send Content */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Send Content</h3>
                <div className="space-y-2.5 text-xs">
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-gray-600 dark:text-gray-300">Location</span>
                    <div className="flex gap-2">
                      <input value={locationDraft} onChange={(e) => setLocationDraft(e.target.value)} placeholder="-6.2, 106.8, Store" className="h-9 sm:h-8 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <Button size="sm" variant="outline" onClick={sendLocation} disabled={busy || !locationDraft.trim()} className="h-9 sm:h-8"><MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /></Button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-gray-600 dark:text-gray-300">Poll</span>
                    <div className="flex gap-2">
                      <input value={pollDraft} onChange={(e) => setPollDraft(e.target.value)} placeholder="Question | A | B" className="h-9 sm:h-8 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <Button size="sm" variant="outline" onClick={sendPoll} disabled={busy || !pollDraft.trim()} className="h-9 sm:h-8"><Vote className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /></Button>
                    </div>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[12px] font-medium text-gray-600 dark:text-gray-300">Contact</span>
                    <div className="flex gap-2">
                      <input value={contactDraft} onChange={(e) => setContactDraft(e.target.value)} placeholder="Name | 628..." className="h-9 sm:h-8 min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 px-2.5 text-sm sm:text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100" />
                      <Button size="sm" variant="outline" onClick={sendContactCard} disabled={busy || !contactDraft.trim()} className="h-9 sm:h-8"><Contact className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /></Button>
                    </div>
                  </label>
                </div>
              </div>

              {/* Assigned admin */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                    <UserRound className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                    {t('assignedTo')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAssign((v) => !v)}
                    className="text-[11px] font-medium text-hermes-600 hover:text-hermes-700"
                  >
                    {showAssign ? t('cancel') : t('change')}
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
                      {t('unassign')}
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
                  <p className="text-xs text-gray-400">{t('notAssigned')}</p>
                )}
              </div>

              {/* Hermes review */}
              <div ref={reasoningRef} className="border-b border-gray-100 p-4 dark:border-gray-800">
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                    <ShieldCheck className="h-4 w-4 text-hermes-600" strokeWidth={1.75} aria-hidden="true" />
                    {t('hermesReview')}
                  </h3>
                  {review && (
                    <Badge tone={riskTone[review.riskLevel] ?? 'neutral'}>{review.decision.replace('_', ' ')}</Badge>
                  )}
                </div>
                {review ? (
                  <>
                    <dl className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-400">{t('confidenceScore')}</dt>
                        <dd className="font-medium tabular-nums text-gray-800 dark:text-gray-100">{review.confidenceScore}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-400">{t('riskScore')}</dt>
                        <dd className="font-medium tabular-nums text-gray-800 dark:text-gray-100">{review.riskScore}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-gray-400">{t('riskLevel')}</dt>
                        <dd className="font-medium capitalize text-gray-800 dark:text-gray-100">{review.riskLevel}</dd>
                      </div>
                    </dl>
                    {review.reason && (
                      <div className="mt-2.5 rounded-md bg-gray-50 px-2.5 py-2 text-xs leading-relaxed text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        <div className="mb-1 flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200">
                          <FileSearch className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          {t('hermesReason')}
                        </div>
                        {review.reason}
                      </div>
                    )}
                    {review.recommendation && (
                      <p className="mt-1.5 text-xs text-gray-500">{t('recommendation', { text: review.recommendation })}</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-gray-400">{t('noHermesReview')}</p>
                )}
              </div>

              {/* Risk flags */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">{t('riskFlags')}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {active.slaBreachedAt && (
                    <Badge tone="review">
                      <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {t('slaMissed')}
                    </Badge>
                  )}
                  {active.aiMode === 'ai_paused' && (
                    <Badge tone="danger">
                      <CircleX className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {t('aiPausedFlag')}
                    </Badge>
                  )}
                  {review && (review.riskLevel === 'high' || review.riskLevel === 'critical') && (
                    <Badge tone="danger">
                      <TriangleAlert className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                      {t('riskLevelFlag', { level: review.riskLevel })}
                    </Badge>
                  )}
                  {!active.slaBreachedAt && active.aiMode !== 'ai_paused' && !(review && (review.riskLevel === 'high' || review.riskLevel === 'critical')) && (
                    <span className="text-xs text-gray-400">{t('noActiveRisk')}</span>
                  )}
                </div>
              </div>

              {/* Answering bot */}
              <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                <h3 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <Workflow className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  {t('automationMode')}
                </h3>
                {active.bot ? (
                  <div className="flex items-center justify-between rounded-md border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-700">
                    <span className="truncate text-gray-700 dark:text-gray-200">{active.bot.botName}</span>
                    <Badge tone="success">{t('active')}</Badge>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{t('noBotAssigned')}</p>
                )}
              </div>

              {/* Audit timeline (derived from message facts) */}
              <div ref={auditRef} className="p-4">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                  <ScrollText className="h-4 w-4 text-gray-400" strokeWidth={1.75} aria-hidden="true" />
                  {t('auditTrail')}
                </h3>
                <ol className="space-y-3 text-xs">
                  {buildAudit(active).map((e, i) => {
                    const Icon = e.icon;
                    return (
                      <li key={i} className="flex gap-2.5">
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', e.tone)} strokeWidth={1.75} aria-hidden="true" />
                        <div className="flex-1">
                          <p className="text-gray-700 dark:text-gray-200">{t(e.label, e.vars)}</p>
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
                {t('escalateToSupervisor')}
              </Button>
            </div>
            </aside>

            {/* Mobile/Tablet: Bottom Sheet Modal */}
            {showRightPanel && (
              <>
                {/* Overlay */}
                <div
                  className="fixed inset-0 z-40 bg-black/40 xl:hidden transition-opacity"
                  onClick={() => setShowRightPanel(false)}
                  aria-label="Close details"
                />
                {/* Bottom Sheet */}
                <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] rounded-t-2xl border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:hidden animate-in slide-in-from-bottom-5 duration-300">
                  {/* Handle Bar + Header */}
                  <div className="flex flex-col items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
                    {/* Handle bar indicator */}
                    <div className="mb-2 h-1 w-12 rounded-full bg-gray-300 dark:bg-gray-600" />
                    <div className="flex w-full items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Informasi Pelanggan</h3>
                      <Button variant="ghost" size="sm" onClick={() => setShowRightPanel(false)} className="h-7 w-7 p-0">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                      </Button>
                    </div>
                  </div>
                  {/* Content */}
                  <div className="scrollbar-thin overflow-y-auto">
                    {/* Customer */}
                    <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start text-[11px]"
                          onClick={() => reasoningRef.current?.scrollIntoView({ block: 'nearest' })}
                        >
                          <FileSearch className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          Alasan
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-start text-[11px]"
                          onClick={() => auditRef.current?.scrollIntoView({ block: 'nearest' })}
                        >
                          <ScrollText className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          Audit
                        </Button>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {initials(active.customer.name, active.customer.phoneNumber)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{active.customer.name || t('noName')}</p>
                          <p className="truncate text-[11px] text-gray-400">{formatPhone(active.customer.phoneNumber, t('hiddenNumber'))}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-md bg-gray-50 px-2 py-1 dark:bg-gray-800">
                          <p className="text-gray-400">{t('leadStage')}</p>
                          <p className="font-medium capitalize text-gray-800 dark:text-gray-100">{active.customer.leadStage.replace('_', ' ')}</p>
                        </div>
                        <div className="rounded-md bg-gray-50 px-2 py-1 dark:bg-gray-800">
                          <p className="text-gray-400">{t('leadScore')}</p>
                          <p className="font-medium tabular-nums text-gray-800 dark:text-gray-100">{active.customer.leadScore}</p>
                        </div>
                      </div>
                      {active.customer.tags.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {active.customer.tags.map((tag) => <Badge key={tag} tone="neutral" className="text-[10px]">{tag}</Badge>)}
                        </div>
                      )}
                    </div>

                    {/* Mode & Status */}
                    <div className="border-b border-gray-100 p-4 dark:border-gray-800">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Mode & Status</h3>
                      <div className="space-y-2 text-xs">
                        <label className="block">
                          <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('aiModeField')}</span>
                          <select value={active.aiMode} onChange={(e) => setAiMode(e.target.value)} className="h-7 w-full rounded border border-gray-200 bg-gray-50 px-2 text-[11px] text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                            {aiModeOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                          </select>
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-gray-600 dark:text-gray-300">{t('workflowStatusField')}</span>
                          <select value={active.status} onChange={(e) => setWorkflowStatus(e.target.value)} className="h-7 w-full rounded border border-gray-200 bg-gray-50 px-2 text-[11px] text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                            {statusOptions.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

// Render message content: text, or inline media for non-text types.
function MediaContent({ message: m }: { message: Message }) {
  const t = useT(dict);
  const mediaSrc = resolveMediaUrl(m.mediaUrl);

  if (m.messageType === 'image') {
    if (mediaSrc) {
      return (
        <span className="block">
          <img src={mediaSrc} alt={m.content ?? t('mediaImage')} className="max-h-60 max-w-[280px] rounded-lg object-cover" loading="lazy" />
          {m.content && <span className="mt-1 block text-[13px] opacity-90">{m.content}</span>}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <ImageIcon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {m.content ?? t('mediaImage')}
      </span>
    );
  }
  if (m.messageType === 'video') {
    if (mediaSrc) {
      return (
        <span className="block">
          <video src={mediaSrc} controls preload="none" className="max-h-60 max-w-[280px] rounded-lg" />
          {m.content && <span className="mt-1 block text-[13px] opacity-90">{m.content}</span>}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <Video className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {m.content ?? t('mediaVideo')}
      </span>
    );
  }
  if (m.messageType === 'audio') {
    if (mediaSrc) {
      return (
        <span className="block">
          <audio src={mediaSrc} controls preload="none" className="w-full max-w-[240px]" />
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        <FileText className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {m.content ?? 'audio'}
      </span>
    );
  }
  if (m.messageType === 'sticker') {
    if (mediaSrc) {
      return <img src={mediaSrc} alt="sticker" className="max-h-32 max-w-[160px] object-contain" loading="lazy" />;
    }
    return (
      <span className="flex items-center gap-1.5 italic opacity-80">
        🏷️ {m.content ?? 'sticker'}
      </span>
    );
  }
  if (m.messageType === 'document' || m.messageType === 'file') {
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
  const out: { label: string; vars?: Record<string, string | number>; time: string | null; icon: typeof Workflow; tone: string }[] = [];
  const firstAi = conv.messages.find((m) => m.aiGenerated);
  if (firstAi) out.push({ label: 'auditAiReply', time: firstAi.createdAt, icon: Workflow, tone: 'text-hermes-600' });
  if (conv.hermesReviews[0]) out.push({ label: 'auditHermes', vars: { decision: conv.hermesReviews[0].decision.replace('_', ' ') }, time: null, icon: ShieldCheck, tone: 'text-review-600' });
  if (conv.takeoverStatus === 'admin_takeover') out.push({ label: 'auditTakeover', time: null, icon: Hand, tone: 'text-gray-500' });
  if (conv.assignedAdmin) out.push({ label: 'auditAssigned', vars: { name: conv.assignedAdmin.name }, time: null, icon: Hand, tone: 'text-gray-500' });
  if (out.length === 0) out.push({ label: 'auditNoActions', time: null, icon: History, tone: 'text-gray-400' });
  return out;
}

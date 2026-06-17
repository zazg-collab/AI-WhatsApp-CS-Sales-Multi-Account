'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  MagnifyingGlass,
  ShieldStar,
  Warning,
  Hand,
  PencilSimple,
  CheckCircle,
  ArrowUpRight,
  ArrowLeft,
  FileMagnifyingGlass,
  PaperPlaneTilt,
  ArrowsSplit,
  Scroll,
  ClockCounterClockwise,
  Clock,
  XCircle,
  ArrowCounterClockwise,
  Tray as InboxIcon,
  Paperclip,
  Images,
  User,
  UsersThree,
  UserMinus,
  Checks,
  Lightning,
  CalendarCheck,
  UserPlus,
  PhoneCall,
  Prohibit,
  AddressBook,
  Keyboard,
  MapPin,
  Archive,
  PushPin,
  Star,
  SpeakerSimpleX,
  Notepad,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { api, uploadFile, resolveMediaUrl } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { StatusLabel, type StatusKind } from '@/components/ui/StatusLabel';
import { WhatsAppMark } from '@/components/WhatsAppMark';
import { Avatar } from '@/components/ui/Avatar';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { contactDisplayName, formatPhone } from '@/lib/contact';
import { useT, type Dict } from '@/lib/i18n';
import {
  StatusTick,
  MediaContent,
  ConversationList,
  ChatThread,
  IntelligencePanel,
} from '@/features/inbox/components';

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
  composerBlockedDisconnected: { id: 'Akun WhatsApp ini terputus. Sambungkan kembali sebelum mengirim pesan.', en: 'This WhatsApp account is disconnected. Reconnect it before sending messages.' },
  composerBlockedBanned: { id: 'Akun WhatsApp ini diblokir/banned. Pesan tidak dapat dikirim.', en: 'This WhatsApp account is banned. Messages cannot be sent.' },
  composerBlockedPaused: { id: 'AI dihentikan untuk percakapan ini karena risiko terdeteksi. Anda masih dapat mengirim pesan secara manual.', en: 'AI is paused on this conversation due to a detected risk. You can still send manually.' },
  composerBlockedGoToAccounts: { id: 'Buka Akun', en: 'Open Accounts' },
  showDetails: { id: 'Tampilkan Detail', en: 'Show details' },
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
  sendFromLibrary: { id: 'Kirim dari Media Library', en: 'Send from Media Library' },
  assetSuggestLabel: { id: '💡 Saran kirim:', en: '💡 Suggested:' },
  assetSuggestSend: { id: 'Kirim', en: 'Send' },
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
  botPersonaField: { id: 'Bot / Persona', en: 'Bot / Persona' },
  botDefaultOption: { id: 'Default (dari akun)', en: 'Default (from account)' },
  activePersona: { id: 'Persona aktif', en: 'Active persona' },
  suggestPersona: { id: 'Saran persona (AI)', en: 'Suggest persona (AI)' },
  suggestingPersona: { id: 'Menganalisa…', en: 'Analyzing…' },
  suggestedPersona: { id: 'Saran', en: 'Suggested' },
  applySuggestion: { id: 'Terapkan', en: 'Apply' },
  dismiss: { id: 'Tutup', en: 'Dismiss' },
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
  whatsappAccount: { id: string; accountName: string; phoneNumber: string };
  bot: { id: string; botName: string; persona?: { id: string; name: string } | null } | null;
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
  const [confirmAction, setConfirmAction] = useState<{ type: 'retract' | 'block'; messageId?: string } | null>(null);
  const [bots, setBots] = useState<Array<{ id: string; botName: string; persona?: { name: string } | null }>>([]);
  const [assetsList, setAssetsList] = useState<Array<{ id: string; title: string; kind: string; purpose: string }>>([]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [assetSuggestions, setAssetSuggestions] = useState<Array<{ id: string; title: string; kind: string; purpose: string; reason: string }>>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [botSuggestion, setBotSuggestion] = useState<{ botId: string; botName: string; personaName: string | null; reason: string } | null>(null);
  const [suggestingBot, setSuggestingBot] = useState(false);
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

  useEffect(() => {
    api<Array<{ id: string; botName: string; persona?: { name: string } | null }>>('/bots')
      .then(setBots)
      .catch(() => setBots([]));
    api<Array<{ id: string; title: string; kind: string; purpose: string }>>('/assets?status=active')
      .then(setAssetsList)
      .catch(() => setAssetsList([]));
  }, []);

  // Asset suggestions for the open conversation — refreshed when a new message
  // arrives (conv reloads, changing its message count). Deterministic + cheap.
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
  const clearReaction = (msgId: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji: '' }) }));
  const reactToMessage = (msgId: string, emoji: string) => act(() => api(`/conversations/${activeId}/messages/${msgId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }));
  const markRead = () => act(() => api(`/conversations/${activeId}/read`, { method: 'POST' }));
  const setAiMode = (aiMode: string) => act(() => api(`/conversations/${activeId}/ai-mode`, { method: 'PATCH', body: JSON.stringify({ aiMode }) }));
  const setBot = (botId: string) => act(() => api(`/conversations/${activeId}/bot`, { method: 'PATCH', body: JSON.stringify({ botId: botId || null }) }));
  const sendAsset = (assetId: string) => act(() => api(`/assets/${assetId}/send`, { method: 'POST', body: JSON.stringify({ conversationId: activeId }) }).then(() => setShowAssetPicker(false)));
  const suggestBot = async () => {
    if (!activeId) return;
    setSuggestingBot(true);
    setBotSuggestion(null);
    try {
      const s = await api<{ botId: string; botName: string; personaName: string | null; reason: string } | null>(`/learning/conversations/${activeId}/suggest-bot`);
      setBotSuggestion(s);
    } catch {
      setBotSuggestion(null);
    } finally {
      setSuggestingBot(false);
    }
  };
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
          onEditMessage={async (id) => conv?.messages?.find(m => m.id === id) && editSentMessage(conv.messages.find(m => m.id === id)!)}
          onDeleteMessage={async (id) => deleteMessage(id)}
          onBack={() => setActiveId(null)}
          onShowDetails={() => setShowRightPanel(!showRightPanel)}
          onClearQuote={() => setQuoteMessage(null)}
          onClearEdit={() => setEditingMessage(null)}
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
          onSetBot={async (botId) => setBot(botId || '')}
        />
      </div>
    </AppLayout>
  );
}

// Build a small, truthful audit trail from what the conversation actually shows.
function buildAudit(conv: ConvDetail) {
  const out: { label: string; vars?: Record<string, string | number>; time: string | null; icon: PhosphorIcon; tone: string }[] = [];
  const firstAi = conv.messages.find((m) => m.aiGenerated);
  if (firstAi) out.push({ label: 'auditAiReply', time: firstAi.createdAt, icon: ArrowsSplit, tone: 'text-hermes-600' });
  if (conv.hermesReviews[0]) out.push({ label: 'auditHermes', vars: { decision: conv.hermesReviews[0].decision.replace('_', ' ') }, time: null, icon: ShieldStar, tone: 'text-review-600' });
  if (conv.takeoverStatus === 'admin_takeover') out.push({ label: 'auditTakeover', time: null, icon: Hand, tone: 'text-gray-500' });
  if (conv.assignedAdmin) out.push({ label: 'auditAssigned', vars: { name: conv.assignedAdmin.name }, time: null, icon: Hand, tone: 'text-gray-500' });
  if (out.length === 0) out.push({ label: 'auditNoActions', time: null, icon: ClockCounterClockwise, tone: 'text-gray-400' });
  return out;
}

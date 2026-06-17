export interface AdminUser {
  id: string;
  name: string;
}

export interface WaAccount {
  id: string;
  accountName: string;
  phoneNumber: string;
  sessionStatus?: string;
}

export interface Message {
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

export interface HermesReview {
  id: string;
  decision: string;
  confidenceScore: number;
  riskScore: number;
  riskLevel: string;
  reason: string | null;
  recommendation: string | null;
}

export interface ConvSummary {
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

export interface ConvDetail {
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
  whatsappAccount: WaAccount;
  bot: { id: string; botName: string; persona?: { id: string; name: string } | null } | null;
  assignedAdmin?: AdminUser | null;
  labels?: string[];
  messages: Message[];
  hermesReviews: HermesReview[];
}

export type Filter = 'all' | 'attention' | 'sla' | 'unassigned';

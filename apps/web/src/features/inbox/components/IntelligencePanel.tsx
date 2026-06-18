'use client';

import { cn } from '@/lib/cn';
import {
  CustomerCard,
  HermesReviewCard,
  DraftControls,
  AiModeControl,
  WorkflowStatus,
  BotSelector,
  TakeoverCard,
  AssignAdmin,
  ConversationLabels,
  FollowUps,
  InternalNotes,
  AuditTrail,
} from './index';
import type { FollowUp } from './FollowUps';
import type { AdminUser, ConvDetail, Message } from '../inbox.types';

interface IntelligencePanelProps {
  conversation: ConvDetail | null;
  draftMessage?: Message | null;
  bots?: Array<{ id: string; botName: string; persona?: { name: string } | null }>;
  onApproveDraft?: () => Promise<void>;
  onBlockDraft?: () => Promise<void>;
  onTakeover?: () => Promise<void>;
  onSetAiMode?: (mode: string) => Promise<void>;
  onSetStatus?: (status: string) => Promise<void>;
  onSetBot?: (botId: string | null) => Promise<void>;
  onUpdateNotes?: (notes: string) => Promise<void>;
  onEditDraft?: () => void;
  onSuggestBot?: () => Promise<void>;
  botSuggestion?: { botId: string; botName: string; personaName: string | null; reason: string } | null;
  admins?: AdminUser[];
  onAssignAdmin?: (adminId: string | null) => Promise<void>;
  onSaveLabels?: (labels: string[]) => Promise<void>;
  followUps?: FollowUp[];
  onScheduleFollowUp?: (scheduledAt: string, message: string) => Promise<void>;
  onCancelFollowUp?: (id: string) => Promise<void>;
  approvingDraft?: boolean;
  blockingDraft?: boolean;
  loadingControls?: boolean;
  /** Controls the slide-over drawer on screens below xl (where the panel is otherwise hidden). */
  open?: boolean;
  onClose?: () => void;
}

/**
 * IntelligencePanel: Right sidebar showing intelligence, controls, and metadata.
 *
 * Responsibilities:
 * - Display customer CRM context (name, phone, avatar, lead score, tags, notes)
 * - Show Hermes AI review (decision, confidence, risk, recommendation)
 * - Draft approval/blocking controls
 * - AI mode toggle (on/off/draft/supervised/paused)
 * - Bot selection dropdown
 * - Takeover card + admin info
 * - Internal notes editing
 * - Audit trail (recent actions)
 *
 * Owned by inbox/page.tsx:
 * - When to show/hide panel (responsive: hidden on mobile, xl:flex on desktop)
 * - All state changes (triggered by callbacks)
 * - Rich state for draft controls, takeover status, etc.
 */
export function IntelligencePanel({
  conversation,
  draftMessage,
  bots = [],
  onApproveDraft,
  onBlockDraft,
  onTakeover,
  onSetAiMode,
  onSetStatus,
  onSetBot,
  onUpdateNotes,
  onEditDraft,
  onSuggestBot,
  botSuggestion,
  admins = [],
  onAssignAdmin,
  onSaveLabels,
  followUps = [],
  onScheduleFollowUp,
  onCancelFollowUp,
  approvingDraft = false,
  blockingDraft = false,
  loadingControls = false,
  open = false,
  onClose,
}: IntelligencePanelProps) {
  if (!conversation) {
    return (
      <aside className="shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 hidden xl:flex">
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Select a conversation
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* Backdrop for the mobile/tablet slide-over */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-gray-900/40 backdrop-blur-[1px] xl:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
          // desktop xl+: fills the wrapper div (width controlled by parent for resizing)
          'xl:static xl:z-auto xl:flex xl:w-full xl:shadow-none',
          // below xl: slide-over drawer toggled by `open`
          'fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] shadow-xl',
          open ? 'flex' : 'hidden xl:flex',
        )}
      >
        {/* Drawer header with close — only below xl */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800 xl:hidden">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Details</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800"
          >
            ✕
          </button>
        </div>
      {/* key by conversation id so stateful children (notes editor, etc.) reset on switch */}
      <div key={conversation.id} className="scrollbar-thin flex-1 overflow-y-auto">
        <CustomerCard conversation={conversation} />

        <HermesReviewCard conversation={conversation} />

        <DraftControls
          draftMessage={draftMessage || null}
          approving={approvingDraft}
          blocking={blockingDraft}
          onApprove={onApproveDraft}
          onBlock={onBlockDraft}
          onEdit={onEditDraft}
        />

        <AiModeControl
          conversation={conversation}
          onSetMode={onSetAiMode}
          loading={loadingControls}
        />

        <WorkflowStatus
          conversation={conversation}
          onSetStatus={onSetStatus}
          loading={loadingControls}
        />

        <BotSelector
          conversation={conversation}
          bots={bots}
          onSetBot={onSetBot}
          onSuggestBot={onSuggestBot}
          suggestion={botSuggestion}
          loading={loadingControls}
        />

        <TakeoverCard
          conversation={conversation}
          onRelease={onTakeover}
          loading={loadingControls}
        />

        <AssignAdmin
          conversation={conversation}
          admins={admins}
          onAssign={onAssignAdmin}
          loading={loadingControls}
        />

        <ConversationLabels
          conversation={conversation}
          onSaveLabels={onSaveLabels}
          loading={loadingControls}
        />

        <FollowUps
          followUps={followUps}
          onSchedule={onScheduleFollowUp}
          onCancel={onCancelFollowUp}
          loading={loadingControls}
        />

        <InternalNotes
          conversation={conversation}
          onUpdateNotes={onUpdateNotes}
          loading={loadingControls}
        />

        <AuditTrail conversation={conversation} />
      </div>
      </aside>
    </>
  );
}

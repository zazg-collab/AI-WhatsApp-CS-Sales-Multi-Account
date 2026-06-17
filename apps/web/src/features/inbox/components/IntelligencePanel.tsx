'use client';

import type { ConvDetail } from '../inbox.types';

interface IntelligencePanelProps {
  conversation: ConvDetail | null;
  onApproveDraft?: () => Promise<void>;
  onBlockDraft?: () => Promise<void>;
  onTakeover?: () => Promise<void>;
  onSetAiMode?: (mode: string) => Promise<void>;
  onSetBot?: (botId: string | null) => Promise<void>;
}

/**
 * IntelligencePanel: Right sidebar showing intelligence, controls, and metadata.
 *
 * Responsibilities:
 * - Customer card (name, phone, avatar, lead score, tags, notes)
 * - Hermes review display (decision, confidence, risk, recommendation)
 * - Draft approval/blocking controls
 * - AI mode toggle (on/off/draft/supervised/paused)
 * - Bot selection dropdown
 * - Assignment controls
 * - Takeover button + admin note
 * - Audit trail (recent actions)
 * - Labels + internal notes
 *
 * Owned by inbox/page.tsx:
 * - When to show/hide panel (responsive: hidden on mobile, xl:flex on desktop)
 * - All state changes (triggered by onApproveDraft, onSetAiMode, etc.)
 * - Rich state for draft controls, takeover status, etc.
 */
export function IntelligencePanel({
  conversation,
  onApproveDraft,
  onBlockDraft,
  onTakeover,
  onSetAiMode,
  onSetBot,
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
    <aside className="shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 xl:w-72 2xl:w-80 hidden xl:flex">
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        {/* Customer card */}
        {/* TODO: Extract to <CustomerCard customer={conversation.customer} /> */}

        {/* Hermes review card */}
        {conversation.hermesReviews[0] && (
          <>
            {/* TODO: Extract to <HermesReviewCard review={conversation.hermesReviews[0]} /> */}
          </>
        )}

        {/* Draft controls */}
        {/* TODO: Extract to <DraftControls
          message={draftMessage}
          onApprove={onApproveDraft}
          onBlock={onBlockDraft}
        /> */}

        {/* AI mode toggle */}
        {/* TODO: Extract to <AiModeControl
          aiMode={conversation.aiMode}
          onSetMode={onSetAiMode}
        /> */}

        {/* Bot selector */}
        {/* TODO: Extract to <BotSelector
          currentBot={conversation.bot}
          onSetBot={onSetBot}
        /> */}

        {/* Takeover + admin note */}
        {conversation.takeoverStatus === 'admin_takeover' && (
          <>
            {/* TODO: Extract to <TakeoverCard
              assignedTo={conversation.assignedAdmin}
              onRelease={() => onTakeover?.()}
            /> */}
          </>
        )}

        {/* Internal notes + labels */}
        {/* TODO: Extract to <InternalNotes notes={conversation.customer.notes} /> */}

        {/* Audit trail */}
        {/* TODO: Extract to <AuditTrail actions={buildAudit(conversation)} /> */}
      </div>
    </aside>
  );
}

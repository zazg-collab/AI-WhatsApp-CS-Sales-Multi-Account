'use client';

import {
  CustomerCard,
  HermesReviewCard,
  DraftControls,
  AiModeControl,
  BotSelector,
  TakeoverCard,
  InternalNotes,
  AuditTrail,
} from './index';
import type { ConvDetail, Message } from '../inbox.types';

interface IntelligencePanelProps {
  conversation: ConvDetail | null;
  draftMessage?: Message | null;
  bots?: Array<{ id: string; botName: string; persona?: { name: string } | null }>;
  onApproveDraft?: () => Promise<void>;
  onBlockDraft?: () => Promise<void>;
  onTakeover?: () => Promise<void>;
  onSetAiMode?: (mode: string) => Promise<void>;
  onSetBot?: (botId: string | null) => Promise<void>;
  onUpdateNotes?: (notes: string) => Promise<void>;
  approvingDraft?: boolean;
  blockingDraft?: boolean;
  loadingControls?: boolean;
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
  onSetBot,
  onUpdateNotes,
  approvingDraft = false,
  blockingDraft = false,
  loadingControls = false,
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
        <CustomerCard conversation={conversation} />

        <HermesReviewCard conversation={conversation} />

        <DraftControls
          draftMessage={draftMessage || null}
          approving={approvingDraft}
          blocking={blockingDraft}
          onApprove={onApproveDraft}
          onBlock={onBlockDraft}
          onEdit={() => {}} // TODO: trigger edit mode
        />

        <AiModeControl
          conversation={conversation}
          onSetMode={onSetAiMode}
          loading={loadingControls}
        />

        <BotSelector
          conversation={conversation}
          bots={bots}
          onSetBot={onSetBot}
          loading={loadingControls}
        />

        <TakeoverCard
          conversation={conversation}
          onRelease={onTakeover}
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
  );
}

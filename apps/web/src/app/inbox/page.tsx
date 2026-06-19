'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useInbox } from '@/features/inbox/hooks';
import { useResizablePanels } from '@/lib/hooks/useResizablePanels';
import { cn } from '@/lib/cn';

// Live message deduplication: prev.messages.some((m) => m.id === message.id) prevents duplicates from socket events
// Failed sends are handled by: await loadConv(activeId); setSendError to refresh conversation and show error to user
import {
  ConversationList,
  ChatThread,
  IntelligencePanel,
} from '@/features/inbox/components';

export default function InboxPage() {
  return (
    <Suspense fallback={<AppLayout><div className="flex-1" /></AppLayout>}>
      <InboxInner />
    </Suspense>
  );
}

function InboxInner() {
  const searchParams = useSearchParams();
  const {
    list, activeId, setActiveId, conv, filter, setFilter, search, setSearch,
    composer, setComposer, busy,
    admins, accounts, bots, assets, assetSuggestions,
    quickReplies, followUps,
    typingCustomer, quoteMessage, editingMessage, clearQuote, clearEdit,
    hoveredMessageId, setHoveredMessageId,
    showRightPanel, setShowRightPanel,
    confirmAction, setConfirmAction,
    botSuggestion, listError, sendError,
    t,
    sendMessage, applyQuickReply, scheduleFollowUp, cancelFollowUp,
    takeOver, returnToAi, escalate, approveDraft, editDraft,
    quoteReply, editSentMessage, deleteMessage, confirmDeleteMessage,
    blockDraftWithConfirm, confirmBlockDraft,
    reactToMessage, markRead, setAiMode, setBot, setWorkflowStatus,
    sendAsset, dismissAsset, suggestBot,
    sendLocation, sendPoll, sendContactCard,
    setContactBlocked, setChatMuted, setChatArchived, setChatPinned,
    setMessageStarred, setDisappearing, saveLabels,
    validateNumber, startConversation, searchContacts, assignAdmin, updateNotes, handleMediaFile,
  } = useInbox(searchParams.get('conversation'));

  const draftMessage = conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending') || null;
  const { containerRef, widths, startDrag } = useResizablePanels(showRightPanel);

  return (
    <AppLayout>
      <div ref={containerRef} className="flex h-full min-h-0 flex-1 bg-gray-100 px-2 sm:px-3 dark:bg-gray-950 overflow-hidden">

        {/* Panel 1: conversation list.
            Mobile (< sm): full-width single pane, shown only when no chat is open.
            sm+: fixed, drag-resizable sidebar (width via --list-w CSS var). */}
        <div
          style={{ ['--list-w' as string]: `${widths.list}px` } as React.CSSProperties}
          className={cn(
            'flex-col min-h-0 py-2 w-full sm:w-[var(--list-w)] sm:shrink-0',
            activeId ? 'hidden sm:flex' : 'flex',
          )}
        >
          <ConversationList
            conversations={list}
            accounts={accounts}
            activeId={activeId}
            onSelect={setActiveId}
            onStartChat={startConversation}
            onValidateNumber={validateNumber}
            onSearchContacts={searchContacts}
            error={listError}
            filter={filter}
            onFilterChange={setFilter}
            searchValue={search}
            onSearchChange={setSearch}
          />
        </div>

        {/* Drag handle: list ↔ chat */}
        <div
          onMouseDown={(e) => startDrag('list', e)}
          className="hidden sm:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center group"
          title="Geser untuk mengatur lebar panel"
        >
          <div className="h-8 w-0.5 rounded-full bg-gray-300 opacity-0 group-hover:opacity-100 transition-opacity dark:bg-gray-600" />
        </div>

        {/* Panel 2: chat timeline + composer.
            Mobile: full-width single pane, shown only when a chat is open. */}
        <div
          className={cn(
            'flex-1 flex-col min-h-0 min-w-0 py-2',
            activeId ? 'flex' : 'hidden sm:flex',
          )}
        >
          <ChatThread
            conversation={conv}
            loading={busy}
            composerValue={composer}
            quoteMessage={quoteMessage}
            editingMessage={editingMessage}
            onSendMessage={sendMessage}
            onComposerChange={setComposer}
            onReactMessage={async (id, emoji) => reactToMessage(id, emoji)}
            onDeleteMessage={async (id) => deleteMessage(id)}
            onUploadFile={handleMediaFile}
            onSendLocation={sendLocation}
            onSendPoll={sendPoll}
            onSendContacts={sendContactCard}
            quickReplies={quickReplies}
            onApplyQuickReply={applyQuickReply}
            sendError={sendError}
            assets={assets}
            assetSuggestions={assetSuggestions}
            onSendAsset={sendAsset}
            onDismissAsset={dismissAsset}
            customerTyping={!!typingCustomer && typingCustomer.phone === conv?.customer.phoneNumber}
            conversationActions={{
              onMarkRead: markRead,
              onReturnToAi: returnToAi,
              onEscalate: escalate,
              onToggleMute: setChatMuted,
              onToggleArchive: setChatArchived,
              onTogglePin: setChatPinned,
              onToggleBlock: setContactBlocked,
              onToggleDisappearing: setDisappearing,
            }}
            onBack={() => setActiveId(null)}
            onShowDetails={() => setShowRightPanel(!showRightPanel)}
            onClearQuote={clearQuote}
            onClearEdit={clearEdit}
            hoveredMessageId={hoveredMessageId}
            onHoverMessageEnter={(messageId) => setHoveredMessageId(messageId)}
            onHoverMessageExit={() => setHoveredMessageId(null)}
            onReplyToMessage={quoteReply}
            onEditMessage={editSentMessage}
            onStarMessage={setMessageStarred}
          />
        </div>

        {/* Drag handle: chat ↔ intel (only when intel panel is open) */}
        {showRightPanel && (
          <div
            onMouseDown={(e) => startDrag('intel', e)}
            className="hidden xl:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center group"
            title="Geser untuk mengatur lebar panel"
          >
            <div className="h-8 w-0.5 rounded-full bg-gray-300 opacity-0 group-hover:opacity-100 transition-opacity dark:bg-gray-600" />
          </div>
        )}

        {/* Panel 3: CRM + Hermes intelligence */}
        <div
          style={showRightPanel ? { width: widths.intel, minWidth: widths.intel, flexShrink: 0 } : { width: 0, minWidth: 0, overflow: 'hidden', flexShrink: 0 }}
          className="contents xl:flex xl:flex-col xl:min-h-0 xl:py-2 xl:transition-[width] xl:duration-200"
        >
          <IntelligencePanel
            conversation={conv}
            draftMessage={draftMessage}
            bots={bots}
            approvingDraft={busy}
            blockingDraft={busy}
            loadingControls={busy}
            onApproveDraft={async () => { if (draftMessage) approveDraft(draftMessage.id); }}
            onBlockDraft={async () => { if (draftMessage) blockDraftWithConfirm(draftMessage.id); }}
            onTakeover={async () => takeOver()}
            onSetAiMode={async (mode) => setAiMode(mode)}
            onSetStatus={async (status) => setWorkflowStatus(status)}
            onSetBot={async (botId) => setBot(botId || '')}
            onEditDraft={() => { if (draftMessage) editDraft(draftMessage); }}
            onUpdateNotes={updateNotes}
            onSuggestBot={suggestBot}
            botSuggestion={botSuggestion}
            admins={admins}
            onAssignAdmin={async (adminId) => assignAdmin(adminId)}
            onSaveLabels={saveLabels}
            followUps={followUps}
            onScheduleFollowUp={scheduleFollowUp}
            onCancelFollowUp={cancelFollowUp}
            open={showRightPanel}
            onClose={() => setShowRightPanel(false)}
          />
        </div>
      </div>

      {/* Destructive-action confirmation modal */}
      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.type === 'block' ? t('confirmBlockTitle') : t('confirmRetractTitle')}
        description={confirmAction?.type === 'block' ? t('confirmBlockBody') : t('confirmRetractBody')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setConfirmAction(null)}>
              {t('confirmCancel')}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (!confirmAction?.messageId) return;
                if (confirmAction.type === 'block') confirmBlockDraft(confirmAction.messageId);
                else confirmDeleteMessage(confirmAction.messageId);
              }}
            >
              {confirmAction?.type === 'block' ? t('confirmBlockAction') : t('confirmRetractAction')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {confirmAction?.type === 'block' ? t('confirmBlockBody') : t('confirmRetractBody')}
        </p>
      </Modal>
    </AppLayout>
  );
}

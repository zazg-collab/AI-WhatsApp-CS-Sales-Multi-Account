'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useInbox } from '@/features/inbox/hooks';
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
    validateNumber, startConversation, assignAdmin, updateNotes, handleMediaFile,
  } = useInbox(searchParams.get('conversation'));

  const draftMessage = conv?.messages?.find((m) => m.senderType === 'ai' && m.status === 'pending') || null;

  return (
    <AppLayout>
      <div className="flex h-full min-h-0 flex-1 gap-2 bg-gray-100 px-2 sm:px-3 dark:bg-gray-950 overflow-hidden">

        {/* Panel 1: conversation queue */}
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
          searchValue={search}
          onSearchChange={setSearch}
        />

        {/* Panel 2: chat timeline + composer */}
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

        {/* Panel 3: CRM + Hermes intelligence */}
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

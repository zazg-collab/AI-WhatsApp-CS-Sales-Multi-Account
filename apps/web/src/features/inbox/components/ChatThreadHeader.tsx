'use client';

import { DotsThreeVertical } from '@phosphor-icons/react';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Popover, useSinglePopover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import type { ConvDetail } from '../inbox.types';

export interface ConversationActions {
  onMarkRead?: () => void;
  onReturnToAi?: () => void;
  onEscalate?: () => void;
  onToggleMute?: (mute: boolean) => void;
  onToggleArchive?: (archive: boolean) => void;
  onTogglePin?: (pin: boolean) => void;
  onToggleBlock?: (block: boolean) => void;
  onToggleDisappearing?: (enable: boolean) => void;
}

interface ChatThreadHeaderProps {
  conversation: ConvDetail;
  onBack?: () => void;
  onShowDetails?: () => void;
  actions?: ConversationActions;
  customerTyping?: boolean;
}

export function ChatThreadHeader({
  conversation,
  onBack,
  onShowDetails,
  actions,
  customerTyping = false,
}: ChatThreadHeaderProps) {
  const { isOpen, toggle, close } = useSinglePopover<'menu'>();
  const customer = conversation.customer;
  // NOTE: this reflects OUR WhatsApp account's connection, not the customer's
  // presence (which WhatsApp does not expose reliably). Label it honestly.
  const accountConnected = conversation.whatsappAccount?.sessionStatus === 'connected';
  const accountName = conversation.whatsappAccount?.accountName;
  const title = conversation.isGroup
    ? conversation.groupSubject || customer.name || customer.phoneNumber
    : customer.name || customer.phoneNumber;
  const subtitle = conversation.isGroup ? 'Group' : customer.phoneNumber;

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="md:hidden"
            aria-label="Back to list"
          >
            ←
          </Button>
        )}

        <Avatar
          name={customer.name}
          phone={customer.phoneNumber}
          avatarUrl={customer.avatarUrl}
          isGroup={conversation.isGroup}
          className="h-10 w-10"
        />

        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            {customerTyping ? (
              <span className="font-medium text-hermes-600 dark:text-hermes-400">typing…</span>
            ) : (
              <>
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', accountConnected ? 'bg-green-500' : 'bg-gray-400')}
                  title={accountConnected ? 'Account connected' : 'Account disconnected'}
                />
                <span className="truncate">
                  {subtitle}
                  {accountName ? ` · via ${accountName}` : ''}
                  {!accountConnected ? ' · disconnected' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {actions && (
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggle('menu')}
              aria-label="Conversation actions"
            >
              <DotsThreeVertical className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Popover open={isOpen('menu')} onClose={close} align="right" side="bottom">
              <div className="w-48 p-1">
                {actions.onMarkRead && (
                  <MenuItem label="Mark as read" onClick={() => { actions.onMarkRead?.(); close(); }} />
                )}
                {conversation.takeoverStatus === 'admin_takeover' && actions.onReturnToAi && (
                  <MenuItem label="↩️ Return to AI" onClick={() => { actions.onReturnToAi?.(); close(); }} />
                )}
                {actions.onEscalate && conversation.status !== 'pending' && (
                  <MenuItem label="⚠️ Escalate" onClick={() => { actions.onEscalate?.(); close(); }} />
                )}
                {actions.onTogglePin && (
                  <MenuItem
                    label={conversation.isPinned ? 'Unpin chat' : '📌 Pin chat'}
                    onClick={() => { actions.onTogglePin?.(!conversation.isPinned); close(); }}
                  />
                )}
                {actions.onToggleMute && (
                  <MenuItem
                    label={conversation.isMuted ? 'Unmute' : '🔕 Mute'}
                    onClick={() => { actions.onToggleMute?.(!conversation.isMuted); close(); }}
                  />
                )}
                {actions.onToggleArchive && (
                  <MenuItem
                    label={conversation.isArchived ? 'Unarchive' : '🗄️ Archive'}
                    onClick={() => { actions.onToggleArchive?.(!conversation.isArchived); close(); }}
                  />
                )}
                {actions.onToggleDisappearing && (
                  <MenuItem
                    label="⏲️ Disappearing messages"
                    onClick={() => { actions.onToggleDisappearing?.(true); close(); }}
                  />
                )}
                {actions.onToggleBlock && (
                  <MenuItem
                    danger
                    label={conversation.isBlocked ? 'Unblock contact' : '🚫 Block contact'}
                    onClick={() => { actions.onToggleBlock?.(!conversation.isBlocked); close(); }}
                  />
                )}
              </div>
            </Popover>
          </div>
        )}
        {onShowDetails && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShowDetails}
            aria-label="Show conversation details"
            className="xl:hidden"
          >
            ℹ️
          </Button>
        )}
      </div>
    </div>
  );
}

function MenuItem({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
        danger ? 'text-danger-600 dark:text-danger-400' : 'text-gray-700 dark:text-gray-300',
      )}
    >
      {label}
    </button>
  );
}

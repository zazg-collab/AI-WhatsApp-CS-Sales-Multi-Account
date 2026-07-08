'use client';

import {
  DotsThreeVertical,
  ArrowLeft,
  Info,
  Warning,
  PushPin,
  BellSlash,
  Archive,
  Clock,
  Prohibit,
  ArrowUUpLeft,
  type Icon,
} from '@/components/ui/core-essential-icons';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Popover, useSinglePopover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { contactDisplayName, formatPhone } from '@/lib/contact';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import type { ConvDetail } from '../inbox.types';

export interface ConversationActions {
  onMarkRead?: () => void;
  onReturnToAi?: () => void;
  onEscalate?: () => void;
  onToggleMute?: (mute: boolean) => void;
  onToggleArchive?: (archive: boolean) => void;
  onTogglePin?: (pin: boolean) => void;
  onToggleBlock?: (block: boolean) => void;
  onToggleDisappearing?: (enable: boolean, duration?: number) => void;
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
  const t = useT(dict);
  const { isOpen, toggle, close } = useSinglePopover<'menu'>();
  const customer = conversation.customer;
  // NOTE: this reflects OUR WhatsApp account's connection, not the customer's
  // presence (which WhatsApp does not expose reliably). Label it honestly.
  const accountConnected = conversation.whatsappAccount?.sessionStatus === 'connected';
  const accountName = conversation.whatsappAccount?.accountName;
  const displayName = customer.waName ?? customer.name;
  const title = conversation.isGroup
    ? conversation.groupSubject || contactDisplayName(displayName, customer.phoneNumber)
    : contactDisplayName(displayName, customer.phoneNumber);
  const participantCount = conversation.groupParticipants?.length;
  const subtitle = conversation.isGroup
    ? (participantCount ? `${participantCount} peserta` : 'Group')
    : formatPhone(customer.phoneNumber, 'Nomor tersembunyi');

  return (
    <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="sm:hidden"
            aria-label={t('ariaBackToList')}
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
        )}

        <Avatar
          name={displayName}
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
              <span className="font-medium text-sentinel-600 dark:text-sentinel-400">typing…</span>
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
              aria-label={t('ariaConversationActions')}
            >
              <DotsThreeVertical className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Popover open={isOpen('menu')} onClose={close} align="right" side="bottom">
              <div className="w-48 p-1">
                {actions.onMarkRead && (
                  <MenuItem label="Mark as read" onClick={() => { actions.onMarkRead?.(); close(); }} />
                )}
                {onShowDetails && (
                  <MenuItem icon={Info} label="Lihat detail" onClick={() => { onShowDetails?.(); close(); }} />
                )}
                {conversation.takeoverStatus === 'admin_takeover' && actions.onReturnToAi && (
                  <MenuItem icon={ArrowUUpLeft} label="Return to AI" onClick={() => { actions.onReturnToAi?.(); close(); }} />
                )}
                {actions.onEscalate && conversation.status !== 'pending' && (
                  <MenuItem icon={Warning} label="Escalate" onClick={() => { actions.onEscalate?.(); close(); }} />
                )}
                {actions.onTogglePin && (
                  <MenuItem
                    icon={PushPin}
                    label={conversation.isPinned ? 'Unpin chat' : 'Pin chat'}
                    onClick={() => { actions.onTogglePin?.(!conversation.isPinned); close(); }}
                  />
                )}
                {actions.onToggleMute && (
                  <MenuItem
                    icon={BellSlash}
                    label={conversation.isMuted ? 'Unmute' : 'Mute'}
                    onClick={() => { actions.onToggleMute?.(!conversation.isMuted); close(); }}
                  />
                )}
                {actions.onToggleArchive && (
                  <MenuItem
                    icon={Archive}
                    label={conversation.isArchived ? 'Unarchive' : 'Archive'}
                    onClick={() => { actions.onToggleArchive?.(!conversation.isArchived); close(); }}
                  />
                )}
                {actions.onToggleDisappearing && (
                  <>
                    <MenuItem
                      icon={Clock}
                      label="Disappearing: Off"
                      onClick={() => { actions.onToggleDisappearing?.(false, 0); close(); }}
                    />
                    <MenuItem
                      icon={Clock}
                      label="Disappearing: 24 hours"
                      onClick={() => { actions.onToggleDisappearing?.(true, 86400); close(); }}
                    />
                    <MenuItem
                      icon={Clock}
                      label="Disappearing: 7 days"
                      onClick={() => { actions.onToggleDisappearing?.(true, 604800); close(); }}
                    />
                    <MenuItem
                      icon={Clock}
                      label="Disappearing: 90 days"
                      onClick={() => { actions.onToggleDisappearing?.(true, 7776000); close(); }}
                    />
                  </>
                )}
                {actions.onToggleBlock && (
                  <MenuItem
                    danger
                    icon={Prohibit}
                    label={conversation.isBlocked ? 'Unblock contact' : 'Block contact'}
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
            aria-label={t('ariaShowDetails')}
            title={t('showDetails')}
          >
            <Info className="h-5 w-5" aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  label,
  onClick,
  danger,
  icon: IconComponent,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  icon?: Icon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700',
        danger ? 'text-danger-600 dark:text-danger-400' : 'text-gray-700 dark:text-gray-300',
      )}
    >
      {IconComponent && <IconComponent className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {label}
    </button>
  );
}

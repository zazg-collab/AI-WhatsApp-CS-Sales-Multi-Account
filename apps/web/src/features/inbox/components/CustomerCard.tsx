'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import type { ConvDetail } from '../inbox.types';

interface CustomerCardProps {
  conversation: ConvDetail;
}

export function CustomerCard({ conversation }: CustomerCardProps) {
  const customer = conversation.customer;

  const leadStageBadgeColor: Record<string, 'success' | 'review' | 'danger'> = {
    prospect: 'success',
    qualified: 'review',
    negotiating: 'review',
    closed: 'danger',
  };

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      {/* Avatar + name + phone */}
      <div className="mb-3 flex items-start gap-3">
        <Avatar
          name={customer.name}
          phone={customer.phoneNumber}
          avatarUrl={customer.avatarUrl}
          className="h-12 w-12"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 dark:text-gray-100">
            {customer.name || 'No name'}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {customer.phoneNumber}
          </p>
        </div>
      </div>

      {/* Lead info */}
      <div className="mb-3 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Lead Score</span>
          <Badge tone="success" className="text-xs">
            {customer.leadScore}%
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600 dark:text-gray-400">Lead Stage</span>
          <Badge
            tone={leadStageBadgeColor[customer.leadStage] || 'review'}
            className="text-xs capitalize"
          >
            {customer.leadStage}
          </Badge>
        </div>
      </div>

      {/* Tags */}
      {customer.tags && customer.tags.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
            Tags
          </p>
          <div className="flex flex-wrap gap-1">
            {customer.tags.map((tag) => (
              <Badge key={tag} tone="review" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {customer.notes && (
        <div className="rounded-lg bg-gray-50 p-2.5 dark:bg-gray-800/50">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Notes
          </p>
          <p className="mt-1 text-xs text-gray-700 dark:text-gray-200">
            {customer.notes}
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { Avatar } from '@/components/ui/Avatar';
import { useT } from '@/lib/i18n';
import { dict } from '@/app/inbox/inbox.i18n';
import type { AdminUser, ConvDetail } from '../inbox.types';

interface AssignAdminProps {
  conversation: ConvDetail;
  admins: AdminUser[];
  onAssign?: (adminId: string | null) => Promise<void>;
  loading?: boolean;
}

/**
 * AssignAdmin: assign the conversation to a team member (or unassign).
 * Shows the current assignee and a dropdown of available admins.
 */
export function AssignAdmin({ conversation, admins, onAssign, loading = false }: AssignAdminProps) {
  const t = useT(dict);
  const assigned = conversation.assignedAdmin;

  return (
    <div className="border-b border-gray-200 p-4 dark:border-gray-800">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
        {t('assignedTo')}
      </h3>

      {assigned ? (
        <div className="mb-3 flex items-center gap-2">
          <Avatar name={assigned.name} phone={assigned.id} className="h-7 w-7" />
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{assigned.name}</p>
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">{t('notAssigned')}</p>
      )}

      <select
        value={assigned?.id ?? ''}
        onChange={(e) => onAssign?.(e.target.value || null)}
        disabled={loading || !onAssign}
        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        aria-label={t('ariaAssignAdmin')}
      >
        <option value="">{t('notAssigned')}</option>
        {admins.map((admin) => (
          <option key={admin.id} value={admin.id}>
            {admin.name}
          </option>
        ))}
      </select>
    </div>
  );
}

'use client';

import { ArrowsClockwise, Shield, UserPlus, Clock, type Icon } from '@/components/ui/core-essential-icons';
import type { ConvDetail } from '../inbox.types';

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface AuditEvent {
  label: string;
  vars?: Record<string, string | number>;
  time: string | null;
  icon: Icon;
  tone: string;
}

function buildAudit(conv: ConvDetail): AuditEvent[] {
  const out: AuditEvent[] = [];
  const firstAi = conv.messages.find((m) => m.aiGenerated);
  if (firstAi) out.push({ label: 'AI generated a reply', time: firstAi.createdAt, icon: ArrowsClockwise, tone: 'text-hermes-600' });
  if (conv.sentinelReviews[0]) out.push({ label: `Sentinel ${conv.sentinelReviews[0].decision.replace('_', ' ')}`, time: null, icon: Shield, tone: 'text-review-600' });
  if (conv.takeoverStatus === 'admin_takeover') out.push({ label: 'Admin took over', time: null, icon: UserPlus, tone: 'text-gray-500' });
  if (conv.assignedAdmin) out.push({ label: `Assigned to ${conv.assignedAdmin.name}`, time: null, icon: UserPlus, tone: 'text-gray-500' });
  if (out.length === 0) out.push({ label: 'No supervised actions yet', time: null, icon: Clock, tone: 'text-gray-400' });
  return out;
}

interface AuditTrailProps {
  conversation: ConvDetail;
}

export function AuditTrail({ conversation }: AuditTrailProps) {
  const audit = buildAudit(conversation);

  return (
    <div className="p-4">
      <h3 className="mb-3 text-xs font-semibold text-gray-900 dark:text-gray-100">
        Audit trail
      </h3>
      <ol className="space-y-2 text-[11px]">
        {audit.map((e, i) => (
          <li key={i} className="flex gap-2">
            <e.icon className={`mt-0.5 h-4 w-4 shrink-0 ${e.tone}`} aria-hidden="true" />
            <div className="flex-1">
              <p className="text-gray-700 dark:text-gray-200">{e.label}</p>
              {e.time && <p className="text-gray-400">{clockTime(e.time)}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

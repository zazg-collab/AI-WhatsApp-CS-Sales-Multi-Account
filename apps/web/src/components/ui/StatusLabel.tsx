import {
  Workflow,
  ShieldCheck,
  TriangleAlert,
  Hand,
  CircleX,
  CircleCheck,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from './Badge';

/**
 * Canonical AI / review state labels. AI presence is made visible but subtle:
 * every state carries an explicit text label, never an icon alone, never a
 * fabricated confidence number.
 */
export type StatusKind =
  | 'ai-generated'
  | 'hermes-reviewed'
  | 'needs-review'
  | 'human-takeover'
  | 'sending-blocked'
  | 'sent';

const map: Record<
  StatusKind,
  { label: string; icon: LucideIcon; tone: 'hermes' | 'review' | 'danger' | 'success' | 'neutral' }
> = {
  'ai-generated': { label: 'AI generated', icon: Workflow, tone: 'hermes' },
  'hermes-reviewed': { label: 'Hermes reviewed', icon: ShieldCheck, tone: 'hermes' },
  'needs-review': { label: 'Needs review', icon: TriangleAlert, tone: 'review' },
  'human-takeover': { label: 'Human takeover', icon: Hand, tone: 'neutral' },
  'sending-blocked': { label: 'Sending blocked', icon: CircleX, tone: 'danger' },
  sent: { label: 'Sent', icon: CircleCheck, tone: 'success' },
};

export function StatusLabel({ kind }: { kind: StatusKind }) {
  const { label, icon: Icon, tone } = map[kind];
  return (
    <Badge tone={tone}>
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      {label}
    </Badge>
  );
}

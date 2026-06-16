import {
  ArrowsSplit,
  ShieldStar,
  Warning,
  Hand,
  XCircle,
  CheckCircle,
  type Icon,
} from '@phosphor-icons/react';
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
  { label: string; icon: Icon; tone: 'hermes' | 'accent' | 'review' | 'danger' | 'success' | 'neutral' }
> = {
  // AI presence is informational → blue (accent); supervisor review → teal (hermes).
  'ai-generated': { label: 'AI generated', icon: ArrowsSplit, tone: 'accent' },
  'hermes-reviewed': { label: 'Hermes reviewed', icon: ShieldStar, tone: 'hermes' },
  'needs-review': { label: 'Needs review', icon: Warning, tone: 'review' },
  'human-takeover': { label: 'Human takeover', icon: Hand, tone: 'neutral' },
  'sending-blocked': { label: 'Sending blocked', icon: XCircle, tone: 'danger' },
  sent: { label: 'Sent', icon: CheckCircle, tone: 'success' },
};

export function StatusLabel({ kind }: { kind: StatusKind }) {
  const { label, icon: Icon, tone } = map[kind];
  return (
    <Badge tone={tone}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}

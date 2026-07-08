import { Clock, Warning, Checks, CheckSingle } from '@/components/ui/core-essential-icons';

// ponytail: same Phosphor family + weight for all 4 states (single vs double tick
// must read as the same icon set, only count/color differs) — was mixing a
// different SVG pack for "sent" which made it look inconsistent with delivered/read.
export function StatusTick({ status }: { status: string }) {
  if (status === 'pending') return <Clock className="h-3 w-3 text-slate-400" aria-label="pending" />;
  if (status === 'failed') return <Warning className="h-3 w-3 text-danger-200" aria-label="failed to send" />;
  if (status === 'read') return <Checks weight="bold" className="h-3.5 w-3.5 text-sky-400" aria-label="read" />;
  if (status === 'delivered') return <Checks weight="bold" className="h-3.5 w-3.5 text-slate-400" aria-label="delivered" />;
  return <CheckSingle weight="bold" className="h-3.5 w-3.5 text-slate-400" aria-label="sent" />;
}

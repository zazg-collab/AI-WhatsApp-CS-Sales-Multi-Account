import { Clock, Warning, Checks, Check } from '@phosphor-icons/react';

export function StatusTick({ status }: { status: string }) {
  if (status === 'pending') return <Clock className="h-3 w-3" aria-label="pending" />;
  if (status === 'failed') return <Warning className="h-3 w-3 text-danger-200" aria-label="failed to send" />;
  if (status === 'read') return <Checks className="h-3.5 w-3.5 text-sky-300" aria-label="read" />;
  if (status === 'delivered') return <Checks className="h-3.5 w-3.5" aria-label="delivered" />;
  return <Check className="h-3.5 w-3.5" aria-label="sent" />;
}

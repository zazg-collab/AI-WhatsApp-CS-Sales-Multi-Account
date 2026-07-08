import { WhatsappLogo } from '@/components/ui/core-essential-icons';

/** Official WhatsApp glyph used only as a small channel identifier. */
export function WhatsAppMark({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <WhatsappLogo className={className} aria-hidden="true" />;
}

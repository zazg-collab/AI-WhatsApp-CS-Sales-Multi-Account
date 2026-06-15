'use client';

import { LanguageProvider } from '@/lib/i18n';

/** Client-side app providers mounted once at the root layout. */
export function Providers({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

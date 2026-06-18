'use client';

import { Translate } from '@phosphor-icons/react';
import { useLang } from '@/lib/i18n';

/**
 * Indonesian/English switcher. Mirrors ThemeToggle and lives in the sidebar
 * footer. Indonesian is the default; the choice persists per browser.
 */
export function LanguageToggle({ compact = false }: { compact?: boolean } = {}) {
  const { lang, setLang } = useLang();
  const next = lang === 'id' ? 'en' : 'id';
  const label = lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia';

  if (compact) {
    return (
      <button
        onClick={() => setLang(next)}
        title={label}
        aria-label={label}
        className="flex h-9 min-w-9 items-center justify-center gap-1 rounded-md px-2 text-[11px] font-semibold text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50"
      >
        <span className={lang === 'id' ? 'text-hermes-300' : ''}>ID</span>
        <span className="text-gray-600">/</span>
        <span className={lang === 'en' ? 'text-hermes-300' : ''}>EN</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => setLang(next)}
      title={label}
      aria-label={label}
      className="flex w-full items-center justify-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50 lg:justify-start lg:px-2.5"
    >
      <Translate className="h-[17px] w-[17px] shrink-0" aria-hidden="true" />
      <span className="hidden items-center gap-1.5 lg:flex">
        <span className={lang === 'id' ? 'font-semibold text-hermes-300' : ''}>ID</span>
        <span className="text-gray-600">/</span>
        <span className={lang === 'en' ? 'font-semibold text-hermes-300' : ''}>EN</span>
      </span>
    </button>
  );
}

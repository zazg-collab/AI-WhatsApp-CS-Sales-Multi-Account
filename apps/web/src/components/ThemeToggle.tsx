'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useT, type Dict } from '@/lib/i18n';

const THEME_KEY = 'hermes_theme';

const dict: Dict = {
  toLight: { id: 'Ganti ke tema terang', en: 'Switch to light theme' },
  toDark: { id: 'Ganti ke tema gelap', en: 'Switch to dark theme' },
  light: { id: 'Tema terang', en: 'Light theme' },
  dark: { id: 'Tema gelap', en: 'Dark theme' },
};

/** Light/dark switcher. Light is the default; the choice persists per browser. */
export function ThemeToggle() {
  const t = useT(dict);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    } catch {
      // persistence is best-effort
    }
  }

  const label = dark ? t('toLight') : t('toDark');

  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className="flex w-full items-center justify-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium text-gray-400 transition-colors hover:bg-gray-800 hover:text-gray-50 lg:justify-start lg:px-2.5"
    >
      {dark ? (
        <Sun className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="hidden lg:block">{dark ? t('light') : t('dark')}</span>
    </button>
  );
}

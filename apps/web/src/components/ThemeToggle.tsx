'use client';

import { useEffect, useState } from 'react';

const THEME_KEY = 'hermes_theme';

/** Light/dark switcher. Light is the default; the choice persists per browser. */
export function ThemeToggle() {
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

  return (
    <button
      onClick={toggle}
      title={dark ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
      className="flex w-full items-center gap-3 rounded px-3 py-2 text-sm text-gray-600 hover:bg-black/5 dark:text-gray-400 dark:hover:bg-white/5"
    >
      <span className="text-base leading-none">{dark ? '☀️' : '🌙'}</span>
      <span className="hidden lg:block">{dark ? 'Tema Terang' : 'Tema Gelap'}</span>
    </button>
  );
}

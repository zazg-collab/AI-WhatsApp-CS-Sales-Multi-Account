'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from './icons';

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
      className="flex w-full items-center justify-center gap-3 rounded-lg px-2 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-950 lg:justify-start lg:px-3"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span className="hidden lg:block">{dark ? 'Tema Terang' : 'Tema Gelap'}</span>
    </button>
  );
}

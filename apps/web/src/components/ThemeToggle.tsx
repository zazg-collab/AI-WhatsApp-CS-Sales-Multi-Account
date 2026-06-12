'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

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

  const label = dark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      onClick={toggle}
      title={label}
      aria-label={label}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg px-2 py-2 text-[13px] font-medium text-gray-600 transition-colors hover:bg-white/[0.06] hover:text-gray-300 lg:justify-start lg:px-2.5"
    >
      {dark ? (
        <Sun className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Moon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="hidden lg:block">{dark ? 'Light theme' : 'Dark theme'}</span>
    </button>
  );
}

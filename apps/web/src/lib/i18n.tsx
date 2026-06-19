'use client';

import * as React from 'react';

export type Lang = 'id' | 'en';

/** A single translatable phrase, one value per supported language. */
export interface Phrase {
  id: string;
  en: string;
}

export type Dict = Record<string, Phrase>;

const STORAGE_KEY = 'hermes_lang';
export const DEFAULT_LANG: Lang = 'en';

interface LangContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

// Default value applies when no provider is mounted (e.g. in unit tests):
// language is the Indonesian default, so every `id` phrase renders unchanged.
const LangContext = React.createContext<LangContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
});

function readStoredLang(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'id' ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

/** App-wide language provider. Persists the choice and reflects it on <html lang>. */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>(DEFAULT_LANG);

  // Hydrate from storage after mount to avoid SSR mismatch.
  React.useEffect(() => {
    setLangState(readStoredLang());
  }, []);

  React.useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }, [lang]);

  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // persistence is best-effort
    }
  }, []);

  const value = React.useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  return React.useContext(LangContext);
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

/**
 * Translation hook. Pass a co-located dictionary; `t(key, vars?)` resolves the
 * phrase for the active language, falling back to the Indonesian value and then
 * the raw key. Supports `{var}` interpolation.
 *
 * Because the default (and test-time) language is Indonesian, any phrase whose
 * `id` value equals the current literal renders identically with no provider.
 */
export function useT(local?: Dict): TFunction {
  const { lang } = useLang();
  return React.useCallback(
    (key, vars) => {
      const phrase = local?.[key];
      if (!phrase) return interpolate(key, vars);
      return interpolate(phrase[lang] ?? phrase.id, vars);
    },
    [local, lang],
  );
}

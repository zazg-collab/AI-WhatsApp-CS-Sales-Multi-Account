'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldStar, ArrowRight, List, X } from '@phosphor-icons/react';
import { useT } from '@/lib/i18n';
import { useLang } from '@/lib/i18n';
import { landingDict } from '../landing.i18n';

const BORDER = '#233047';
const CANVAS = '#0B1220';

/** Language toggle styled for the Midnight Ops dark landing nav. */
function NavLangToggle() {
  const { lang, setLang } = useLang();
  const next = lang === 'id' ? 'en' : 'id';
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={lang === 'id' ? 'Switch to English' : 'Ganti ke Bahasa Indonesia'}
      className="flex h-9 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
    >
      <span className={lang === 'id' ? 'text-indigo-300' : ''}>ID</span>
      <span className="text-slate-600">/</span>
      <span className={lang === 'en' ? 'text-indigo-300' : ''}>EN</span>
    </button>
  );
}

const anchors = [
  { href: '#features', key: 'navFeatures' },
  { href: '#supervisor', key: 'navSupervisor' },
  { href: '#how', key: 'navHow' },
  { href: '#modes', key: 'navModes' },
] as const;

export function LandingNav() {
  const t = useT(landingDict);
  const [open, setOpen] = React.useState(false);

  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur-md"
      style={{ borderColor: BORDER, backgroundColor: `${CANVAS}cc` }}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Hermes">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-indigo-600 text-white">
            <ShieldStar className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">Hermes</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {anchors.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="rounded-md px-3 py-2 text-[13px] font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {t(a.key)}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <NavLangToggle />
          <Link
            href="/login"
            className="ml-1 hidden h-9 items-center gap-1.5 rounded border border-indigo-700 bg-indigo-600 px-3.5 text-[13px] font-semibold text-white transition-all hover:bg-indigo-500 active:scale-[0.97] sm:inline-flex"
          >
            {t('navSignIn')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-300 hover:bg-white/5 md:hidden"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <List className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t px-5 py-3 md:hidden" style={{ borderColor: BORDER, backgroundColor: CANVAS }}>
          <div className="flex flex-col gap-1">
            {anchors.map((a) => (
              <a
                key={a.href}
                href={a.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 hover:text-white"
              >
                {t(a.key)}
              </a>
            ))}
            <Link
              href="/login"
              className="mt-1 inline-flex h-10 items-center justify-center gap-1.5 rounded border border-indigo-700 bg-indigo-600 px-3.5 text-sm font-semibold text-white"
            >
              {t('navSignIn')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

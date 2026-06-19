'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ShieldStar,
  ChatsCircle,
  TrendUp,
  BookOpen,
  Megaphone,
  ChartLineUp,
  ClockCounterClockwise,
  QrCode,
  Brain,
  Eye,
  CheckCircle,
  Lightning,
  SealCheck,
  Plugs,
  Translate,
  Smiley,
  CaretDown,
  WhatsappLogo,
} from '@phosphor-icons/react';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';
import { landingDict } from '../landing.i18n';
import { LandingNav } from './LandingNav';
import { Reveal } from './Reveal';
import { DashboardMock } from './DashboardMock';
import { AnalyticsMock } from './AnalyticsMock';
import { SupervisorReviewMock } from './SupervisorReviewMock';

// Primary conversion target. Set your business WhatsApp number (international
// format, digits only) via NEXT_PUBLIC_CONTACT_WHATSAPP, or replace the fallback.
const WA_NUMBER = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '6281234567890';
const WA_TEXT = encodeURIComponent(
  "Hi Hermes, I'd like a demo of the WhatsApp Sales & CS control center for my team.",
);
const WHATSAPP_URL = `https://wa.me/${WA_NUMBER}?text=${WA_TEXT}`;

// Midnight Ops brand surfaces (dark-first landing pilot). Kept as local tokens
// so the rest of the app's `hermes` theme is untouched until global rollout.
const CANVAS = '#0B1220';
const SURFACE = '#131C2E';
const SURFACE_2 = '#0E1626';
const BORDER = '#233047';

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-400">
      {children}
    </p>
  );
}

const integrations = [
  { slug: 'whatsapp', name: 'WhatsApp' },
  { slug: 'telegram', name: 'Telegram' },
  { slug: 'ollama', name: 'OpenAI-compatible (Ollama, vLLM, …)' },
  { slug: 'postgresql', name: 'PostgreSQL' },
  { slug: 'redis', name: 'Redis' },
  { slug: 'docker', name: 'Docker' },
];

function IntegrationLogo({ slug, name }: { slug: string; name: string }) {
  return (
    <span
      className="inline-flex items-center opacity-60 grayscale transition duration-200 hover:opacity-100 hover:grayscale-0"
      title={name}
    >
      {/* Real brand marks via Simple Icons CDN, tinted for the dark canvas. */}
      <img
        src={`https://cdn.simpleicons.org/${slug}/94a3b8`}
        alt={name}
        width={28}
        height={28}
        loading="lazy"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
        className="h-7 w-auto"
      />
    </span>
  );
}

const stats = [
  { value: '5', label: 'stat1Label' },
  { value: '100%', label: 'stat2Label' },
  { value: '2', label: 'stat3Label' },
  { value: 'ID/EN+', label: 'stat4Label' },
] as const;

const aiPoints = [
  { icon: SealCheck, title: 'ai1Title', body: 'ai1Body' },
  { icon: Plugs, title: 'ai2Title', body: 'ai2Body' },
  { icon: Translate, title: 'ai3Title', body: 'ai3Body' },
  { icon: Smiley, title: 'ai4Title', body: 'ai4Body' },
] as const;

const capabilities = [
  { icon: ChatsCircle, title: 'cap1Title', body: 'cap1Body', wide: true },
  { icon: TrendUp, title: 'cap2Title', body: 'cap2Body', wide: false },
  { icon: BookOpen, title: 'cap3Title', body: 'cap3Body', wide: false },
  { icon: Megaphone, title: 'cap4Title', body: 'cap4Body', wide: false },
  { icon: ChartLineUp, title: 'cap5Title', body: 'cap5Body', wide: false },
  { icon: ClockCounterClockwise, title: 'cap6Title', body: 'cap6Body', wide: true },
] as const;

const steps = [
  { icon: QrCode, title: 'how1Title', body: 'how1Body' },
  { icon: Brain, title: 'how2Title', body: 'how2Body' },
  { icon: Eye, title: 'how3Title', body: 'how3Body' },
] as const;

const faqs = [
  { q: 'faq1Q', a: 'faq1A' },
  { q: 'faq2Q', a: 'faq2A' },
  { q: 'faq3Q', a: 'faq3A' },
  { q: 'faq4Q', a: 'faq4A' },
] as const;

// AI modes carry the product's semantic state colors (mirrors the in-app status
// system), retinted for the Midnight Ops dark canvas.
const modes = [
  { title: 'modeOnTitle', body: 'modeOnBody', ring: 'ring-emerald-500/40', dot: 'bg-emerald-400', label: 'text-emerald-300' },
  { title: 'modeSupTitle', body: 'modeSupBody', ring: 'ring-indigo-500/40', dot: 'bg-indigo-400', label: 'text-indigo-300' },
  { title: 'modeDraftTitle', body: 'modeDraftBody', ring: 'ring-cyan-500/40', dot: 'bg-cyan-400', label: 'text-cyan-300' },
  { title: 'modePausedTitle', body: 'modePausedBody', ring: 'ring-amber-500/40', dot: 'bg-amber-400', label: 'text-amber-300' },
  { title: 'modeOffTitle', body: 'modeOffBody', ring: 'ring-slate-600/60', dot: 'bg-slate-500', label: 'text-slate-300' },
] as const;

const accentPill =
  'inline-flex items-center gap-2 rounded-full bg-indigo-500/15 px-3 py-1 text-[13px] font-semibold text-indigo-300 ring-1 ring-indigo-500/30';
const iconChip =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30';
const sectionHeading = 'text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl';

export function Landing() {
  const t = useT(landingDict);

  return (
    <div
      className="h-[100dvh] overflow-y-auto overflow-x-hidden scroll-smooth text-slate-100"
      style={{ backgroundColor: CANVAS }}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t('skipToContent')}
      </a>

      <LandingNav />

      <main id="main">
        {/* Hero: asymmetric split */}
        <section className="relative overflow-hidden">
          {/* Layered backdrop: indigo + cyan glows + faint grid, faded at edges. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_78%_-5%,rgba(99,102,241,0.20),transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_40%_at_8%_110%,rgba(34,211,238,0.10),transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent_75%)] bg-[linear-gradient(to_right,rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.08)_1px,transparent_1px)] bg-[size:38px_38px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-indigo-600/20 blur-3xl motion-safe:animate-pulse"
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:py-28">
            <Reveal className="max-w-xl">
              <span className={cn(accentPill, 'mb-5')}>
                <Lightning className="h-3 w-3" weight="fill" aria-hidden="true" />
                {t('heroEyebrow')}
              </span>
              <h1 className="text-[2.6rem] font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-[3.25rem]">
                {t('heroTitle')}
              </h1>
              <p className="mt-5 max-w-lg text-[17px] leading-7 text-slate-300">
                {t('heroSub')}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded bg-channel-600 px-5 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(29,167,101,0.75)] transition-all hover:bg-channel-700 hover:shadow-[0_10px_28px_-8px_rgba(29,167,101,0.8)] active:scale-[0.98]"
                >
                  <WhatsappLogo className="h-[18px] w-[18px]" weight="fill" aria-hidden="true" />
                  {t('ctaWhatsapp')}
                </a>
                <a
                  href="#supervisor"
                  className="inline-flex h-11 items-center gap-2 rounded border px-5 text-sm font-semibold text-slate-200 backdrop-blur-sm transition-colors hover:bg-white/5"
                  style={{ borderColor: BORDER, backgroundColor: `${SURFACE}b3` }}
                >
                  {t('heroSecondary')}
                </a>
              </div>
              <p className="mt-6 text-[13px] font-medium text-slate-500">{t('heroNote')}</p>
            </Reveal>

            <Reveal delay={120} className="relative lg:pl-4">
              {/* Depth: a soft tinted panel sits behind the product mock. */}
              <div
                aria-hidden="true"
                className="absolute -right-3 -top-4 hidden h-[88%] w-[92%] rotate-2 rounded-2xl bg-gradient-to-br from-indigo-700/30 to-cyan-800/20 blur-[2px] sm:block"
              />
              <div className="relative">
                <DashboardMock t={t} />
              </div>
            </Reveal>
          </div>
        </section>

        {/* Stats band */}
        <section className="border-y" style={{ borderColor: BORDER, backgroundColor: SURFACE_2 }}>
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-4">
              {stats.map((s, i) => (
                <Reveal key={s.label} delay={i * 70}>
                  <dd className="font-mono text-4xl font-semibold tracking-tight text-cyan-300 sm:text-[2.75rem]">
                    {s.value}
                  </dd>
                  <dt className="mt-2 text-[13px] leading-5 text-slate-400">{t(s.label)}</dt>
                </Reveal>
              ))}
            </dl>
          </div>
        </section>

        {/* Integrations strip */}
        <section className="border-b" style={{ borderColor: BORDER, backgroundColor: CANVAS }}>
          <div className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
            <p className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              {t('intLabel')}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-6 sm:gap-x-14">
              {integrations.map((i) => (
                <IntegrationLogo key={i.slug} slug={i.slug} name={i.name} />
              ))}
            </div>
          </div>
        </section>

        {/* AI engine: spec-sheet list */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
          <Reveal className="max-w-2xl">
            <h2 className={sectionHeading}>{t('aiTitle')}</h2>
            <p className="mt-4 text-base leading-7 text-slate-300">{t('aiSub')}</p>
          </Reveal>
          <Reveal
            delay={100}
            className="mt-12 overflow-hidden rounded-xl border"
            style={{ borderColor: BORDER, backgroundColor: SURFACE }}
          >
            <dl className="grid sm:grid-cols-2">
              {aiPoints.map((p, i) => (
                <div
                  key={p.title}
                  className={cn('flex gap-4 p-6 lg:p-7', i % 2 === 0 ? 'sm:border-r' : '', i < 2 ? 'border-b' : '')}
                  style={{ borderColor: BORDER }}
                >
                  <span className={iconChip}>
                    <p.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <dt className="text-base font-semibold text-white">{t(p.title)}</dt>
                    <dd className="mt-1.5 text-sm leading-6 text-slate-300">{t(p.body)}</dd>
                  </div>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        {/* Supervisor split */}
        <section id="supervisor" className="mx-auto max-w-6xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:py-28" style={{ borderColor: BORDER }}>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <p className={accentPill}>
                <ShieldStar className="h-4 w-4" weight="fill" aria-hidden="true" />
                {t('supEyebrow')}
              </p>
              <h2 className={cn('mt-4', sectionHeading)}>{t('supTitle')}</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">{t('supBody')}</p>
              <ul className="mt-6 space-y-3">
                {['supPoint1', 'supPoint2', 'supPoint3'].map((k) => (
                  <li key={k} className="flex items-start gap-3 text-[15px] text-slate-200">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" weight="fill" aria-hidden="true" />
                    {t(k)}
                  </li>
                ))}
              </ul>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-channel-500 transition-colors hover:text-channel-400"
              >
                <WhatsappLogo className="h-[18px] w-[18px]" weight="fill" aria-hidden="true" />
                {t('supDemo')}
              </a>
            </Reveal>

            <Reveal delay={120}>
              <SupervisorReviewMock t={t} />
            </Reveal>
          </div>
        </section>

        {/* Capabilities bento */}
        <section id="features" className="scroll-mt-20 border-t" style={{ borderColor: BORDER, backgroundColor: SURFACE_2 }}>
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
            <Reveal className="max-w-2xl">
              <Eyebrow>{t('capEyebrow')}</Eyebrow>
              <h2 className={cn('mt-3', sectionHeading)}>{t('capTitle')}</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {capabilities.map((c, i) => (
                <Reveal
                  key={c.title}
                  as="article"
                  delay={(i % 3) * 80}
                  className={cn(
                    'rounded-xl border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-500/40',
                    c.wide && 'lg:col-span-2',
                  )}
                  style={{ borderColor: BORDER, backgroundColor: SURFACE }}
                >
                  <span className={iconChip}>
                    <c.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-white">{t(c.title)}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-slate-300">{t(c.body)}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Analytics split */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <Reveal delay={120} className="lg:order-1">
              <AnalyticsMock t={t} />
            </Reveal>
            <Reveal className="lg:order-2">
              <p className={accentPill}>
                <ChartLineUp className="h-4 w-4" weight="fill" aria-hidden="true" />
                {t('anaEyebrow')}
              </p>
              <h2 className={cn('mt-4', sectionHeading)}>{t('anaTitle')}</h2>
              <p className="mt-4 text-base leading-7 text-slate-300">{t('anaSub')}</p>
              <ul className="mt-6 space-y-3">
                {['anaPoint1', 'anaPoint2', 'anaPoint3'].map((k) => (
                  <li key={k} className="flex items-start gap-3 text-[15px] text-slate-200">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-indigo-400" weight="fill" aria-hidden="true" />
                    {t(k)}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:py-28" style={{ borderColor: BORDER }}>
          <Reveal className="max-w-2xl">
            <Eyebrow>{t('howEyebrow')}</Eyebrow>
            <h2 className={cn('mt-3', sectionHeading)}>{t('howTitle')}</h2>
          </Reveal>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal key={s.title} as="li" delay={i * 90} className="relative">
                <div className="flex items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-white">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-sm font-semibold text-cyan-300">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{t(s.title)}</h3>
                <p className="mt-1.5 text-sm leading-6 text-slate-300">{t(s.body)}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* AI modes: semantic state grid */}
        <section id="modes" className="scroll-mt-20 border-t" style={{ borderColor: BORDER, backgroundColor: SURFACE_2 }}>
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-28">
            <Reveal className="max-w-2xl">
              <Eyebrow>{t('modeEyebrow')}</Eyebrow>
              <h2 className={cn('mt-3', sectionHeading)}>{t('modeTitle')}</h2>
            </Reveal>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modes.map((m, i) => (
                <Reveal
                  key={m.title}
                  delay={(i % 3) * 80}
                  className={cn('rounded-xl border border-transparent p-5 ring-1', m.ring)}
                  style={{ backgroundColor: SURFACE }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className={cn('h-2.5 w-2.5 rounded-full', m.dot)} aria-hidden="true" />
                    <span className={cn('font-mono text-[13px] font-semibold tracking-wide', m.label)}>{t(m.title)}</span>
                  </div>
                  <p className="mt-2.5 text-sm leading-6 text-slate-300">{t(m.body)}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto max-w-3xl scroll-mt-20 border-t px-5 py-20 sm:px-6 lg:py-28" style={{ borderColor: BORDER }}>
          <Reveal className="text-center">
            <h2 className={sectionHeading}>{t('faqTitle')}</h2>
          </Reveal>
          <div className="mt-10 space-y-3">
            {faqs.map((f, i) => (
              <Reveal key={f.q} delay={i * 60}>
                <details className="group rounded-xl border px-5" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15px] font-semibold text-white [&::-webkit-details-marker]:hidden">
                    {t(f.q)}
                    <CaretDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="pb-5 pr-6 text-sm leading-6 text-slate-300">{t(f.a)}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Final CTA band */}
        <section className="border-t" style={{ borderColor: BORDER }}>
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 lg:py-24">
            <Reveal className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-900 px-8 py-14 text-center sm:px-12">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_0%,rgba(255,255,255,0.16),transparent_70%)]"
              />
              <div className="relative mx-auto max-w-2xl">
                <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[12px] font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm">
                  <Lightning className="h-3 w-3" weight="fill" aria-hidden="true" />
                  {t('ctaEarly')}
                </p>
                <h2 className="text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">{t('ctaTitle')}</h2>
                <p className="mt-4 text-base leading-7 text-indigo-50/90">{t('ctaSub')}</p>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-8 inline-flex h-11 items-center gap-2 rounded bg-white px-6 text-sm font-semibold text-channel-700 transition-transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <WhatsappLogo className="h-[18px] w-[18px]" weight="fill" aria-hidden="true" />
                  {t('ctaWhatsapp')}
                </a>
                <p className="mt-4 text-[13px] font-medium text-indigo-50/80">{t('ctaReassure')}</p>
                <p className="mx-auto mt-2 max-w-md text-[11.5px] leading-5 text-indigo-50/60">{t('ctaTerms')}</p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t" style={{ borderColor: BORDER, backgroundColor: CANVAS }}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 text-white">
                <ShieldStar className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-white">Hermes</span>
            </div>
            <p className="mt-3 text-[13px] leading-6 text-slate-500">{t('footTagline')}</p>
            <p className="mt-3 border-l-2 border-indigo-500/40 pl-3 text-[13px] italic leading-6 text-slate-300">
              {t('founderNote')}
            </p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] font-medium text-slate-400">
              <a href="#features" className="hover:text-white">{t('navFeatures')}</a>
              <a href="#supervisor" className="hover:text-white">{t('navSupervisor')}</a>
              <a href="#modes" className="hover:text-white">{t('navModes')}</a>
              <Link href="/login" className="hover:text-white">{t('navSignIn')}</Link>
            </nav>
            <p className="text-[12px] text-slate-500">{t('footRights')}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

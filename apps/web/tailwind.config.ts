import type { Config } from 'tailwindcss';

/**
 * Sentinel — SalesOps Premium / WhatsApp Sales Control Desk.
 *
 * Palette intent (see premium-salesops-uiux-theme skill):
 *  - clean white workspace on a soft slate background, subtle borders, minimal shadow
 *  - `sentinel` teal  → primary actions, active nav, focus, "operate now" accent
 *  - `accent` blue  → AI / informational presence (drafts, AI-generated, hints)
 *  - `channel` WhatsApp green → channel indicators + success states
 *  - `review` amber → review-required states
 *  - `danger` red → blocked / failed states
 *  - `critical` deep red → escalated / takeover-required states
 *
 * The `sentinel` scale is intentionally named (not `teal`) so retinting it here
 * re-themes every existing `bg-sentinel-*` / `text-sentinel-*` usage at once with
 * no class renames. We also retint Tailwind's `gray` to a cool slate so every
 * `gray-*` usage shifts to the SalesOps neutral family in one place.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Cool slate neutral — replaces Tailwind's default gray everywhere.
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Teal — primary actions, active nav, focus. The SalesOps "operate" accent.
        // (Named `hermes`, not `teal`, so retinting re-themes the whole app.)
        sentinel: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        // Blue — AI / informational presence (drafts, AI-generated, hints).
        accent: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // WhatsApp channel green — restricted to channel + success usage.
        channel: {
          50: '#ecfdf3',
          100: '#d1fadf',
          500: '#25d366',
          600: '#1da765',
          700: '#157a4b',
        },
        // Review-required (amber).
        review: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          900: '#451a03',
        },
        // Blocked / failed (red).
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          900: '#450a0a',
        },
        // Escalated / takeover-required (deep red) — one step past `danger`.
        critical: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          400: '#dc2626',
          500: '#b91c1c',
          600: '#991b1b',
          700: '#7f1d1d',
          900: '#450a0a',
        },
        // Back-compat: older pages reference `wa.accent` (channel green).
        wa: { bg: '#0b141a', panel: '#111b21', accent: '#1da765' },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem', // 8px default radius
        lg: '0.625rem',
        xl: '0.75rem',
      },
      boxShadow: {
        // Minimal, low-contrast elevation — no harsh drop shadows.
        card: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.04)',
        pop: '0 8px 28px -12px rgba(15,23,42,0.18)',
      },
    },
  },
  plugins: [],
};

export default config;

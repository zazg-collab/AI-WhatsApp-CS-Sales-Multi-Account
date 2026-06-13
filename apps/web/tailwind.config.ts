import type { Config } from 'tailwindcss';

/**
 * Hermes Control Center — calm enterprise operations language.
 *
 * Palette intent (see product brief):
 *  - neutral slate backgrounds + white surfaces, subtle borders, minimal shadow
 *  - `hermes` deep indigo  → the AI / supervisor accent (primary actions, AI presence)
 *  - `channel` WhatsApp green → ONLY channel indicators + success states
 *  - `review` amber → review-required states
 *  - `danger` red → blocked / failed states
 *
 * We retint Tailwind's `gray` to a cool slate so every existing `gray-*`
 * usage in older pages shifts to the new neutral family at once.
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
        // Deep indigo — Hermes AI / supervisor accent.
        hermes: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
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
        // Back-compat: older pages reference `wa.accent` (channel green).
        wa: { bg: '#0b141a', panel: '#111b21', accent: '#1da765' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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

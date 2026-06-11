import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // Light is the default; dark applies when <html> carries class="dark"
  // (persisted by the ThemeToggle in the sidebar).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // WhatsApp identity, slightly refined.
        wa: { bg: '#0b141a', panel: '#111b21', accent: '#1da765' },
        // Warm neutral scale (taste-skill: one consistent gray family, warm-tinted).
        // Overrides Tailwind's cool gray so every gray-* usage retints at once.
        gray: {
          50: '#f7f6f3',
          100: '#f1efea',
          200: '#e7e3db',
          300: '#d4cec3',
          400: '#a8a195',
          500: '#7c756a',
          600: '#5c564d',
          700: '#403b34',
          800: '#2a2620',
          900: '#1a1713',
          950: '#0f0d0a',
        },
        // Muted pastel semantic accents (tags/badges).
        pastel: {
          red: '#fdebec', redInk: '#9f2f2d',
          blue: '#e1f3fe', blueInk: '#1f6c9f',
          green: '#edf3ec', greenInk: '#346538',
          yellow: '#fbf3db', yellowInk: '#956400',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.625rem',
        xl: '0.875rem',
      },
      boxShadow: {
        // Ultra-diffuse, low-opacity — no harsh drop shadows.
        card: '0 1px 2px rgba(17,15,12,0.04), 0 1px 3px rgba(17,15,12,0.03)',
        pop: '0 4px 24px -8px rgba(17,15,12,0.12)',
      },
    },
  },
  plugins: [],
};

export default config;

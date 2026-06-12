import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // Light is the default; dark applies when <html> carries class="dark"
  // (persisted by the ThemeToggle in the sidebar).
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        wa: { bg: '#0b141a', panel: '#111b21', accent: '#00a884' },
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
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

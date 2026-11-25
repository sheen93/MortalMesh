import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'var(--font-mono)',
          'SF Mono',
          'Fira Code',
          'ui-monospace',
          'monospace',
        ],
      },
      colors: {
        studio: {
          white: '#FFFFFF',
          grey: '#808080',
          black: '#000000',
        },
      },
    },
  },
  plugins: [],
};

export default config;

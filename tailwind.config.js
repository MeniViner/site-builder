import plugin from 'tailwindcss/plugin';

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50:  'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          DEFAULT: 'hsl(var(--color-primary) / <alpha-value>)',
          500: 'hsl(var(--color-primary) / <alpha-value>)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
          950: 'var(--color-primary-950)',
        },
        /* Legacy surface aliases — backwards compatible */
        surface: {
          bg:       'var(--surface-bg)',
          card:     'var(--surface-card)',
          elevated: 'var(--surface-elevated)',
          text:     'var(--surface-text)',
          muted:    'var(--surface-text-muted)',
        },
        /* Premium theme tokens — 12-variable architecture */
        theme: {
          'bg-base':      'var(--color-bg-base)',
          'grad-start':   'var(--color-bg-gradient-start)',
          'grad-end':     'var(--color-bg-gradient-end)',
          'chrome':       'var(--color-bg-chrome)',
          'card':         'var(--color-bg-card)',
          'card-hover':   'var(--color-bg-card-hover)',
          'elevated':     'var(--color-bg-elevated)',
        },
      },
      borderColor: {
        'theme-subtle': 'var(--color-border-subtle)',
        'theme-strong': 'var(--color-border-strong)',
      },
      textColor: {
        'theme':       'var(--color-text-primary)',
        'theme-muted': 'var(--color-text-muted)',
        'theme-inv':   'var(--color-text-inverted)',
      },
    },
  },
  plugins: [
    plugin(function ({ addUtilities }) {
      addUtilities({
        '.tactical-frame': {
          position: 'relative',
          isolation: 'isolate',
        },
      });
    }),
  ],
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: 'rgb(var(--gold) / <alpha-value>)',
          light:   'rgb(var(--gold-light) / <alpha-value>)',
          dark:    'rgb(var(--gold-dark) / <alpha-value>)',
        },
        dark: {
          DEFAULT: 'rgb(var(--surface-page) / <alpha-value>)',
          100:     'rgb(var(--surface-page) / <alpha-value>)',
          200:     'rgb(var(--surface-card) / <alpha-value>)',
          300:     'rgb(var(--surface-input) / <alpha-value>)',
          400:     'rgb(var(--surface-border) / <alpha-value>)',
          500:     'rgb(var(--surface-raised) / <alpha-value>)',
        },
        cream:    'rgb(var(--text-base) / <alpha-value>)',
        /* always-dark: for text ON gold buttons/backgrounds, never changes */
        'ink':    'rgb(var(--ink) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Poppins"', 'sans-serif'],
        body:    ['"Poppins"', 'sans-serif'],
      },
      boxShadow: {
        gold:     '0 0 0 1px rgba(201,168,76,0.3)',
        'gold-md':'0 4px 24px rgba(201,168,76,0.12)',
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
}

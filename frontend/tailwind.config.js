/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Token màu mới giai đoạn 3 (DESIGN.md §2)
        bg: 'rgb(var(--color-bg) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--color-surface-2) / <alpha-value>)',
        line: 'rgb(var(--color-line) / <alpha-value>)',
        ink: 'rgb(var(--color-ink) / <alpha-value>)',
        'ink-2': 'rgb(var(--color-ink-2) / <alpha-value>)',
        'ink-3': 'rgb(var(--color-ink-3) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          soft: 'rgb(var(--color-accent-soft) / <alpha-value>)',
          text: 'rgb(var(--color-accent-text) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          soft: 'rgb(var(--color-success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          soft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--color-danger) / <alpha-value>)',
          soft: 'rgb(var(--color-danger-soft) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-info) / <alpha-value>)',
          soft: 'rgb(var(--color-info-soft) / <alpha-value>)',
        },

        // 7 màu danh mục (DESIGN.md §2)
        'cat-food': 'rgb(var(--color-cat-food) / <alpha-value>)',
        'cat-food-soft': 'rgb(var(--color-cat-food-soft) / <alpha-value>)',
        'cat-drink': 'rgb(var(--color-cat-drink) / <alpha-value>)',
        'cat-drink-soft': 'rgb(var(--color-cat-drink-soft) / <alpha-value>)',
        'cat-entertainment': 'rgb(var(--color-cat-entertainment) / <alpha-value>)',
        'cat-entertainment-soft': 'rgb(var(--color-cat-entertainment-soft) / <alpha-value>)',
        'cat-sightseeing': 'rgb(var(--color-cat-sightseeing) / <alpha-value>)',
        'cat-sightseeing-soft': 'rgb(var(--color-cat-sightseeing-soft) / <alpha-value>)',
        'cat-accommodation': 'rgb(var(--color-cat-accommodation) / <alpha-value>)',
        'cat-accommodation-soft': 'rgb(var(--color-cat-accommodation-soft) / <alpha-value>)',
        'cat-shopping': 'rgb(var(--color-cat-shopping) / <alpha-value>)',
        'cat-shopping-soft': 'rgb(var(--color-cat-shopping-soft) / <alpha-value>)',
        'cat-other': 'rgb(var(--color-cat-other) / <alpha-value>)',
        'cat-other-soft': 'rgb(var(--color-cat-other-soft) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Be Vietnam Pro"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        display: ['2rem', { lineHeight: '2.5rem', fontWeight: '700', letterSpacing: '-0.02em' }],
        title: ['1.375rem', { lineHeight: '1.875rem', fontWeight: '700' }],
        heading: ['1.125rem', { lineHeight: '1.625rem', fontWeight: '600' }],
        body: ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
        label: ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        caption: ['0.8125rem', { lineHeight: '1.125rem', fontWeight: '400' }],
      },
      borderRadius: {
        card: '16px',
        field: '12px',
        chip: '9999px',
      },
      zIndex: {
        map: '0',
        content: '10',
        tabbar: '30',
        sheet: '40',
        toast: '50',
      },
      boxShadow: {
        float: 'var(--shadow-float)',
      },
    },
  },
  plugins: [],
};

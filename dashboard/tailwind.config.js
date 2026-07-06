/** Tailwind config for the Saathi approval-queue dashboard. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4f3',
          100: '#d9e8e5',
          400: '#4c8a80',
          500: '#2f5d5a',
          600: '#264c49',
          700: '#1e3c3a',
        },
        paper: '#faf9f6',
      },
      fontFamily: {
        sans: ['"Inter"', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(23, 31, 30, 0.04), 0 1px 8px rgba(23, 31, 30, 0.06)',
      },
    },
  },
  plugins: [],
};

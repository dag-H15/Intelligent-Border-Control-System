/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f4f7f5',
          100: '#d7ece1',
          200: '#b2d8c3',
          300: '#7aa892',
          400: '#487d65',
          500: '#006341',
          600: '#005437',
          700: '#0e5136',
          800: '#00301e',
          900: '#002517',
          950: '#001a10',
        },
        accent: {
          green: '#006341',
          'green-soft': '#d7ece1',
          red: '#d21034',
          'red-soft': '#ffdad6',
          amber: '#e6a660',
          'amber-soft': '#fef3c7',
          blue: '#2563eb',
          'blue-soft': '#dbeafe',
          gold: '#fddd7c',
          'gold-soft': '#fff8e1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 48, 30, 0.06), 0 1px 2px -1px rgba(0, 48, 30, 0.04)',
        'card-hover': '0 4px 12px -2px rgba(0, 48, 30, 0.10), 0 2px 6px -2px rgba(0, 48, 30, 0.06)',
      },
    },
  },
  plugins: [],
};

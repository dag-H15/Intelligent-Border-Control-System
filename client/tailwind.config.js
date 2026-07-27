/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#627d98',
          500: '#486581',
          600: '#334e68',
          700: '#243b53',
          800: '#102a43',
          900: '#0a1a2f',
          950: '#06101f',
        },
        accent: {
          green: '#16a34a',
          'green-soft': '#dcfce7',
          red: '#dc2626',
          'red-soft': '#fee2e2',
          amber: '#d97706',
          'amber-soft': '#fef3c7',
          blue: '#2563eb',
          'blue-soft': '#dbeafe',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Roboto', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(16, 42, 67, 0.06), 0 1px 2px -1px rgba(16, 42, 67, 0.04)',
        'card-hover': '0 4px 12px -2px rgba(16, 42, 67, 0.10), 0 2px 6px -2px rgba(16, 42, 67, 0.06)',
      },
    },
  },
  plugins: [],
};

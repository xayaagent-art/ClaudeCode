/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        rh: {
          bg: '#0D0D0D',
          surface: '#1A1A1A',
          'surface-hover': '#222222',
          border: '#2A2A2A',
          green: '#00C805',
          red: '#EB5D2A',
          yellow: '#F6C86A',
          lime: '#D5FD51',
          text: '#FFFFFF',
          subtext: '#9B9B9B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

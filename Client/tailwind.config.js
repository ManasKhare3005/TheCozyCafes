/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cafe: {
          50: '#FAF6F0',
          100: '#F5EDE3',
          200: '#E8D5B7',
          300: '#D4A574',
          400: '#C49A6C',
          500: '#A0845C',
          600: '#8B6F47',
          700: '#6F4E37',
          800: '#5D4037',
          900: '#3E2723',
          950: '#2C1A12',
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        'warm': '0 2px 15px -3px rgba(62, 39, 35, 0.1), 0 4px 6px -4px rgba(62, 39, 35, 0.05)',
        'warm-lg': '0 10px 25px -5px rgba(62, 39, 35, 0.15), 0 8px 10px -6px rgba(62, 39, 35, 0.08)',
      },
      animation: {
        'heart-pop': 'heart-pop 0.6s ease-out forwards',
      },
      keyframes: {
        'heart-pop': {
          '0%': { opacity: '0', transform: 'scale(0)' },
          '30%': { opacity: '1', transform: 'scale(1.3)' },
          '60%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.4)' },
        },
      },
    },
  },
  plugins: [],
};

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
        // SCL Brand Colors - Premium Dark Navy Blue
        scl: {
          50: '#e8edff',
          100: '#d5deff',
          200: '#b0c0ff',
          300: '#839dff',
          400: '#6680f5',
          500: '#4c63e6',
          600: '#3b4fd4',
          700: '#2f3fb3',
          800: '#263393',
          900: '#1d2873',
          950: '#111847',
        },
        dark: {
          50: '#f0f4f8',
          100: '#dce4ef',
          200: '#b8c9df',
          300: '#8faac8',
          400: '#6b87a8',
          500: '#4e6a8a',
          600: '#3a526d',
          700: '#283b52',
          800: '#1a2744',
          850: '#142038',
          900: '#0d1729',
          950: '#060d1b',
        },
        // Accent gold for premium feel
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'slide-in': 'slideIn 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s infinite linear',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      backgroundImage: {
        'gradient-scl': 'linear-gradient(135deg, #3b4fd4 0%, #1d2873 100%)',
        'gradient-scl-light': 'linear-gradient(135deg, #4c63e6 0%, #2f3fb3 100%)',
      },
      boxShadow: {
        'scl': '0 4px 14px rgba(59, 79, 212, 0.25)',
        'scl-lg': '0 8px 25px rgba(59, 79, 212, 0.35)',
        'card-dark': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
};

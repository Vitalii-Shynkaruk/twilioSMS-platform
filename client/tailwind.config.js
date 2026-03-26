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
        // SCL Brand Colors — Dark Navy + Electric Blue
        scl: {
          50: '#e0f0ff',
          100: '#b8daf8',
          200: '#85bff0',
          300: '#4A9FFF',
          400: '#2B7FE8',
          500: '#2B7FE8',
          600: '#1A6AD0',
          700: '#1455B0',
          800: '#0F2240',
          900: '#0A1628',
          950: '#07101E',
        },
        dark: {
          50: '#FFFFFF',
          100: '#B8D4F0',
          200: '#B8D4F0',
          300: '#5A80A8',
          400: '#5A80A8',
          500: '#4A6A90',
          600: '#1A3050',
          700: '#1A3050',
          800: '#0F2240',
          850: '#0D1E35',
          900: '#07101E',
          950: '#0A1628',
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
        dm: ['DM Sans', 'system-ui', 'sans-serif'],
        'dm-mono': ['DM Mono', 'monospace'],
        'plex': ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        'plex-mono': ['IBM Plex Mono', 'monospace'],
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
        'gradient-scl': 'linear-gradient(135deg, #1A5FC8 0%, #2B7FE8 100%)',
        'gradient-scl-light': 'linear-gradient(135deg, #2B7FE8 0%, #4A9FFF 100%)',
      },
      boxShadow: {
        'scl': '0 4px 14px rgba(43, 127, 232, 0.25)',
        'scl-lg': '0 8px 25px rgba(43, 127, 232, 0.35)',
        'card-dark': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
};

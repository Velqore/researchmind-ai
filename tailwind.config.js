import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Anchor content globs to this file so Tailwind works regardless of the
// working directory the dev server / build is launched from.
const root = dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
export default {
  content: [`${root}/popup.html`, `${root}/src/**/*.{js,jsx}`],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Georgia', 'Times New Roman', 'serif'],
      },
      colors: {
        // Midnight Observatory — cosmic navy grounds
        ink: {
          950: '#05070f',
          900: '#080b16',
          800: '#111726',
          700: '#1b2338',
        },
        // Warm-gold accents (names kept so existing utilities re-skin in place)
        brand: {
          violet: '#e3bd76', // gold
          purple: '#c69a4c', // gold-deep
          blue: '#caa24f', // antique gold
          cyan: '#e0bd78', // gold-light
        },
        gold: {
          DEFAULT: '#e3bd76',
          light: '#f4d99a',
          deep: '#c69a4c',
        },
      },
      boxShadow: {
        glow: '0 0 24px rgba(227, 189, 118, 0.38)',
        'glow-sm': '0 0 12px rgba(227, 189, 118, 0.28)',
        card: '0 18px 44px rgba(0, 0, 0, 0.5)',
      },
      animation: {
        'fade-in': 'fadeIn 0.25s ease-out both',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
        'scale-in': 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        'pop': 'pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 16px rgba(227, 189, 118, 0.28)' },
          '50%': { boxShadow: '0 0 28px rgba(227, 189, 118, 0.55)' },
        },
        pop: {
          from: { opacity: '0', transform: 'scale(0.8)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
};

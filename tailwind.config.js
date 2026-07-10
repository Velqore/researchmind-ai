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
      },
      colors: {
        ink: {
          950: '#0a0714',
          900: '#0f0b1e',
          800: '#171130',
          700: '#221a45',
        },
        brand: {
          violet: '#8b5cf6',
          purple: '#a855f7',
          blue: '#3b82f6',
          cyan: '#22d3ee',
        },
      },
      boxShadow: {
        glow: '0 0 24px rgba(139, 92, 246, 0.35)',
        'glow-sm': '0 0 12px rgba(139, 92, 246, 0.25)',
        card: '0 8px 32px rgba(0, 0, 0, 0.35)',
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
          '0%, 100%': { boxShadow: '0 0 16px rgba(139, 92, 246, 0.25)' },
          '50%': { boxShadow: '0 0 28px rgba(139, 92, 246, 0.5)' },
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

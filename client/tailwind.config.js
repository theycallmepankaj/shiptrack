import animate from 'tailwindcss-animate';

const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    container: { center: true, padding: '1rem', screens: { '2xl': '1280px' } },
    extend: {
      colors: {
        primary: { DEFAULT: v('primary'), foreground: v('primary-foreground') },
        'primary-text': v('primary-text'),
        ink: v('ink'),
        surface: v('surface'),
        background: v('background'),
        muted: v('muted'),
        border: v('border'),
        ring: v('primary'),
        navy: { 900: '#0B1220', 800: '#111a2e', 700: '#17223a' },
        status: {
          booked: '#64748B',
          transit: '#3B82F6',
          out: '#FF6B2C',
          delivered: '#16A34A',
          failed: '#DC2626',
          cancelled: '#9CA3AF',
        },
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { card: '16px', DEFAULT: '10px' },
      boxShadow: {
        soft: '0 1px 2px rgb(11 18 32 / 0.04), 0 8px 24px -8px rgb(11 18 32 / 0.10)',
        lift: '0 2px 4px rgb(11 18 32 / 0.05), 0 20px 40px -12px rgb(11 18 32 / 0.18)',
        glow: '0 8px 30px -6px rgb(255 107 44 / 0.55)',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        ping2: { '75%, 100%': { transform: 'scale(2.4)', opacity: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        marquee: 'marquee 40s linear infinite',
        ping2: 'ping2 1.8s cubic-bezier(0,0,0.2,1) infinite',
      },
    },
  },
  plugins: [animate],
};

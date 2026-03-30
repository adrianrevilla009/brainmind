/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Paleta clínica — azul oscuro profesional
        brand: {
          50:  '#eef4ff',
          100: '#d9e8ff',
          200: '#bcd4fe',
          300: '#8eb5fd',
          400: '#5a8bf9',
          500: '#3366f4',
          600: '#1d47e9',
          700: '#1836d6',
          800: '#1a2fae',
          900: '#1b2d89',
          950: '#141d54',
        },
        clinical: {
          50:  '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          950: '#0a1929',
        },
        accent: {
          cyan:   '#06b6d4',
          green:  '#10b981',
          amber:  '#f59e0b',
          red:    '#ef4444',
          purple: '#8b5cf6',
        },
      },
      backgroundImage: {
        'gradient-clinical': 'linear-gradient(135deg, #1b2d89 0%, #1836d6 50%, #06b6d4 100%)',
        'gradient-card':     'linear-gradient(145deg, #ffffff 0%, #f0f4f8 100%)',
        'gradient-sidebar':  'linear-gradient(180deg, #102a43 0%, #243b53 100%)',
      },
      boxShadow: {
        'clinical':    '0 4px 24px rgba(19, 54, 214, 0.12)',
        'clinical-lg': '0 8px 40px rgba(19, 54, 214, 0.18)',
        'card':        '0 2px 12px rgba(16, 42, 67, 0.08)',
        'card-hover':  '0 8px 32px rgba(16, 42, 67, 0.14)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      animation: {
        'slide-up':    'slideUp 0.3s cubic-bezier(0.22,1,0.36,1)',
        'fade-in':     'fadeIn 0.25s ease',
        'scale-in':    'scaleIn 0.2s cubic-bezier(0.22,1,0.36,1)',
        'pulse-dot':   'pulseDot 1.5s ease-in-out infinite',
      },
      keyframes: {
        slideUp:   { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        fadeIn:    { from: { opacity: '0' }, to: { opacity: '1' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' }, to: { opacity: '1', transform: 'scale(1)' } },
        pulseDot:  { '0%,100%': { transform: 'scale(1)', opacity: '1' }, '50%': { transform: 'scale(1.4)', opacity: '0.7' } },
      },
    },
  },
  plugins: [],
}

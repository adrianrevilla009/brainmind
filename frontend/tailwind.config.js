/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      colors: {
        brand: {
          50:  '#f0f4ff',
          100: '#dce6fd',
          200: '#b9cdfb',
          300: '#87a8f8',
          400: '#5480f3',
          500: '#3660ed',
          600: '#2347d8',
          700: '#1c38b0',
          800: '#1c318e',
          900: '#1c2e6f',
          950: '#141e4a',
        },
        sage: {
          50:  '#f5f7f5',
          100: '#e6ebe5',
          200: '#ccd7cb',
          300: '#a5baa3',
          400: '#769773',
          500: '#547a51',
          600: '#40613d',
          700: '#344e32',
          800: '#2b3f29',
          900: '#253523',
          950: '#111c10',
        },
      },
    },
  },
  plugins: [],
}

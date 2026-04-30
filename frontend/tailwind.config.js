/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eef4ff',
          100: '#dbe6ff',
          200: '#bccfff',
          300: '#8eaeff',
          400: '#5e83ff',
          500: '#3a5fff',
          600: '#2541f5',
          700: '#1c30c8',
          800: '#1a2b9d',
          900: '#1b2b7c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 8px 30px rgba(0, 0, 0, 0.06)',
        glow: '0 0 0 4px rgba(58, 95, 255, 0.15)',
      },
      backgroundImage: {
        'grid-light':
          "radial-gradient(rgba(15,23,42,0.06) 1px, transparent 1px)",
        'grid-dark':
          "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};

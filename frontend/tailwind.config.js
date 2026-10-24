/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        vault: {
          ink: '#10182b',
          navy: '#101a31',
          blue: '#355be7',
          mint: '#b8f36a',
          canvas: '#f6f7fb',
        },
      },
      boxShadow: {
        panel: '0 16px 45px rgba(20, 34, 67, .07)',
      },
    },
  },
  plugins: [],
};

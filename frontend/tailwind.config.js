/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif']
      },
      colors: {
        ink: '#1F2937',
        panel: '#F7F7F2',
        line: '#D8D7CC',
        spruce: '#0F766E',
        tomato: '#C2410C'
      }
    }
  },
  plugins: []
};

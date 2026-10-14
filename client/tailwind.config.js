/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef4ff', 500: '#3b63f3', 600: '#2f4fd6', 700: '#2740ad' },
      },
    },
  },
  plugins: [],
};

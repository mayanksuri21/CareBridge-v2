/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,jsx}",
    "./src/components/**/*.{js,jsx}",
    "./src/app/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          emerald: '#087F69',
          'emerald-dark': '#066251',
          'emerald-light': '#0FA387',
          blue: '#2476D2',
          'blue-dark': '#1B5CAB',
          'blue-light': '#4A92E6',
          mint: '#E8F7F2',
          'pale-blue': '#E8F1FC',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

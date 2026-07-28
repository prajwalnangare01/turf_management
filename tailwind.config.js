/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          main: '#0b0f19',
          card: '#131b2e',
          hover: '#1c2742',
          border: '#24304f',
        }
      }
    },
  },
  plugins: [],
}

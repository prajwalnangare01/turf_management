/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#006b30',
          container: '#148641',
          fixed: '#91f9a5',
          dim: '#75dc8b',
        },
        'on-primary': {
          DEFAULT: '#ffffff',
          container: '#f7fff3',
        },
        secondary: {
          DEFAULT: '#8c5000',
          container: '#fe9400',
          fixed: '#ffdcbf',
          dim: '#ffb874',
        },
        'on-secondary': {
          DEFAULT: '#ffffff',
          container: '#633700',
        },
        tertiary: {
          DEFAULT: '#565c6a',
          container: '#6f7483',
        },
        surface: {
          DEFAULT: '#f7fafc',
          bright: '#f7fafc',
          dim: '#d7dadc',
          variant: '#e0e3e5',
          container: '#ebeef0',
          'container-low': '#f1f4f6',
          'container-lowest': '#ffffff',
          'container-high': '#e5e9eb',
          'container-highest': '#e0e3e5',
        },
        'on-surface': {
          DEFAULT: '#181c1e',
          variant: '#3f4a3f',
        },
        outline: {
          DEFAULT: '#6f7a6e',
          variant: '#becabb',
        },
        background: '#f7fafc',
        'on-background': '#181c1e',
      },
      fontFamily: {
        headline: ['"Archivo Narrow"', 'sans-serif'],
        display: ['"Archivo Narrow"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        gutter: '16px',
        'margin-mobile': '16px',
        'margin-desktop': '40px',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      }
    },
  },
  plugins: [],
}

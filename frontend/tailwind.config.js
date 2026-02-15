// tailwind.config.js
import { defineConfig } from '@tailwindcss/vite'

export default defineConfig({
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontSize: {
        'xs': '11px',
        'sm': '12px',
        'base': '13px',
        'md': '14px',
        'lg': '15px',
        'xl': '16px',
        '2xl': '18px',
        '3xl': '20px'
      },
      spacing: {
        'xs': '4px',
        'sm': '6px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px'
      },
      padding: {
        'card': '12px',
        'section': '16px',
        'compact': '8px'
      },
      colors: {
        'primary-green': '#28a745',
        'primary-orange': '#fd7e14',
        'light-bg': '#f8f9fa',
        'card-bg': '#ffffff',
        'text': '#333333',
        'dark': '#111111'
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0,0,0,0.06)',
        'hover': '0 5px 15px rgba(0,0,0,0.1)'
      }
    }
  }
})

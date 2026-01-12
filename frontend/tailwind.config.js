// tailwind.config.js
import { defineConfig } from '@tailwindcss/vite'

export default defineConfig({
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
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

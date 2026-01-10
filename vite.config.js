// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    strictPort: true,
    open: true
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})

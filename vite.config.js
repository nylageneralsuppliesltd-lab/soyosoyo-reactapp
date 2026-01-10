// vite.config.js - Clean & Working for SoyoSoyo SACCO

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],

  // Base path for GitHub Pages (change to your repo name)
  // Example: if repo is https://github.com/username/soyosoyobank → base: '/soyosoyobank/'
  base: '/',   // ← CHANGE THIS to match your actual repo name

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@components': path.resolve(__dirname, './src/components'),
      '@styles': path.resolve(__dirname, './src/styles'),
    },
  },

  server: {
    port: 5173,
    open: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
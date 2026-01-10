// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({

    base: '/',

  plugins: [react()],
  
  // IMPORTANT: Set base to your GitHub Pages repo name
  // If your repo is https://github.com/yourusername/soyosoyobank → base: '/soyosoyobank/'
  // If deployed to custom domain api.soyosoyosacco.com → base: '/'
  base: '/',

   // <-- CHANGE THIS to match your actual repo name or leave '/' for custom domain
  
  build: {
    // Ensure correct assets path
    outDir: 'dist',
    assetsDir: 'assets',
  },
  
  server: {
    port: 5173,
    open: true,
  },
})
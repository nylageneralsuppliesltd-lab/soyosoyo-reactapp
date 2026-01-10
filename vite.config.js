import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Use this config to make GitHub Pages work with a repo named "soyosoyo-reactapp"
export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/soyosoyo-reactapp/',

  plugins: [react()],

  server: {
    port: 5173,
    strictPort: true,
    open: true,
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}))

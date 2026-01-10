// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => ({
<<<<<<< HEAD
    base: '/',

=======
  base: mode === 'development' ? '/' : '/soyosoyo-reactapp/', // GitHub Pages
>>>>>>> 8cd1a6e (Update dashboard routing and Vite config for GitHub Pages)
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    open: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}));

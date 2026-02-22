// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import tailwindcss from '@tailwindcss/vite'; // ✅ Tailwind v4 plugin for Vite

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),       // React plugin
    tailwindcss(), // Tailwind v4 plugin
  ],
  base: '/', // keep '/' for Render or custom domain. For GitHub Pages: '/repo-name/'
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // shortcut for imports
    },
  },
  publicDir: 'public', // Copy contents of public/ to dist/ during build (includes _redirects)
  build: {
    outDir: 'dist', // production build output
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
    },
    copyPublicDir: true, // Ensure public files are copied (for _redirects)
  },
  server: {
    port: 5173,  // dev server port
    open: true,  // auto open browser
    proxy: {
      // Proxy API calls to the Nest backend during development
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  css: {
    // optional: enable CSS modules for *.module.css files
    modules: {
      localsConvention: 'camelCase',
    },
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/styles/variables.scss";`, // if you use global SCSS variables
      },
    },
  },
});

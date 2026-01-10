import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

<<<<<<< HEAD
export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
=======
export default defineConfig({
  base: '/soyosoyo-reactapp/', // 🔥 REQUIRED for GitHub Pages

  plugins: [react()],
>>>>>>> 0d17ac8 (Fix routing for GitHub Pages using HashRouter)

    /**
     * IMPORTANT:
     * - Local dev → base '/'
     * - Production (Render / GitHub Pages) → base '/'
     *   (Render serves from root, not repo name)
     */
    base: mode === 'development' ? '/' : '/',

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
  }
})

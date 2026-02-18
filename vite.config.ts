import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  build: { outDir: 'dist', chunkSizeWarningLimit: 1000 },
  resolve: {
    alias: { '@shared': path.resolve(__dirname, 'shared') },
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8788', changeOrigin: true },
    },
  },
})

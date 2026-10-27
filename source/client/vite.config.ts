import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_SERVER_PROXY || 'http://localhost:8080', ws: true, changeOrigin: true },
      '/ws': { target: process.env.VITE_SERVER_PROXY || 'http://localhost:8080', ws: true, changeOrigin: true }
    }
  }
})

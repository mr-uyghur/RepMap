import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // usePolling ensures file-system change events work inside Docker on all
    // operating systems (Linux bind mounts, macOS, Windows) where inotify is
    // unavailable or unreliable.
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})

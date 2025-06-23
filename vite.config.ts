import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0', // Expose to all network interfaces
    port: 3000,
    strictPort: true, // Allow fallback to another port if 5173 is in use
    allowedHosts: ['coco.bragai.tech'],
  }
})

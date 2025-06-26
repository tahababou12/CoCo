import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: '0.0.0.0', // Expose to all network interfaces
    port: 5174,
    strictPort: true, // Allow fallback to another port if 5173 is in use
    allowedHosts: ['coco.bragai.tech'],
  }
})

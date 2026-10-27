import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'

// In development the React app runs on :5173 and passes /api calls (and the
// live stream) to the Express server on :5050.
// `npm run dev:phone` (mode "phone") serves over HTTPS on your Wi-Fi, so a
// phone can use the camera, microphone and alerts.
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'phone' ? [basicSsl({ name: 'opd-saathi' })] : [])],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:5050', changeOrigin: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:5050', changeOrigin: true } },
  },
}))
